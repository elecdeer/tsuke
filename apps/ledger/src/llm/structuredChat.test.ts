import * as v from "valibot";
import { describe, expect, test, vi } from "vite-plus/test";
import { createArrayItemScanner, streamStructuredItems } from "./structuredChat.ts";

const scanAll = (chunks: string[]): string[] => {
  const items: string[] = [];
  const scan = createArrayItemScanner((item) => items.push(item));
  chunks.forEach(scan);
  return items;
};

describe("createArrayItemScanner", () => {
  test("要素が閉じるたびに文字列を渡す", () => {
    expect(scanAll(['{"entries":[{"id":0},{"id":1}]}'])).toEqual(['{"id":0}', '{"id":1}']);
  });

  test("要素の途中で切れても 1 文字ずつ届いても同じ結果になる", () => {
    const json = '{"entries":[{"id":0,"name":"A"},{"id":1,"name":"B"}]}';

    expect(scanAll(json.split(""))).toEqual(['{"id":0,"name":"A"}', '{"id":1,"name":"B"}']);
  });

  test("文字列の中の括弧と引用符は数えない", () => {
    const item = '{"name":"a}]\\"{["}';

    expect(scanAll([`{"entries":[${item}]}`])).toEqual([item]);
  });

  test("要素の中の入れ子はまとめて 1 つの要素にする", () => {
    const item = '{"tags":[{"a":1}],"b":{"c":2}}';

    expect(scanAll([`{"entries":[${item}]}`])).toEqual([item]);
  });

  test("閉じていない要素は渡さない", () => {
    expect(scanAll(['{"entries":[{"id":0},{"id":'])).toEqual(['{"id":0}']);
  });
});

describe("streamStructuredItems", () => {
  const encoder = new TextEncoder();
  const ItemSchema = v.strictObject({ id: v.number() });

  /**
   * 渡したバイト列の塊をそのまま流す本文を作る。
   */
  const bodyOf = (chunks: Uint8Array[]) =>
    new ReadableStream<Uint8Array>({
      start: (controller) => {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    });

  const run = async (output: unknown) => {
    const items: Array<v.InferOutput<typeof ItemSchema>> = [];
    const ai = { run: vi.fn(async () => output) };
    await streamStructuredItems({
      ai,
      model: "test",
      buildPrompt: () => ({ system: "s", prompt: "p" }),
      schemaName: "T",
      jsonSchema: {},
      itemSchema: ItemSchema,
      onItem: (item) => items.push(item),
    });
    return { items, ai };
  };

  const sse = (content: string) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

  test("Stream を指定して呼び、行の途中で切れた応答も読む", async () => {
    const text = sse('{"entries":[{"id":0},') + sse('{"id":1}]}') + "data: [DONE]\n\n";
    const bytes = encoder.encode(text);

    const { items, ai } = await run(bodyOf([bytes.slice(0, 20), bytes.slice(20)]));

    expect(items).toEqual([{ id: 0 }, { id: 1 }]);
    expect(ai.run).toHaveBeenCalledWith(
      "test",
      expect.objectContaining({ stream: true }),
      expect.anything(),
    );
  });

  test("response で本文を返すモデルの Stream も読む", async () => {
    const text = `data: ${JSON.stringify({ response: '{"entries":[{"id":0}]}' })}\n\n`;

    expect((await run(bodyOf([encoder.encode(text)]))).items).toEqual([{ id: 0 }]);
  });

  test("読めない行とスキーマに合わない要素は飛ばす", async () => {
    const text = `data: {broken\n\n: comment\n\n${sse('{"entries":[{"id":"x"},{"id":1}]}')}`;

    expect((await run(bodyOf([encoder.encode(text)]))).items).toEqual([{ id: 1 }]);
  });

  test("Stream で応答しないモデルは全体から順に渡す", async () => {
    const { items } = await run({ response: { entries: [{ id: 0 }, { id: 1 }] } });

    expect(items).toEqual([{ id: 0 }, { id: 1 }]);
  });
});

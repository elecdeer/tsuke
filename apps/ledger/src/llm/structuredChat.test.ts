import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { createFakeModelProvider } from "./fakeModelProvider.ts";
import { runStructuredChat, streamStructuredItems } from "./structuredChat.ts";

const IMAGE = "data:image/jpeg;base64,/9j/4AAQ";

describe("runStructuredChat", () => {
  const ResultSchema = v.strictObject({ id: v.number(), name: v.string() });

  /**
   * 偽のモデルで runStructuredChat を呼ぶ。
   */
  const run = async (
    response: string,
    extra: { reasoningEffort?: "low"; images?: string[] } = {},
  ) => {
    const { ai, calls } = createFakeModelProvider(() => response);
    const result = await runStructuredChat({
      ai,
      model: "test-model",
      buildPrompt: () => ({ system: "s", prompt: "p", images: extra.images }),
      schemaName: "Result",
      schema: ResultSchema,
      reasoningEffort: extra.reasoningEffort,
    });
    return { result, calls };
  };

  test("スキーマの名前を付けて出力の形を強制し、検証した結果を返す", async () => {
    const { result, calls } = await run('{"id":1,"name":"A"}');

    expect(result.object).toEqual({ id: 1, name: "A" });
    expect(calls).toEqual([
      expect.objectContaining({ modelId: "test-model", schemaName: "Result" }),
    ]);
    expect(calls[0]?.options.responseFormat).toMatchObject({
      type: "json",
      schema: { type: "object", required: ["id", "name"] },
    });
  });

  test("推論量を指定したらモデルに渡し、指定しなければ渡さない", async () => {
    const withEffort = await run('{"id":1,"name":"A"}', { reasoningEffort: "low" });
    const withoutEffort = await run('{"id":1,"name":"A"}');

    expect(withEffort.calls[0]?.reasoningEffort).toBe("low");
    expect(withoutEffort.calls[0]?.reasoningEffort).toBeUndefined();
  });

  test("system と user のメッセージを送り、画像は本文の後に添える", async () => {
    const { calls } = await run('{"id":1,"name":"A"}', { images: [IMAGE] });

    expect(calls[0]?.options.prompt).toEqual([
      { role: "system", content: "s" },
      {
        role: "user",
        content: [
          { type: "text", text: "p" },
          expect.objectContaining({ type: "file", mediaType: "image/jpeg" }),
        ],
      },
    ]);
  });

  test("スキーマに合わない出力ならエラーにする", async () => {
    await expect(run('{"id":"x","name":"A"}')).rejects.toThrow();
  });
});

describe("streamStructuredItems", () => {
  const ItemSchema = v.strictObject({ id: v.number() });

  /**
   * 偽のモデルの Stream を読み、届いた要素を集める。
   */
  const collect = async (respond: () => string[]) => {
    const { ai, calls } = createFakeModelProvider(respond);
    const items: Array<v.InferOutput<typeof ItemSchema>> = [];
    await streamStructuredItems({
      ai,
      model: "test-model",
      buildPrompt: () => ({ system: "s", prompt: "p" }),
      schemaName: "Items",
      itemSchema: ItemSchema,
      reasoningEffort: "low",
      onItem: (item) => items.push(item),
    });
    return { items, calls };
  };

  test("要素の途中で切れて届いても、要素が閉じるたびに検証して渡す", async () => {
    const { items, calls } = await collect(() => ['{"elements":[{"id":0},{"i', 'd":1}]}']);

    expect(items).toEqual([{ id: 0 }, { id: 1 }]);
    expect(calls[0]).toMatchObject({ schemaName: "Items", reasoningEffort: "low" });
  });

  test("スキーマに合わない要素は飛ばす", async () => {
    const { items } = await collect(() => ['{"elements":[{"id":"x"},{"id":1}]}']);

    expect(items).toEqual([{ id: 1 }]);
  });

  test("モデルの呼び出しが失敗したらエラーにする", async () => {
    await expect(
      collect(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

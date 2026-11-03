/**
 * レシートの写真からの抽出のプロンプトと、画像の入力の検証のテスト。
 */
import * as v from "valibot";
import { describe, expect, test, vi } from "vite-plus/test";
import {
  buildReceiptPrompt,
  ReceiptImageSchema,
  runExtractReceipt,
  type ExtractReceiptContext,
} from "./extractReceipt.ts";

const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

const baseInput = (overrides: Partial<ExtractReceiptContext> = {}): ExtractReceiptContext => ({
  image: IMAGE,
  today: "2026-10-29",
  categories: [{ id: 101, name: "食費", genres: [{ id: 10101, name: "食料品" }] }],
  accounts: [
    { id: 1, name: "現金" },
    { id: 2, name: "楽天カード" },
  ],
  places: [{ id: 1, name: "スーパーA", lastUsedOn: "2026-10-20", useCount: 5 }],
  ...overrides,
});

const extracted = {
  date: "2026-10-27",
  accountId: 2,
  placeName: "スーパーA",
  items: [{ name: "牛乳", amount: 248, memo: null, genreId: 10101 }],
  confidence: "high",
  reasoning: "receipt",
};

describe("buildReceiptPrompt", () => {
  test("画像を 1 枚添える", () => {
    const { images } = buildReceiptPrompt(baseInput());
    expect(images).toEqual([IMAGE]);
  });

  test("今日の日付と、カテゴリ・口座・店舗の候補を本文に並べる", () => {
    const { prompt } = buildReceiptPrompt(baseInput());
    expect(prompt).toContain("Today: 2026-10-29\n");
    expect(prompt).toContain("101=食費: 10101=食料品");
    expect(prompt).toContain("1=現金, 2=楽天カード");
    expect(prompt).toContain("スーパーA [5x, 2026-10-20]");
  });

  test("キャッシュが効くよう、変わりにくい候補を前に、日付と店舗を後ろに並べる", () => {
    const { prompt } = buildReceiptPrompt(baseInput());
    const positions = ["## Categories", "## Accounts", "Today:", "## Recent stores"].map((label) =>
      prompt.indexOf(label),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions[0]).toBe(0);
  });

  test("日付や店舗の使用回数が違っても、カテゴリと口座までのプロンプトは同じになる", () => {
    const before = buildReceiptPrompt(baseInput()).prompt;
    const after = buildReceiptPrompt(
      baseInput({
        today: "2026-10-30",
        places: [{ id: 1, name: "スーパーA", lastUsedOn: "2026-10-30", useCount: 6 }],
      }),
    ).prompt;
    const stablePrefix = before.slice(0, before.indexOf("Today:"));
    expect(after.startsWith(stablePrefix)).toBe(true);
  });

  test("合計・お預り・お釣りの行を品目にしないよう指示する", () => {
    const { system } = buildReceiptPrompt(baseInput());
    expect(system).toContain("Do NOT make items from subtotal, total, tax, tendered");
  });
});

describe("runExtractReceipt", () => {
  test("user メッセージに文字と画像を content parts で入れ、抽出結果を返す", async () => {
    const ai = {
      run: vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify(extracted) } }] })),
    };

    const { object } = await runExtractReceipt({ ai, model: "test-model", input: baseInput() });

    expect(object).toEqual(extracted);
    expect(ai.run).toHaveBeenCalledWith(
      "test-model",
      expect.objectContaining({
        messages: [
          expect.objectContaining({ role: "system" }),
          {
            role: "user",
            content: [
              { type: "text", text: expect.stringContaining("Today: 2026-10-29") },
              { type: "image_url", image_url: { url: IMAGE } },
            ],
          },
        ],
      }),
      { signal: undefined },
    );
  });

  test("待ち時間を短くするため推論量を none にして送る", async () => {
    const ai = {
      run: vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify(extracted) } }] })),
    };

    await runExtractReceipt({ ai, model: "test-model", input: baseInput() });

    expect(ai.run).toHaveBeenCalledWith(
      "test-model",
      expect.objectContaining({ reasoning_effort: "none" }),
      { signal: undefined },
    );
  });
});

describe("ReceiptImageSchema", () => {
  test("JPEG・PNG・WebP の data URL を受け付ける", () => {
    expect(v.is(ReceiptImageSchema, IMAGE)).toBe(true);
    expect(v.is(ReceiptImageSchema, "data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(v.is(ReceiptImageSchema, "data:image/webp;base64,UklGRg==")).toBe(true);
  });

  test("画像でない data URL や URL は受け付けない", () => {
    expect(v.is(ReceiptImageSchema, "data:text/plain;base64,aGVsbG8=")).toBe(false);
    expect(v.is(ReceiptImageSchema, "https://example.com/receipt.jpg")).toBe(false);
  });

  test("上限より長い画像は受け付けない", () => {
    const tooLong = `data:image/jpeg;base64,${"A".repeat(4_000_000)}`;
    expect(v.is(ReceiptImageSchema, tooLong)).toBe(false);
  });
});

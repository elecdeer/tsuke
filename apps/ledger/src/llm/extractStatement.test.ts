/**
 * buildStatementPrompt のフォーマット回帰テストと、明細抽出の Workers AI 呼び出しのテスト。
 */
import { describe, expect, test, vi } from "vite-plus/test";
import { ACCOUNT_NOTES_RULE } from "./extractPayment.ts";
import {
  buildStatementPrompt,
  resolveStatementPlaceName,
  runExtractStatement,
  type ExtractStatementContext,
} from "./extractStatement.ts";

const baseInput = (overrides: Partial<ExtractStatementContext> = {}): ExtractStatementContext => ({
  pageContent: {
    url: "https://card.example.com/statement/2026-05",
    title: "ご利用明細",
    ariaSnapshot: "table: ご利用明細\nrow: 5/10 ｽｰﾊﾟｰA 1,000",
    collectedAt: "2026-06-01T00:00:00Z",
  },
  categories: [{ id: 101, name: "食費", genres: [{ id: 10101, name: "食料品" }] }],
  accounts: [{ id: 2, name: "カードA" }],
  places: Array.from({ length: 250 }, (_, index) => ({
    id: index + 1,
    name: `店舗${index + 1}`,
    lastUsedOn: "2026-05-01",
    useCount: 1,
  })),
  ...overrides,
});

const extracted = {
  accountId: 2,
  rows: [{ date: "2026-05-10", place: "ｽｰﾊﾟｰA", placeName: "店舗1", amount: 1000, genreId: 10101 }],
  confidence: "high",
  reasoning: "明細の表から読み取った",
};

describe("buildStatementPrompt", () => {
  test("利用先を既存の店舗名に照合するよう指示する", () => {
    const { system } = buildStatementPrompt(baseInput());
    expect(system).toContain("`placeName`: the name of the store in `Stores`");
    expect(system).toContain("Skip refunds");
  });

  test("店舗は 1 会計分より多い 200 件まで候補に出す", () => {
    const { prompt } = buildStatementPrompt(baseInput());
    expect(prompt).toContain("店舗200 [1x, 2026-05-01]");
    expect(prompt).not.toContain("店舗201 ");
  });

  test("カテゴリ・口座・ページの内容がプロンプトに入る", () => {
    const { prompt } = buildStatementPrompt(baseInput());
    expect(prompt).toContain("101=食費: 10101=食料品");
    expect(prompt).toContain("2=カードA");
    expect(prompt).toContain("row: 5/10 ｽｰﾊﾟｰA 1,000");
  });
});

describe("口座のヒント", () => {
  test("口座のヒントを口座の行に添え、読み方を指示する", () => {
    const { system, prompt } = buildStatementPrompt(
      baseInput({ accounts: [{ id: 2, name: "カードA", aiHint: "明細の末尾 1234 はこのカード" }] }),
    );
    expect(system).toContain(ACCOUNT_NOTES_RULE);
    expect(prompt).toContain("2=カードA; hint: 明細の末尾 1234 はこのカード");
  });
});

describe("runExtractStatement", () => {
  test("ExtractedStatement のスキーマを強制し、検証した結果を返す", async () => {
    const ai = {
      run: vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify(extracted) } }] })),
    };

    const { object } = await runExtractStatement({ ai, model: "test-model", input: baseInput() });

    expect(object).toEqual(extracted);
    expect(ai.run).toHaveBeenCalledWith(
      "test-model",
      expect.objectContaining({
        response_format: expect.objectContaining({
          json_schema: expect.objectContaining({ name: "ExtractedStatement", strict: true }),
        }),
      }),
      { signal: undefined },
    );
  });

  test("スキーマに合わない出力ならエラーにする", async () => {
    const ai = { run: vi.fn(async () => ({ response: { ...extracted, rows: "none" } })) };

    await expect(
      runExtractStatement({ ai, model: "test-model", input: baseInput() }),
    ).rejects.toThrow("Invalid type");
  });
});

describe("resolveStatementPlaceName", () => {
  const places = [
    { id: 1, name: "Amazon", lastUsedOn: "2026-05-01", useCount: 1, aliases: ["AMAZON.CO.JP"] },
  ];

  test("AI が別名を返したら店舗名に直す", () => {
    expect(resolveStatementPlaceName({ place: "x", placeName: "AMAZON.CO.JP" }, places)).toBe(
      "Amazon",
    );
  });

  test("AI が店舗を選べなくても、明細の表記が別名に一致すれば店舗が決まる", () => {
    expect(resolveStatementPlaceName({ place: "AMAZON.CO.JP", placeName: null }, places)).toBe(
      "Amazon",
    );
  });

  test("明細の表記も別名に一致しなければ null のままにする", () => {
    expect(resolveStatementPlaceName({ place: "知らない店", placeName: null }, places)).toBeNull();
    expect(resolveStatementPlaceName({ place: null, placeName: null }, places)).toBeNull();
  });

  test("推論量を指定したら送る", async () => {
    const ai = {
      run: vi.fn(async () => {
        throw new Error("boom");
      }),
    };

    await expect(
      runExtractStatement({ ai, model: "test-model", reasoningEffort: "low", input: baseInput() }),
    ).rejects.toThrow("boom");

    expect(ai.run).toHaveBeenCalledWith(
      "test-model",
      expect.objectContaining({ reasoning_effort: "low" }),
      { signal: undefined },
    );
  });
});

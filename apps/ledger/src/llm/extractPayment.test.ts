/**
 * buildPrompt のフォーマット回帰テストと、Workers AI のレスポンスの取り出しのテスト。
 *
 * LLM の品質はモデル次第なので動作確認はできないが、プロンプト中に渡している
 * カテゴリ/口座/店舗の表現が崩れていないことを確認する。
 */
import { describe, expect, test } from "vite-plus/test";
import { createFakeModelProvider } from "./fakeModelProvider.ts";
import {
  ACCOUNT_NOTES_RULE,
  buildPrompt,
  formatAccountsForPrompt,
  formatRecentPlacesForPrompt,
  PAYMENT_METHOD_RULE,
  resolvePlaceAlias,
  runExtractPayment,
  TAX_ITEM_RULE,
  TOTAL_RULE,
  type ExtractPaymentContext,
  type PlaceForPrompt,
} from "./extractPayment.ts";

const baseInput = (overrides: Partial<ExtractPaymentContext> = {}): ExtractPaymentContext => ({
  pageContent: {
    url: "https://example.com/order/1",
    title: "Order",
    ariaSnapshot: "heading: Order\ntext: total 1000",
    collectedAt: "2026-06-01T00:00:00Z",
  },
  categories: [
    {
      id: 101,
      name: "食費",
      genres: [
        { id: 10101, name: "食料品" },
        { id: 10102, name: "カフェ" },
      ],
    },
    { id: 102, name: "日用品", genres: [] },
  ],
  accounts: [
    { id: 1, name: "現金" },
    { id: 2, name: "Suica" },
  ],
  places: [
    { id: 1, name: "スーパーA", lastUsedOn: "2026-05-30", useCount: 5 },
    { id: 2, name: "コンビニB", lastUsedOn: "2026-05-29", useCount: 3 },
    { id: 3, name: "行ったことのない店", lastUsedOn: null, useCount: 0 },
  ],
  ...overrides,
});

const extracted = {
  date: "2026-06-01",
  paymentMethod: "現金",
  accountId: 1,
  accountMatch: "explicit",
  placeName: "スーパーA",
  items: [{ name: "牛乳", amount: 200, memo: null, genreId: 10101 }],
  total: 200,
  confidence: "high",
  reasoning: "receipt",
};

describe("buildPrompt", () => {
  test("カテゴリを 1 行 1 カテゴリで、内訳を ID=名前で列挙する", () => {
    const { prompt } = buildPrompt(baseInput());
    expect(prompt).toContain("101=食費: 10101=食料品, 10102=カフェ");
    expect(prompt).toContain("102=日用品: (none)");
  });

  test("口座は ID=name を 1 行ずつ並べる", () => {
    const { prompt } = buildPrompt(baseInput());
    expect(prompt).toContain("1=現金\n2=Suica");
  });

  test("店舗は使用回数・最終日とともに 1 行ずつ並べ、使ったことのない店舗は出さない", () => {
    const { prompt } = buildPrompt(baseInput());
    expect(prompt).toContain("スーパーA [5x, 2026-05-30]\nコンビニB [3x, 2026-05-29]");
    expect(prompt).not.toContain("行ったことのない店");
  });

  test("店舗が無いときは (none) を出す", () => {
    const { prompt } = buildPrompt(baseInput({ places: [] }));
    expect(prompt).toContain("## Recent stores (format: `name [count, lastUsedOn]`)\n(none)");
  });

  test("ARIA snapshot が ariaSnapshot ブロックに含まれる", () => {
    const { prompt } = buildPrompt(baseInput());
    expect(prompt).toContain("heading: Order\ntext: total 1000");
  });

  test("URL/Title/Collected at がプロンプト先頭に並ぶ", () => {
    const { prompt } = buildPrompt(baseInput());
    expect(prompt.startsWith("URL: https://example.com/order/1\nTitle: Order\nCollected at:")).toBe(
      true,
    );
  });

  test("system プロンプトに主要ルールが入っている", () => {
    const { system } = buildPrompt(baseInput());
    expect(system).toContain("Extract payment info");
    expect(system).toContain("YYYY-MM-DD");
    expect(system).toContain("`items` is never empty");
  });

  test("値引きは値引きの対象と同じ内訳にするよう指示する", () => {
    const { system } = buildPrompt(baseInput());
    expect(system).toContain("A discount item takes the same `genreId` as the item it discounts.");
  });

  test("合計を品目から計算せず、表示どおりに読むよう指示する", () => {
    const { system } = buildPrompt(baseInput());
    expect(system).toContain(TOTAL_RULE);
  });

  test("外税の税は品目に配分せず、税の品目として出すよう指示する", () => {
    const { system } = buildPrompt(baseInput());
    expect(system).toContain(TAX_ITEM_RULE);
  });

  test("支払い方法の表記と、口座を表記から決めきれたかを答えるよう指示する", () => {
    const { system } = buildPrompt(baseInput());
    expect(system).toContain(PAYMENT_METHOD_RULE);
  });
});

describe("runExtractPayment", () => {
  test("ExtractedPayment のスキーマを強制し、検証した結果を返す", async () => {
    const { ai, calls } = createFakeModelProvider(() => JSON.stringify(extracted));

    const { object } = await runExtractPayment({ ai, model: "test-model", input: baseInput() });

    expect(object).toEqual(extracted);
    expect(calls).toEqual([
      expect.objectContaining({ modelId: "test-model", schemaName: "ExtractedPayment" }),
    ]);
  });

  test("推論量を指定すると、そのまま渡す", async () => {
    const { ai, calls } = createFakeModelProvider(() => JSON.stringify(extracted));

    await runExtractPayment({
      ai,
      model: "test-model",
      reasoningEffort: "low",
      input: baseInput(),
    });

    expect(calls[0]?.reasoningEffort).toBe("low");
  });

  test("推論量は指定せずモデルの既定に任せる", async () => {
    const { ai, calls } = createFakeModelProvider(() => JSON.stringify(extracted));

    await runExtractPayment({ ai, model: "test-model", input: baseInput() });

    expect(calls[0]?.reasoningEffort).toBeUndefined();
  });

  test("口座の決め方が explicit / inferred / null 以外ならエラーにする", async () => {
    const { ai } = createFakeModelProvider(() =>
      JSON.stringify({ ...extracted, accountMatch: "guess" }),
    );

    await expect(
      runExtractPayment({ ai, model: "test-model", input: baseInput() }),
    ).rejects.toThrow();
  });

  test("スキーマに合わない出力ならエラーにする", async () => {
    const { ai } = createFakeModelProvider(() =>
      JSON.stringify({ ...extracted, confidence: "unknown" }),
    );

    await expect(
      runExtractPayment({ ai, model: "test-model", input: baseInput() }),
    ).rejects.toThrow();
  });
});

describe("口座のヒント", () => {
  test("ヒントのある口座の行にだけ添える", () => {
    expect(
      formatAccountsForPrompt([
        { id: 1, name: "現金", aiHint: null },
        { id: 2, name: "楽天カード", aiHint: "VISA 1234 はこのカード" },
      ]),
    ).toBe("1=現金\n2=楽天カード; hint: VISA 1234 はこのカード");
  });

  test("口座が無いときは (none) を出す", () => {
    expect(formatAccountsForPrompt([])).toBe("(none)");
  });

  test("ヒントの読み方を system プロンプトで指示する", () => {
    const { system } = buildPrompt(baseInput());
    expect(system).toContain(ACCOUNT_NOTES_RULE);
  });
});

describe("店舗の別名とヒント", () => {
  const place = (name: string, overrides: Partial<PlaceForPrompt> = {}): PlaceForPrompt => ({
    id: 1,
    name,
    lastUsedOn: "2026-05-01",
    useCount: 1,
    ...overrides,
  });

  test("別名とヒントを店舗の行に添える", () => {
    expect(
      formatRecentPlacesForPrompt([
        place("Amazon", { aliases: ["AMAZON.CO.JP", "ｱﾏｿﾞﾝ"], aiHint: "書籍は除く" }),
      ]),
    ).toBe("Amazon [1x, 2026-05-01]; aka: AMAZON.CO.JP / ｱﾏｿﾞﾝ; hint: 書籍は除く");
  });

  test("別名やヒントのある店舗は、上限を超えていても未使用でも候補に入れる", () => {
    const lines = formatRecentPlacesForPrompt(
      [
        place("最近の店"),
        place("上限の外の店"),
        place("上限の外の別名の店", { aliases: ["別名"] }),
        place("未使用のヒントの店", { lastUsedOn: null, useCount: 0, aiHint: "ヒント" }),
        place("未使用の店", { lastUsedOn: null, useCount: 0 }),
      ],
      1,
    ).split("\n");

    expect(lines).toEqual([
      "最近の店 [1x, 2026-05-01]",
      "上限の外の別名の店 [1x, 2026-05-01]; aka: 別名",
      "未使用のヒントの店 [0x, never]; hint: ヒント",
    ]);
  });

  describe("resolvePlaceAlias", () => {
    const places = [place("Amazon", { aliases: ["AMAZON.CO.JP", "ｱﾏｿﾞﾝ"] }), place("アマゾン")];

    test("別名なら店舗名に直す。全角・半角と大文字・小文字の違いは無視する", () => {
      expect(resolvePlaceAlias("amazon.co.jp", places)).toBe("Amazon");
      expect(resolvePlaceAlias("ＡＭＡＺＯＮ．ＣＯ．ＪＰ", places)).toBe("Amazon");
    });

    test("店舗名と完全に一致すれば、別の店舗の別名に似ていてもそのまま返す", () => {
      expect(resolvePlaceAlias("アマゾン", places)).toBe("アマゾン");
    });

    test("どれにも当たらなければそのまま返し、null は null のまま返す", () => {
      expect(resolvePlaceAlias("新しい店", places)).toBe("新しい店");
      expect(resolvePlaceAlias(null, places)).toBeNull();
    });
  });
});

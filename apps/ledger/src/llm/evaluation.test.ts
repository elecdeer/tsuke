import { describe, expect, test } from "vite-plus/test";
import { compareExtraction } from "./evaluation.ts";
import type { ExtractedPayment } from "./extractPayment.ts";

const actual: ExtractedPayment = {
  date: "2026-05-29",
  paymentMethod: "クレジットカード",
  accountId: 1,
  accountMatch: "inferred",
  placeName: "Amazon.co.jp",
  items: [
    { name: "洗剤", amount: 2299, memo: null, genreId: 10 },
    { name: "シャンプー", amount: 2047, memo: null, genreId: 11 },
  ],
  total: 4346,
  confidence: "high",
  reasoning: "注文の詳細から読み取った",
};

describe("compareExtraction", () => {
  test("期待に書いた項目だけを比べる", () => {
    expect(compareExtraction({ date: "2026-05-29", accountId: 2 }, actual)).toEqual({
      matched: 1,
      total: 2,
      diffs: [{ field: "accountId", expected: 2, actual: 1 }],
    });
  });

  test("合計も比べる", () => {
    expect(compareExtraction({ total: 4000 }, actual)).toEqual({
      matched: 0,
      total: 1,
      diffs: [{ field: "total", expected: 4000, actual: 4346 }],
    });
  });

  test("品目は、期待に書いた項目が順にすべて一致すれば一致とする", () => {
    const result = compareExtraction(
      {
        items: [
          { name: "洗剤", amount: 2299 },
          { name: "シャンプー", amount: 2047, memo: null },
        ],
      },
      actual,
    );

    expect(result).toEqual({ matched: 1, total: 1, diffs: [] });
  });

  test("品目の数が違えば不一致とする", () => {
    const result = compareExtraction({ items: [{ name: "洗剤" }] }, actual);

    expect(result.matched).toBe(0);
    expect(result.diffs.map((diff) => diff.field)).toEqual(["items"]);
  });

  test("品目の項目が 1 つでも違えば不一致とする", () => {
    const result = compareExtraction({ items: [{ amount: 2299 }, { genreId: 12 }] }, actual);

    expect(result.matched).toBe(0);
  });
});

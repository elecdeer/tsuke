import type { ExtractedPayment } from "./extractPayment.ts";

/** 事例で期待する抽出結果。書いた項目だけを比べる。品目も、書いた項目だけを比べる */
export type ExpectedPayment = Partial<Omit<ExtractedPayment, "items">> & {
  items?: Partial<ExtractedPayment["items"][number]>[];
};

/** 比べる項目。confidence と reasoning はモデルの判断なので比べない */
export const EVAL_FIELDS = ["date", "accountId", "placeName", "total", "items"] as const;

export type FieldDiff = { field: string; expected: unknown; actual: unknown };

/**
 * 期待する品目と実際の品目を比べる。数が同じで、各品目の期待する項目がすべて一致すれば true。
 */
const itemsMatch = (
  expected: NonNullable<ExpectedPayment["items"]>,
  actual: ExtractedPayment["items"],
): boolean =>
  expected.length === actual.length &&
  expected.every((expectedItem, index) => {
    const actualItem = actual[index];
    if (actualItem === undefined) return false;
    const actualValues = new Map<string, unknown>(Object.entries(actualItem));
    return Object.entries(expectedItem).every(([key, value]) => actualValues.get(key) === value);
  });

/**
 * 抽出結果を期待する値と比べ、比べた項目の数・一致した数・違った項目を返す。期待に書いていない項目は比べない。
 */
export const compareExtraction = (
  expected: ExpectedPayment,
  actual: ExtractedPayment,
): { matched: number; total: number; diffs: FieldDiff[] } => {
  let matched = 0;
  let total = 0;
  const diffs: FieldDiff[] = [];
  for (const field of EVAL_FIELDS) {
    const expectedValue = expected[field];
    if (expectedValue === undefined) continue;
    total++;
    const actualValue = actual[field];
    const ok =
      field === "items" && Array.isArray(expectedValue)
        ? itemsMatch(expectedValue, actual.items)
        : expectedValue === actualValue;
    if (ok) matched++;
    else diffs.push({ field, expected: expectedValue, actual: actualValue });
  }
  return { matched, total, diffs };
};

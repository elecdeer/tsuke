import { describe, expect, test } from "vite-plus/test";
import { genreInferences, transactionItems } from "../db/schema.ts";
import { chunkInsertRows, D1_MAX_BOUND_PARAMETERS } from "./db.ts";

describe("chunkInsertRows", () => {
  test("1 回の INSERT の変数が、表の列の数で見積もって D1 の上限を超えないよう行を分ける", () => {
    // transaction_items は 9 列なので 11 行ずつ、genre_inferences は 10 列なので 10 行ずつになる
    const rows = Array.from({ length: 25 }, (_, index) => index);

    expect(chunkInsertRows(transactionItems, rows).map((chunk) => chunk.length)).toEqual([
      11, 11, 3,
    ]);
    expect(chunkInsertRows(genreInferences, rows).map((chunk) => chunk.length)).toEqual([
      10, 10, 5,
    ]);
    expect(Math.floor(D1_MAX_BOUND_PARAMETERS / 9)).toBe(11);
  });

  test("行の順を保ち、行がなければ何も返さない", () => {
    expect(chunkInsertRows(transactionItems, [1, 2, 3])).toEqual([[1, 2, 3]]);
    expect(chunkInsertRows(transactionItems, [])).toEqual([]);
  });
});

import { describe, expect, test } from "vite-plus/test";
import type { CategoriesResponse, PlacesResponse } from "../queries.ts";
import { buildStatementRows, selectReadableRows } from "./statementRows.ts";

const categories: CategoriesResponse["categories"] = [
  {
    id: 101,
    name: "食費",
    genres: [
      { id: 1001, name: "食料品" },
      { id: 1002, name: "外食" },
    ],
  },
  { id: 102, name: "交通費", genres: [{ id: 1003, name: "電車・バス" }] },
];

const place = (id: number, name: string): PlacesResponse["places"][number] => ({
  id,
  name,
  lastUsedOn: "2026-04-01",
  useCount: 1,
});

describe("selectReadableRows", () => {
  test("日付と正の整数の金額がある行だけを残す", () => {
    const rows = selectReadableRows([
      { date: "2026-05-01", place: "店A", placeName: null, amount: 1000, genreId: 1001 },
      { date: null, place: "日付なし", placeName: null, amount: 500, genreId: null },
      { date: "2026-05-02", place: "金額なし", placeName: null, amount: null, genreId: null },
      { date: "2026-05-03", place: "返金", placeName: null, amount: -300, genreId: null },
      { date: "2026-05-04", place: "小数", placeName: null, amount: 12.5, genreId: null },
    ]);

    expect(rows.map((row) => row.place)).toEqual(["店A"]);
  });
});

describe("buildStatementRows", () => {
  test("登録済みと判定した行は選択を外し、それ以外は選択する", () => {
    const registered = { transactionId: 99, date: "2026-05-02", amount: 2000, placeName: null };
    const rows = buildStatementRows({
      rows: [
        { date: "2026-05-01", place: "店A", placeName: null, amount: 1000, genreId: null },
        { date: "2026-05-02", place: "店B", placeName: null, amount: 2000, genreId: null },
      ],
      matches: [null, registered],
      places: [],
      categories,
    });

    expect(rows.map((row) => row.selected)).toEqual([true, false]);
    expect(rows[1]?.registered).toEqual(registered);
  });

  test("genreId からカテゴリを補完し、該当しなければ未選択にする", () => {
    const rows = buildStatementRows({
      rows: [
        { date: "2026-05-01", place: "店A", placeName: null, amount: 1000, genreId: 1003 },
        { date: "2026-05-01", place: "店B", placeName: null, amount: 1000, genreId: 9999 },
      ],
      matches: [null, null],
      places: [],
      categories,
    });

    expect(rows.map((row) => row.category)).toEqual([{ categoryId: 102, genreId: 1003 }, null]);
    // 推測の記録に使うので、一覧にない ID もそのまま残す
    expect(rows.map((row) => row.aiGenreId)).toEqual([1003, 9999]);
  });

  test("LLM が推測した店舗名が一覧にあれば紐付け、なければ利用先名の完全一致で探す", () => {
    const rows = buildStatementRows({
      rows: [
        {
          date: "2026-05-01",
          place: "ｱﾏｿﾞﾝ",
          placeName: "Amazon.co.jp",
          amount: 1000,
          genreId: null,
        },
        { date: "2026-05-01", place: "スーパーA", placeName: null, amount: 1000, genreId: null },
        {
          date: "2026-05-01",
          place: "初めての店",
          placeName: "存在しない店",
          amount: 1000,
          genreId: null,
        },
        { date: "2026-05-01", place: null, placeName: null, amount: 1000, genreId: null },
      ],
      matches: [null, null, null, null],
      places: [place(1, "スーパーA"), place(2, "Amazon.co.jp")],
      categories,
    });

    expect(rows.map((row) => [row.place, row.store])).toEqual([
      ["ｱﾏｿﾞﾝ", "Amazon.co.jp"],
      ["スーパーA", "スーパーA"],
      ["初めての店", null],
      ["", null],
    ]);
  });
});

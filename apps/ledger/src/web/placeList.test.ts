import { describe, expect, test } from "vite-plus/test";
import { filterPlaces, isPlaceSort, parseAliases, sortPlaces } from "./placeList.ts";

const place = (
  id: number,
  name: string,
  overrides: { aliases?: string[]; lastUsedOn?: string | null; useCount?: number } = {},
) => ({ id, name, aliases: [], lastUsedOn: null, useCount: 0, ...overrides });

describe("filterPlaces", () => {
  const places = [place(1, "Amazon", { aliases: ["ｱﾏｿﾞﾝ"] }), place(2, "セブンイレブン")];

  test("空白だけの検索語では絞り込まない", () => {
    expect(filterPlaces(places, "  ")).toEqual(places);
  });

  test("大文字・小文字の違いを無視して名前で絞り込む", () => {
    expect(filterPlaces(places, "AMAZON").map(({ id }) => id)).toEqual([1]);
  });

  test("全角・半角の違いを無視して別名でも絞り込む", () => {
    expect(filterPlaces(places, "アマゾン").map(({ id }) => id)).toEqual([1]);
  });
});

describe("sortPlaces", () => {
  const places = [
    place(1, "い", { lastUsedOn: "2026-01-01", useCount: 5 }),
    place(2, "あ"),
    place(3, "う", { lastUsedOn: "2026-02-01", useCount: 1 }),
  ];
  const idsBy = (sort: Parameters<typeof sortPlaces>[1]): number[] =>
    sortPlaces(places, sort).map(({ id }) => id);

  test("最近使った順では未使用の店舗を後ろにする", () => {
    expect(idsBy("recent")).toEqual([3, 1, 2]);
  });

  test("利用回数の多い順に並べる", () => {
    expect(idsBy("count")).toEqual([1, 3, 2]);
  });

  test("名前順に並べ、元の配列は変えない", () => {
    expect(idsBy("name")).toEqual([2, 1, 3]);
    expect(places.map(({ id }) => id)).toEqual([1, 2, 3]);
  });
});

describe("isPlaceSort", () => {
  test("並び順の値だけを受け付ける", () => {
    expect(isPlaceSort("name")).toBe(true);
    expect(isPlaceSort("other")).toBe(false);
  });
});

describe("parseAliases", () => {
  test("行ごとに分け、前後の空白・空行・重複を取り除く", () => {
    expect(parseAliases(" A \n\nB\nA\n  ")).toEqual(["A", "B"]);
  });
});

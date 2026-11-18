import { describe, expect, test } from "vite-plus/test";
import {
  ALL_PLACES_OPTION,
  parsePlaceFilterValue,
  placeFilterGroups,
  placeFilterValueOf,
  selectedPlaceFilterOption,
} from "./placeFilter.ts";

describe("placeFilterValueOf", () => {
  test("店舗なら p:店舗ID、チェーンなら c:チェーン名、どちらもなければ空文字にする", () => {
    expect(placeFilterValueOf({ placeId: 3 })).toBe("p:3");
    expect(placeFilterValueOf({ chain: "ローソン" })).toBe("c:ローソン");
    expect(placeFilterValueOf({})).toBe("");
  });

  test("店舗とチェーンの両方があれば店舗にする", () => {
    expect(placeFilterValueOf({ placeId: 3, chain: "ローソン" })).toBe("p:3");
  });
});

describe("parsePlaceFilterValue", () => {
  test("店舗の値なら店舗だけを入れ、チェーンは外す", () => {
    expect(parsePlaceFilterValue("p:3")).toEqual({ placeId: 3, chain: undefined });
  });

  test("チェーンの値ならチェーンだけを入れ、店舗は外す", () => {
    expect(parsePlaceFilterValue("c:ローソン")).toEqual({ placeId: undefined, chain: "ローソン" });
  });

  test("コロンを含むチェーン名もそのまま戻す", () => {
    expect(parsePlaceFilterValue("c:A:B")).toEqual({ placeId: undefined, chain: "A:B" });
  });

  test.each(["", "p:", "p:abc", "p:-1", "c:", "x:1"])("%j はどちらも外す", (value) => {
    expect(parsePlaceFilterValue(value)).toEqual({ placeId: undefined, chain: undefined });
  });
});

describe("placeFilterGroups", () => {
  test("先頭にすべての店舗、チェーンごとに全店と店舗、最後にチェーンのない店舗を並べる", () => {
    const groups = placeFilterGroups([
      { id: 1, name: "ローソン新宿店", chain: "ローソン" },
      { id: 2, name: "喫茶店", chain: null },
      { id: 3, name: "イオン幕張店", chain: "イオン" },
      { id: 4, name: "ローソン渋谷店", chain: "ローソン" },
    ]);

    expect(groups).toEqual([
      { value: "", items: [ALL_PLACES_OPTION] },
      {
        value: "イオン",
        items: [
          { value: "c:イオン", label: "イオン（全店）", searchText: "イオン", inset: false },
          { value: "p:3", label: "イオン幕張店", searchText: "イオン幕張店 イオン", inset: true },
        ],
      },
      {
        value: "ローソン",
        items: [
          { value: "c:ローソン", label: "ローソン（全店）", searchText: "ローソン", inset: false },
          {
            value: "p:1",
            label: "ローソン新宿店",
            searchText: "ローソン新宿店 ローソン",
            inset: true,
          },
          {
            value: "p:4",
            label: "ローソン渋谷店",
            searchText: "ローソン渋谷店 ローソン",
            inset: true,
          },
        ],
      },
      {
        value: "チェーンなし",
        items: [{ value: "p:2", label: "喫茶店", searchText: "喫茶店", inset: false }],
      },
    ]);
  });

  test("店舗がなければすべての店舗だけにする", () => {
    expect(placeFilterGroups([])).toEqual([{ value: "", items: [ALL_PLACES_OPTION] }]);
  });
});

describe("selectedPlaceFilterOption", () => {
  const groups = placeFilterGroups([
    { id: 1, name: "ローソン新宿店", chain: "ローソン" },
    { id: 2, name: "喫茶店", chain: null },
  ]);

  test("選択肢にある店舗やチェーンなら、その選択肢を返す", () => {
    expect(selectedPlaceFilterOption(groups, { placeId: 2 }, "喫茶店").label).toBe("喫茶店");
    expect(selectedPlaceFilterOption(groups, { chain: "ローソン" }, null).label).toBe(
      "ローソン（全店）",
    );
  });

  test("絞り込んでいなければすべての店舗を返す", () => {
    expect(selectedPlaceFilterOption(groups, {}, null)).toBe(ALL_PLACES_OPTION);
  });

  test("選択肢にない店舗なら、渡した店舗の名前で選択肢を作る", () => {
    expect(selectedPlaceFilterOption(groups, { placeId: 9 }, "閉店した店")).toEqual({
      value: "p:9",
      label: "閉店した店",
      searchText: "閉店した店",
      inset: false,
    });
  });

  test("選択肢になく名前もわからない店舗は、削除された店舗にする", () => {
    expect(selectedPlaceFilterOption(groups, { placeId: 9 }, null).label).toBe(
      "（削除された店舗）",
    );
  });

  test("選択肢にないチェーンなら、そのチェーンの全店にする", () => {
    expect(selectedPlaceFilterOption(groups, { chain: "閉じたチェーン" }, null)).toEqual({
      value: "c:閉じたチェーン",
      label: "閉じたチェーン（全店）",
      searchText: "閉じたチェーン",
      inset: false,
    });
  });
});

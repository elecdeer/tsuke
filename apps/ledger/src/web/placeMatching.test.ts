import { describe, expect, test } from "vite-plus/test";
import type { Poi } from "./openPoi.ts";
import {
  inferChain,
  placeDetailFor,
  placeKey,
  similarPlaces,
  suggestQueries,
} from "./placeMatching.ts";

const poi: Poi = {
  name: "セブンイレブン 丸の内店",
  kind: "convenience_store",
  address: "東京都千代田区丸の内1-1-1",
  position: { lng: 139.76, lat: 35.68 },
  brand: "7-Eleven",
  licenses: ["CDLA-Permissive-2.0"],
  attributions: ["Overture Maps Foundation"],
};

describe("placeKey", () => {
  test.each([
    ["セブン-イレブン", "セブンーイレブン"],
    ["ｾﾌﾞﾝｲﾚﾌﾞﾝ", "セブンイレブン"],
    ["Amazon.co.jp", "AMAZON CO JP"],
    ["ＪＲ東日本", "JR 東日本"],
  ])("%s と %s は同じキーになる", (a, b) => {
    expect(placeKey(a)).toBe(placeKey(b));
  });

  test("別の名前は別のキーになる", () => {
    expect(placeKey("ローソン")).not.toBe(placeKey("ファミリーマート"));
  });
});

describe("similarPlaces", () => {
  test("表記だけが違う店舗を、一部だけ同じ店舗より先に返す", () => {
    expect(
      similarPlaces("セブン-イレブン", ["セブンイレブン丸の内店", "ローソン", "ｾﾌﾞﾝｲﾚﾌﾞﾝ"]),
    ).toEqual(["ｾﾌﾞﾝｲﾚﾌﾞﾝ", "セブンイレブン丸の内店"]);
  });

  test("入れた名前そのものは返さない", () => {
    expect(similarPlaces("ローソン", ["ローソン"])).toEqual([]);
  });

  test("短い名前は一部が同じだけでは返さない", () => {
    expect(similarPlaces("ヤマト運輸", ["ヤマ"])).toEqual([]);
  });

  test("件数の上限まで返す", () => {
    const names = ["ローソン新宿店", "ローソン渋谷店", "ローソン池袋店"];
    expect(similarPlaces("ローソン", names, 2)).toHaveLength(2);
  });
});

describe("inferChain", () => {
  test("既存のチェーンで始まる名前は、区切りがなくてもそのチェーンにする", () => {
    expect(inferChain("セブンーイレブン甲府丸の内店", ["セブン-イレブン"])).toBe("セブン-イレブン");
  });

  test("既存のチェーンは長く一致するものを選ぶ", () => {
    expect(inferChain("イオンモール幕張店", ["イオン", "イオンモール"])).toBe("イオンモール");
  });

  test("既存になければ「チェーン名 支店名店」の形から取る", () => {
    expect(inferChain("ローソン　新宿西口店", [])).toBe("ローソン");
  });

  test("形から取れなければブランドを使う", () => {
    expect(inferChain("マクドナルド", [], "McDonald's")).toBe("McDonald's");
  });

  test("手がかりがなければ空にする", () => {
    expect(inferChain("喫茶ひだまり", [])).toBe("");
  });
});

describe("suggestQueries", () => {
  test("そのままの名前の次に、区切りと末尾の店を落とした語を試す", () => {
    expect(suggestQueries(" セブン-イレブン 東京駅店 ")).toEqual([
      "セブン-イレブン 東京駅店",
      "セブンイレブン東京駅",
    ]);
  });

  test("落とすものがなければ 1 つだけにする", () => {
    expect(suggestQueries("ローソン")).toEqual(["ローソン"]);
  });

  test("空の名前では探さない", () => {
    expect(suggestQueries("  ")).toEqual([]);
  });
});

describe("placeDetailFor", () => {
  const masters = { placeNames: ["スーパーみどり"], chainNames: ["セブンイレブン"] };

  test("すでにある店舗や空の名前には何も足さない", () => {
    expect(placeDetailFor("スーパーみどり", masters, poi)).toBeNull();
    expect(placeDetailFor("", masters)).toBeNull();
  });

  test("施設から作るときは、住所・座標と出典を持つ", () => {
    expect(placeDetailFor(poi.name, masters, poi)).toEqual({
      chain: "セブンイレブン",
      poi: {
        address: "東京都千代田区丸の内1-1-1",
        lng: 139.76,
        lat: 35.68,
        category: "convenience_store",
        licenses: ["CDLA-Permissive-2.0"],
        attributions: ["Overture Maps Foundation"],
      },
    });
  });

  test("名前だけで作るときは施設を持たない", () => {
    expect(placeDetailFor("喫茶ひだまり", masters)).toEqual({ chain: "", poi: null });
  });
});

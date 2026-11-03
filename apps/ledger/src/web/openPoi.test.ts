import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  boundsOfPois,
  distance,
  mergePoisInView,
  poiKey,
  poisFromResponse,
  searchUrl,
  suggestPois,
  suggestUrl,
  uniquePois,
} from "./openPoi.ts";

const paramsOf = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe("searchUrl", () => {
  test("中心と半径は経度・緯度の順で送る", () => {
    const url = searchUrl("", { center: { lng: 139.767, lat: 35.681 }, radius: 300.4 }, 50);
    expect(url.startsWith("https://api.openpoiapi.com/v1/search?")).toBe(true);
    expect(paramsOf(url)).toEqual({ center: "139.767,35.681", radius: "300", limit: "50" });
  });

  test("キーワードは前後の空白を落として送る", () => {
    const url = searchUrl(" コンビニ ", { center: { lng: 139, lat: 35 }, radius: 500 }, 10);
    expect(paramsOf(url).q).toBe("コンビニ");
  });

  test("範囲がなければキーワードだけで全国から探す", () => {
    expect(paramsOf(searchUrl("スターバックス", null, 200))).toEqual({
      q: "スターバックス",
      limit: "200",
    });
  });

  test("表示範囲は API が受け付ける範囲に収めて送る", () => {
    const url = searchUrl(
      "",
      { bbox: { minLng: -200, minLat: -89, maxLng: 139.8, maxLat: 35.7 } },
      50,
    );
    expect(paramsOf(url).bbox).toBe("-180,-85,139.8,35.7");
  });
});

describe("poisFromResponse", () => {
  test("文字列の座標も読み、業種がなければカテゴリを使う", () => {
    const pois = poisFromResponse({
      count: 2,
      results: [
        {
          name: "テスト食堂",
          address: "東京都千代田区丸の内1-1",
          business_type: "飲食店営業",
          category: "restaurant",
          lat: "35.68",
          lng: "139.76",
        },
        { name: "テスト商店", address: "", category: "shop", lat: 35.1, lng: 139.1 },
      ],
    });
    expect(pois).toEqual([
      {
        name: "テスト食堂",
        kind: "飲食店営業",
        address: "東京都千代田区丸の内1-1",
        position: { lng: 139.76, lat: 35.68 },
        brand: "",
        licenses: [],
        attributions: [],
      },
      {
        name: "テスト商店",
        kind: "shop",
        address: "",
        position: { lng: 139.1, lat: 35.1 },
        brand: "",
        licenses: [],
        attributions: [],
      },
    ]);
  });

  test("座標や名前のない施設は地図に置けないので除く", () => {
    const pois = poisFromResponse({
      results: [
        { name: "座標なし", lat: "", lng: "" },
        { name: "", lat: 35, lng: 139 },
      ],
    });
    expect(pois).toEqual([]);
  });

  test("思わぬ形の応答なら空にする", () => {
    expect(poisFromResponse(null)).toEqual([]);
    expect(poisFromResponse({ results: "x" })).toEqual([]);
  });
});

describe("distance", () => {
  test("東京駅から皇居（約 1.2km）までの距離を測る", () => {
    const meters = distance({ lng: 139.7671, lat: 35.6812 }, { lng: 139.7528, lat: 35.6852 });
    expect(meters).toBeGreaterThan(1200);
    expect(meters).toBeLessThan(1500);
  });
});

describe("suggestUrl", () => {
  test("語は前後の空白を落として入力補完へ送る", () => {
    const url = suggestUrl(" ローソン新宿 ", 5);
    expect(url.startsWith("https://api.openpoiapi.com/v1/suggest?")).toBe(true);
    expect(paramsOf(url)).toEqual({ q: "ローソン新宿", limit: "5" });
  });
});

describe("poisFromResponse（入力補完）", () => {
  test("suggestions の施設を読み、出典も一緒に取り出す", () => {
    const [poi] = poisFromResponse({
      suggestions: [
        {
          name: "ローソン新宿中井店",
          address: "東京都新宿区中井1-10-8",
          category: "convenience_store",
          lat: 35.71,
          lng: 139.69,
          licenses: ["CDLA-Permissive-2.0"],
          attributions: ["Overture Maps Foundation"],
        },
      ],
    });
    expect(poi).toEqual({
      name: "ローソン新宿中井店",
      kind: "convenience_store",
      address: "東京都新宿区中井1-10-8",
      position: { lng: 139.69, lat: 35.71 },
      brand: "",
      licenses: ["CDLA-Permissive-2.0"],
      attributions: ["Overture Maps Foundation"],
    });
  });
});

describe("suggestPois", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubResponses = (bodies: unknown[]) => {
    const fetchStub = vi.fn<(url: string) => Promise<Response>>();
    for (const body of bodies) fetchStub.mockResolvedValueOnce(Response.json(body));
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
  };

  test("当たるまで語を順に試し、当たったら残りは投げない", async () => {
    const fetchStub = stubResponses([
      { suggestions: [] },
      { suggestions: [{ name: "店", address: "", lat: 35, lng: 139 }] },
    ]);
    const pois = await suggestPois(["一つ目", "二つ目", "三つ目"]);
    expect(pois.map((poi) => poi.name)).toEqual(["店"]);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  test("どの語でも当たらなければ空を返す", async () => {
    stubResponses([{ suggestions: [] }]);
    expect(await suggestPois(["語"])).toEqual([]);
  });
});

describe("poiKey", () => {
  const poi = {
    name: "テスト食堂",
    kind: "",
    address: "",
    position: { lng: 139.76, lat: 35.68 },
    brand: "",
    licenses: [],
    attributions: [],
  };

  test("名前と座標が同じなら、別のオブジェクトでも同じキーになる", () => {
    expect(poiKey({ ...poi, position: { ...poi.position } })).toBe(poiKey(poi));
  });

  test("同じ建物の別の店は違うキーになる", () => {
    expect(poiKey({ ...poi, name: "テスト喫茶" })).not.toBe(poiKey(poi));
  });
});

describe("mergePoisInView", () => {
  const bbox = { minLng: 139, minLat: 35, maxLng: 140, maxLat: 36 };
  const poiAt = (name: string, lng: number, lat: number) => ({
    name,
    kind: "",
    address: "",
    position: { lng, lat },
    brand: "",
    licenses: [],
    attributions: [],
  });

  test("両方の検索に出た施設は 1 件にまとめる", () => {
    const shared = poiAt("両方の店", 139.5, 35.5);
    const pois = mergePoisInView(
      bbox,
      [shared, poiAt("範囲の店", 139.1, 35.1)],
      [{ ...shared }, poiAt("近くの店", 139.6, 35.6)],
    );
    expect(pois.map((poi) => poi.name)).toEqual(["両方の店", "範囲の店", "近くの店"]);
  });

  test("範囲の外の施設は除き、範囲の端の施設は残す", () => {
    const pois = mergePoisInView(bbox, [poiAt("外の店", 141, 35.5), poiAt("端の店", 140, 36)]);
    expect(pois.map((poi) => poi.name)).toEqual(["端の店"]);
  });
});

describe("boundsOfPois", () => {
  const poiAt = (lng: number, lat: number) => ({
    name: "店",
    kind: "",
    address: "",
    position: { lng, lat },
    brand: "",
    licenses: [],
    attributions: [],
  });

  test("すべての施設が入る範囲を返す", () => {
    expect(boundsOfPois([poiAt(139.7, 35.6), poiAt(135.5, 34.7), poiAt(141.3, 43.1)])).toEqual({
      minLng: 135.5,
      minLat: 34.7,
      maxLng: 141.3,
      maxLat: 43.1,
    });
  });

  test("施設がなければ null を返す", () => {
    expect(boundsOfPois([])).toBeNull();
  });
});

describe("uniquePois", () => {
  test("名前と座標が同じ施設は 1 件にし、同じ建物の別の店は残す", () => {
    const position = { lng: 139.76, lat: 35.68 };
    const poi = {
      name: "テスト食堂",
      kind: "",
      address: "",
      position,
      brand: "",
      licenses: [],
      attributions: [],
    };

    const pois = uniquePois([poi, { ...poi }, { ...poi, name: "テスト喫茶" }]);

    expect(pois.map(({ name }) => name)).toEqual(["テスト食堂", "テスト喫茶"]);
  });
});

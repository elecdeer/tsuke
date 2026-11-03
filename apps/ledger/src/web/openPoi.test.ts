import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { distance, poisFromResponse, searchUrl, suggestPois, suggestUrl } from "./openPoi.ts";

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

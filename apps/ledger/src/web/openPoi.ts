/**
 * OpenPOI API（日本全国の施設の検索。https://docs.openpoiapi.com/）で、地図の上から店舗を探す。
 *
 * API はキーが要らず、どのオリジンからも呼べる（CORS）ので、ブラウザから直接呼ぶ。
 * 座標は API と同じく経度・緯度の順に持つ。
 */

const SEARCH_URL = "https://api.openpoiapi.com/v1/search";
const SUGGEST_URL = "https://api.openpoiapi.com/v1/suggest";

/** 出典の表示の決まり。データを出すときは「OpenPOI API」と書き、このページへリンクする */
export const OPEN_POI_ATTRIBUTION_URL = "https://openpoiapi.com/attribution.html";

export type LngLat = { lng: number; lat: number };

/** 地図の表示範囲（西・南・東・北） */
export type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** 検索の範囲。地図を動かしたら表示範囲で、開いたときは現在地の周りで探す */
export type PoiArea = { center: LngLat; radius: number } | { bbox: BBox };

/** 地図に出す施設。座標のない施設は地図に置けないので除く */
export type Poi = {
  name: string;
  /** 業種やカテゴリ。どちらもなければ空 */
  kind: string;
  address: string;
  position: LngLat;
  /** チェーンの名前。入力補完の応答には含まれず、検索でも一部の施設にしかない。なければ空 */
  brand: string;
  /** 出典。保存するときは施設と一緒に保存する決まり */
  licenses: string[];
  attributions: string[];
};

/** 地図をいくら縮めても、API が受け付ける範囲（経度 ±180・緯度 ±85）に収める */
const clampBBox = (bbox: BBox): BBox => {
  const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));
  return {
    minLng: clamp(bbox.minLng, 180),
    minLat: clamp(bbox.minLat, 85),
    maxLng: clamp(bbox.maxLng, 180),
    maxLat: clamp(bbox.maxLat, 85),
  };
};

/**
 * 検索の URL を作る。キーワードは前後の空白を落とし、空なら送らない（範囲の中の施設をすべて探す）。
 */
export const searchUrl = (keyword: string, area: PoiArea, limit: number): string => {
  const params = new URLSearchParams();
  const q = keyword.trim();
  if (q !== "") params.set("q", q);
  if ("bbox" in area) {
    const { minLng, minLat, maxLng, maxLat } = clampBBox(area.bbox);
    params.set("bbox", [minLng, minLat, maxLng, maxLat].join(","));
  } else {
    params.set("center", `${area.center.lng},${area.center.lat}`);
    params.set("radius", String(Math.round(area.radius)));
  }
  params.set("limit", String(limit));
  return `${SEARCH_URL}?${params}`;
};

/**
 * 入力補完の URL を作る。近さで並べ替えられるが、新しい店舗の名前には位置がないので全国から探す。
 */
export const suggestUrl = (keyword: string, limit: number): string =>
  `${SUGGEST_URL}?${new URLSearchParams({ q: keyword.trim(), limit: String(limit) })}`;

/** API は座標を数値か文字列で返し、座標のない施設には空文字を返す */
const toCoordinate = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const toTextList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item !== "")
    : [];

/**
 * 検索（results）か入力補完（suggestions）の応答から施設を取り出す。名前や座標のない施設は飛ばす。
 */
export const poisFromResponse = (body: unknown): Poi[] => {
  if (typeof body !== "object" || body === null) return [];
  const results =
    "results" in body ? body.results : "suggestions" in body ? body.suggestions : null;
  if (!Array.isArray(results)) return [];
  return results.flatMap((result: Record<string, unknown>) => {
    const name = toText(result.name);
    const lng = toCoordinate(result.lng);
    const lat = toCoordinate(result.lat);
    if (name === "" || lng === null || lat === null) return [];
    return [
      {
        name,
        kind: toText(result.business_type) || toText(result.category),
        address: toText(result.address),
        position: { lng, lat },
        brand: toText(result.brand),
        licenses: toTextList(result.licenses),
        attributions: toTextList(result.attributions),
      },
    ];
  });
};

/** 2 点の間の距離（m）。近くの店を並べるだけなので、球面の近似で足りる */
export const distance = (a: LngLat, b: LngLat): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};

/**
 * 施設を取得する。失敗したときは理由を添えた Error を投げる。
 *
 * レート制限（429）の応答には CORS のヘッダーが付かず、ブラウザでは通信の失敗に見える。
 */
const fetchPois = async (url: string, signal: AbortSignal | undefined): Promise<Poi[]> => {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === "object" && body !== null && "error" in body ? toText(body.error) : "";
    throw new Error(message || `店舗を探せませんでした（${response.status}）`);
  }
  return poisFromResponse(await response.json());
};

/**
 * 施設を探す。
 */
export const searchPois = (
  keyword: string,
  area: PoiArea,
  { limit = 50, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<Poi[]> => fetchPois(searchUrl(keyword, area, limit), signal);

/**
 * 語を順に入力補完へ投げ、最初に当たった施設を返す。
 */
export const suggestPois = async (
  queries: string[],
  { limit = 5, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<Poi[]> => {
  for (const query of queries) {
    const pois = await fetchPois(suggestUrl(query, limit), signal);
    if (pois.length > 0) return pois;
  }
  return [];
};

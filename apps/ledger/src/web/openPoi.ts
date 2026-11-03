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

/** 検索の範囲。中心と半径か、地図の表示範囲。null なら範囲を限らず全国から探す */
export type PoiArea = { center: LngLat; radius: number } | { bbox: BBox } | null;

/** 1 回の検索で受け取れる件数の上限（API の上限）。範囲の中にこれより多くあると、一部しか返らない */
export const POI_SEARCH_LIMIT = 200;

/** 地図の中心から近い順に受け取る件数 */
const NEAREST_LIMIT = 50;

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

/** 施設を見分けるキー。検索し直すと同じ施設でも別のオブジェクトになるので、これで比べる */
export const poiKey = ({ name, position }: Poi): string =>
  `${name}:${position.lng}:${position.lat}`;

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
  if (area !== null && "bbox" in area) {
    const { minLng, minLat, maxLng, maxLat } = clampBBox(area.bbox);
    params.set("bbox", [minLng, minLat, maxLng, maxLat].join(","));
  } else if (area !== null) {
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
  { limit = POI_SEARCH_LIMIT, signal }: { limit?: number; signal?: AbortSignal } = {},
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

/**
 * 施設がすべて入る範囲を返す。施設がなければ null。
 */
export const boundsOfPois = (pois: Poi[]): BBox | null => {
  if (pois.length === 0) return null;
  const lngs = pois.map((poi) => poi.position.lng);
  const lats = pois.map((poi) => poi.position.lat);
  return {
    minLng: Math.min(...lngs),
    minLat: Math.min(...lats),
    maxLng: Math.max(...lngs),
    maxLat: Math.max(...lats),
  };
};

/**
 * 同じ施設を 1 件にまとめる。API は同じ名前と座標の施設を重ねて返すことがある。
 */
export const uniquePois = (pois: Poi[]): Poi[] => [
  ...new Map(pois.map((poi) => [poiKey(poi), poi])).values(),
];

/**
 * 2 つの検索結果を 1 つにまとめる。同じ施設は 1 件にし、範囲の外の施設は除く。
 */
export const mergePoisInView = (bbox: BBox, ...lists: Poi[][]): Poi[] =>
  uniquePois(
    lists.flat().filter(({ position: { lng, lat } }) => {
      return bbox.minLng <= lng && lng <= bbox.maxLng && bbox.minLat <= lat && lat <= bbox.maxLat;
    }),
  );

/**
 * 地図の表示範囲の施設を探す。
 *
 * 範囲の検索は全体に散らばって返るが、近い順ではなく、多いと打ち切られて中心のすぐ近くの店が漏れる。
 * 中心からの検索は近い順に返るが、店の多い所では中心に固まり、地図の大半に印が出ない。
 * どちらか一方では足りないので、両方の結果をまとめる。
 */
export const searchPoisInView = async (
  keyword: string,
  bbox: BBox,
  center: LngLat,
  { signal }: { signal?: AbortSignal } = {},
): Promise<Poi[]> => {
  const radius = Math.min(
    distance(center, { lng: bbox.minLng, lat: center.lat }),
    distance(center, { lng: center.lng, lat: bbox.minLat }),
  );
  const [spread, nearest] = await Promise.all([
    searchPois(keyword, { bbox }, { signal }),
    searchPois(keyword, { center, radius }, { limit: NEAREST_LIMIT, signal }),
  ]);
  return mergePoisInView(bbox, spread, nearest);
};

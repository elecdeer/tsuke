/**
 * OpenPOI API（日本全国の施設の検索。https://docs.openpoiapi.com/）で、地図の上から店舗を探す。
 *
 * API はキーが要らず、どのオリジンからも呼べる（CORS）ので、ブラウザから直接呼ぶ。
 * 座標は API と同じく経度・緯度の順に持つ。
 */

const SEARCH_URL = "https://api.openpoiapi.com/v1/search";

/** 出典の表示の決まり。データを出すときは「OpenPOI API」と書き、このページへリンクする */
export const OPEN_POI_ATTRIBUTION_URL = "https://openpoiapi.com/attribution.html";

export type LngLat = { lng: number; lat: number };

/** 地図の表示範囲（西・南・東・北） */
export type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** 検索の範囲。中心と半径か、地図の表示範囲 */
export type PoiArea = { center: LngLat; radius: number } | { bbox: BBox };

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

/** API は座標を数値か文字列で返し、座標のない施設には空文字を返す */
const toCoordinate = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * 検索の応答から施設を取り出す。名前や座標のない施設は飛ばす。
 */
export const poisFromResponse = (body: unknown): Poi[] => {
  const results =
    typeof body === "object" && body !== null && "results" in body ? body.results : null;
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
 * 施設を探す。失敗したときは理由を添えた Error を投げる。
 *
 * レート制限（429）の応答には CORS のヘッダーが付かず、ブラウザでは通信の失敗に見える。
 */
export const searchPois = async (
  keyword: string,
  area: PoiArea,
  { limit = POI_SEARCH_LIMIT, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<Poi[]> => {
  const response = await fetch(searchUrl(keyword, area, limit), {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === "object" && body !== null && "error" in body ? toText(body.error) : "";
    throw new Error(message || `店舗を探せませんでした（${response.status}）`);
  }
  return poisFromResponse(await response.json());
};

/**
 * 2 つの検索結果を 1 つにまとめる。同じ施設は 1 件にし、範囲の外の施設は除く。
 */
export const mergePoisInView = (bbox: BBox, ...lists: Poi[][]): Poi[] => {
  const merged = new Map<string, Poi>();
  for (const poi of lists.flat()) {
    const { lng, lat } = poi.position;
    const inView =
      bbox.minLng <= lng && lng <= bbox.maxLng && bbox.minLat <= lat && lat <= bbox.maxLat;
    if (inView) merged.set(poiKey(poi), poi);
  }
  return [...merged.values()];
};

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

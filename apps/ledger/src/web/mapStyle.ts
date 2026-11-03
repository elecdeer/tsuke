/**
 * 店舗を選ぶ地図のスタイル。OpenFreeMap の配信するものを、店舗の印が見やすいように手直しする。
 */
import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const HIDDEN_LAYER_IDS: ReadonlySet<string> = new Set([
  // 歩道。街区のほとんどを線で囲んでしまう
  "tunnel_path_pedestrian",
  "road_path_pedestrian",
  "bridge_path_pedestrian_casing",
  "bridge_path_pedestrian",
  "highway-name-path",
  // 立体の建物。地図を傾けられないので、壁が斜めに写り込むだけになる
  "building-3d",
]);

/**
 * 名前を出すレイヤーを、現地の表記だけ出すようにする。元は「Tokyo 東京」のようにローマ字と併記している。
 */
const useLocalName = (layer: LayerSpecification): LayerSpecification => {
  if (layer.type !== "symbol") return layer;
  // 道路番号（ref）など、名前でないものを出すレイヤーは変えない
  if (!JSON.stringify(layer.layout?.["text-field"] ?? null).includes("name:nonlatin")) return layer;
  return { ...layer, layout: { ...layer.layout, "text-field": ["get", "name"] } };
};

/**
 * 施設のレイヤーからバス停を除き、駅は鉄道の駅だけにする。バス停は数が多く、鉄道の駅と同じ色のアイコンで見分けにくい。
 */
const hideBusStops = (layer: LayerSpecification): LayerSpecification => {
  if (layer.type !== "symbol" || layer["source-layer"] !== "poi") return layer;
  const notBus: ExpressionSpecification = ["!=", ["get", "class"], "bus"];
  if (layer.filter === undefined) return { ...layer, filter: notBus };
  // 型は古い形式の条件も含むが、配信されるスタイルの条件はすべて式で、そのまま "all" に入れられる
  return { ...layer, filter: ["all", layer.filter, notBus] as FilterSpecification };
};

const MAJOR_ROAD_LAYER =
  /^(road|bridge|tunnel)_(motorway_link|link|secondary_tertiary|trunk_primary|motorway)(_casing)?$/;
const RAIL_LAYER = /^(road|bridge)_(major|transit)_rail$/;
const RAIL_HATCHING_LAYER = /^(road|bridge)_(major|transit)_rail_hatching$/;

const ROAD_COLOR = "#fff";
const ROAD_CASING_COLOR = "#cfcdca";
const RAIL_COLOR = "#666";

/**
 * 大きい道路を普通の道路（road_minor）と同じ色にする。太さは残すので、道の大きさは見分けられる。
 */
const flattenRoadColors = (layer: LayerSpecification): LayerSpecification => {
  if (layer.type !== "line" || !MAJOR_ROAD_LAYER.test(layer.id)) return layer;
  const color = layer.id.endsWith("_casing") ? ROAD_CASING_COLOR : ROAD_COLOR;
  return { ...layer, paint: { ...layer.paint, "line-color": color } };
};

/**
 * 地上と高架の鉄道の線を濃く太くする。地下の線は見えない所を通るので、目立たないままにする。
 */
const emphasizeRails = (layer: LayerSpecification): LayerSpecification => {
  if (layer.type !== "line") return layer;
  if (RAIL_HATCHING_LAYER.test(layer.id)) {
    return { ...layer, paint: { ...layer.paint, "line-color": RAIL_COLOR } };
  }
  if (!RAIL_LAYER.test(layer.id)) return layer;
  return {
    ...layer,
    paint: {
      ...layer.paint,
      "line-color": RAIL_COLOR,
      "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 10, 0.6, 14, 1.2, 20, 3.5],
    },
  };
};

/**
 * 配信されたスタイルを、店舗を選ぶ地図向けに手直しする。
 */
export const adjustMapStyle = (
  _previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification => ({
  ...next,
  layers: next.layers
    .filter((layer) => !HIDDEN_LAYER_IDS.has(layer.id))
    .map(useLocalName)
    .map(hideBusStops)
    .map(flattenRoadColors)
    .map(emphasizeRails),
});

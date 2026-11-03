/**
 * 店舗を選ぶ地図のスタイル。OpenFreeMap の配信するものを、店舗の印が見やすいように手直しする。
 */
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

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
 * 配信されたスタイルを、店舗を選ぶ地図向けに手直しする。
 */
export const adjustMapStyle = (
  _previous: StyleSpecification | undefined,
  next: StyleSpecification,
): StyleSpecification => ({
  ...next,
  layers: next.layers.filter((layer) => !HIDDEN_LAYER_IDS.has(layer.id)).map(useLocalName),
});

import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import { describe, expect, test } from "vite-plus/test";
import { adjustMapStyle } from "./mapStyle.ts";

const styleOf = (...layers: LayerSpecification[]): StyleSpecification => ({
  version: 8,
  sources: {},
  layers,
});

const background = (id: string): LayerSpecification => ({ id, type: "background" });

const label = (id: string, textField: ExpressionSpecification): LayerSpecification => ({
  id,
  type: "symbol",
  source: "openmaptiles",
  layout: { "text-field": textField, "text-size": 12 },
});

describe("adjustMapStyle", () => {
  test("歩道と立体の建物のレイヤーを除き、ほかは順番を保って残す", () => {
    const style = styleOf(
      background("background"),
      background("tunnel_path_pedestrian"),
      background("road_path_pedestrian"),
      background("road_minor"),
      background("bridge_path_pedestrian_casing"),
      background("bridge_path_pedestrian"),
      background("building-3d"),
      background("highway-name-path"),
      background("highway-name-minor"),
    );

    const { layers } = adjustMapStyle(undefined, style);

    expect(layers.map((layer) => layer.id)).toEqual([
      "background",
      "road_minor",
      "highway-name-minor",
    ]);
  });

  test("ローマ字と併記している名前を現地の表記だけにし、ほかのレイアウトは保つ", () => {
    const style = styleOf(
      label("label_city", ["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]]),
    );

    const [layer] = adjustMapStyle(undefined, style).layers;

    expect(layer).toMatchObject({
      layout: { "text-field": ["get", "name"], "text-size": 12 },
    });
  });

  test("道路番号のように名前でないものを出すレイヤーは変えない", () => {
    const shield = label("highway-shield", ["to-string", ["get", "ref"]]);

    expect(adjustMapStyle(undefined, styleOf(shield)).layers).toEqual([shield]);
  });

  test("レイヤー以外の設定はそのまま保つ", () => {
    const style = { ...styleOf(), glyphs: "https://example.com/{fontstack}/{range}" };

    expect(adjustMapStyle(undefined, style).glyphs).toBe(style.glyphs);
  });
});

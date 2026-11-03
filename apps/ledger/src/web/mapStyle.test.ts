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
  test("歩道と立体の建物と地図の施設のレイヤーを除き、ほかは順番を保って残す", () => {
    const style = styleOf(
      background("background"),
      background("tunnel_path_pedestrian"),
      background("road_path_pedestrian"),
      background("road_minor"),
      background("bridge_path_pedestrian_casing"),
      background("bridge_path_pedestrian"),
      background("building-3d"),
      background("poi_r1"),
      background("poi_r7"),
      background("poi_r20"),
      background("poi_transit"),
      background("highway-name-path"),
      background("highway-name-minor"),
    );

    const { layers } = adjustMapStyle(undefined, style);

    expect(layers.map((layer) => layer.id)).toEqual([
      "background",
      "road_minor",
      "poi_transit",
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

  test("施設のレイヤーからバス停を除き、元の条件も保つ", () => {
    const original: ExpressionSpecification = [
      "match",
      ["get", "class"],
      ["bus", "rail"],
      true,
      false,
    ];
    const poi: LayerSpecification = {
      id: "poi_transit",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "poi",
      filter: original,
    };

    const [layer] = adjustMapStyle(undefined, styleOf(poi)).layers;

    expect(layer).toMatchObject({
      filter: ["all", original, ["!=", ["get", "class"], "bus"]],
    });
  });

  test("施設以外のレイヤーの条件は変えない", () => {
    const road: LayerSpecification = {
      id: "road_minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["==", ["get", "class"], "minor"],
    };

    expect(adjustMapStyle(undefined, styleOf(road)).layers).toEqual([road]);
  });

  const line = (id: string): LayerSpecification => ({
    id,
    type: "line",
    source: "openmaptiles",
    "source-layer": "transportation",
    paint: { "line-color": "#fea", "line-width": 2 },
  });

  test("大きい道路を淡い色にし、太さは保つ", () => {
    const layers = adjustMapStyle(
      undefined,
      styleOf(
        line("road_trunk_primary"),
        line("bridge_motorway"),
        line("road_trunk_primary_casing"),
      ),
    ).layers;

    expect(layers.map((layer) => (layer.type === "line" ? layer.paint : null))).toEqual([
      { "line-color": "#fcf4d9", "line-width": 2 },
      { "line-color": "#fcf4d9", "line-width": 2 },
      { "line-color": "#ddd2b0", "line-width": 2 },
    ]);
  });

  test.each(["road_major_rail", "bridge_transit_rail", "tunnel_transit_rail"])(
    "鉄道の線（%s）を濃く太くする",
    (id) => {
      const [layer] = adjustMapStyle(undefined, styleOf(line(id))).layers;

      expect(layer).toMatchObject({ paint: { "line-color": "#666" } });
      expect(layer).not.toMatchObject({ paint: { "line-width": 2 } });
    },
  );

  test("鉄道の枕木は色だけ変え、間隔を決める太さは保つ", () => {
    const [layer] = adjustMapStyle(undefined, styleOf(line("road_major_rail_hatching"))).layers;

    expect(layer).toMatchObject({ paint: { "line-color": "#666", "line-width": 2 } });
  });

  test("普通の道路は変えない", () => {
    const layers = [line("road_minor")];

    expect(adjustMapStyle(undefined, styleOf(...layers)).layers).toEqual(layers);
  });

  test("レイヤー以外の設定はそのまま保つ", () => {
    const style = { ...styleOf(), glyphs: "https://example.com/{fontstack}/{range}" };

    expect(adjustMapStyle(undefined, style).glyphs).toBe(style.glyphs);
  });
});

import { MapPin } from "lucide-react";
import { describe, expect, test } from "vite-plus/test";
import { poiKindColor, poiKindIcon } from "./PoiKindIcon.tsx";

describe("poiKindIcon", () => {
  test("API の語彙の種類には、それぞれ専用のアイコンがある", () => {
    const kinds = [
      "restaurant",
      "cafe",
      "fast_food",
      "bakery",
      "bar_izakaya",
      "grocery",
      "convenience_store",
      "retail_other",
      "lodging",
      "tourism",
      "medical",
      "education",
      "public_facility",
      "finance",
      "service_other",
      "station",
    ];

    const icons = kinds.map(poiKindIcon);

    expect(icons).not.toContain(MapPin);
    expect(new Set(icons).size).toBe(kinds.length);
  });

  test.each(["unknown", "", "飲食店営業", "constructor"])(
    "種類がわからない施設（%s）はピンにする",
    (kind) => {
      expect(poiKindIcon(kind)).toBe(MapPin);
    },
  );
});

describe("poiKindColor", () => {
  test("同じまとまりの種類は同じ色にする", () => {
    expect(poiKindColor("cafe")).toEqual(poiKindColor("restaurant"));
    expect(poiKindColor("grocery")).toEqual(poiKindColor("convenience_store"));
  });

  test("飲食・買い物・宿泊・医療はそれぞれ違う色にする", () => {
    const pins = ["restaurant", "grocery", "lodging", "medical"].map(
      (kind) => poiKindColor(kind).pin,
    );

    expect(new Set(pins).size).toBe(pins.length);
  });

  test("種類がわからない施設にも色を返す", () => {
    expect(poiKindColor("unknown").pin).toBe(poiKindColor("未知の値").pin);
  });
});

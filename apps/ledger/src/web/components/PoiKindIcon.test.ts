import { MapPin } from "lucide-react";
import { describe, expect, test } from "vite-plus/test";
import { poiKindIcon } from "./PoiKindIcon.tsx";

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

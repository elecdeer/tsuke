import { describe, expect, test } from "vite-plus/test";
import { placeDetailColumns } from "./placeDetail.ts";

describe("placeDetailColumns", () => {
  test("情報がなければ何も足さない", () => {
    expect(placeDetailColumns(null)).toEqual({});
    expect(placeDetailColumns(undefined)).toEqual({});
  });

  test("空のチェーンは null にし、施設がなければ施設の列は足さない", () => {
    expect(placeDetailColumns({ chain: "", poi: null })).toEqual({ chain: null });
  });

  test("施設の情報を列にする", () => {
    expect(
      placeDetailColumns({
        chain: "ローソン",
        poi: {
          address: "",
          lng: 139,
          lat: 35,
          category: "",
          licenses: ["Apache-2.0"],
          attributions: ["Overture"],
        },
      }),
    ).toEqual({
      chain: "ローソン",
      address: null,
      lng: 139,
      lat: 35,
      poiCategory: null,
      poiLicenses: ["Apache-2.0"],
      poiAttributions: ["Overture"],
    });
  });
});

import * as v from "valibot";
import type { places } from "../../db/schema.ts";

const LabelSchema = v.pipe(v.string(), v.trim(), v.maxLength(200));
const SourceListSchema = v.pipe(v.array(v.pipe(v.string(), v.maxLength(500))), v.maxLength(20));

/**
 * 新しく作る店舗に付ける情報。poi は OpenPOI の施設から作るときだけ持つ。
 *
 * すでにある店舗には効かない。名前が同じだけで別の支店の住所を書き込まないよう、既存の行は変えない。
 */
export const PlaceDetailSchema = v.object({
  chain: LabelSchema,
  poi: v.nullable(
    v.object({
      address: v.pipe(v.string(), v.trim(), v.maxLength(500)),
      lng: v.number(),
      lat: v.number(),
      category: LabelSchema,
      licenses: SourceListSchema,
      attributions: SourceListSchema,
    }),
  ),
});

export type PlaceDetail = v.InferOutput<typeof PlaceDetailSchema>;

type PlaceDetailColumns = Pick<
  typeof places.$inferInsert,
  "chain" | "address" | "lng" | "lat" | "poiCategory" | "poiLicenses" | "poiAttributions"
>;

/**
 * 店舗の情報を places の列にする。空のチェーンや住所は null にする。
 */
export const placeDetailColumns = (detail: PlaceDetail | null | undefined): PlaceDetailColumns => {
  if (detail === null || detail === undefined) return {};
  const { chain, poi } = detail;
  return {
    chain: chain === "" ? null : chain,
    ...(poi !== null && {
      address: poi.address === "" ? null : poi.address,
      lng: poi.lng,
      lat: poi.lat,
      poiCategory: poi.category === "" ? null : poi.category,
      poiLicenses: poi.licenses,
      poiAttributions: poi.attributions,
    }),
  };
};

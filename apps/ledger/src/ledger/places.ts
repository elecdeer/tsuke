import { and, eq, notExists } from "drizzle-orm";
import * as v from "valibot";
import { places, transactions } from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import { type PlaceDetail, placeDetailColumns } from "./placeDetail.ts";

const PlaceNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "店舗名を入力してください"),
  v.maxLength(200),
);

/** 店舗の編集の入力 */
export const PlaceUpdateSchema = v.object({
  name: PlaceNameSchema,
  aliases: v.pipe(v.array(PlaceNameSchema), v.maxLength(100)),
  aiHint: v.pipe(v.string(), v.trim(), v.maxLength(500)),
});

export type PlaceUpdate = v.InferOutput<typeof PlaceUpdateSchema>;

export type PlaceEditResult = { ok: true } | { ok: false; status: 400 | 404 | 409; error: string };

const NOT_FOUND = { ok: false, status: 404, error: "店舗が見つかりません" } as const;

/**
 * 別名の重複と、店舗名そのものと同じ別名を取り除く。
 */
const cleanAliases = (name: string, aliases: string[]): string[] =>
  [...new Set(aliases)].filter((alias) => alias !== name);

/**
 * 店舗の名前と、AI の読み取りに渡す別名・ヒントを書き換える。
 *
 * 取引は店舗を ID で参照するので、名前を変えても書き換えなくて済む。
 */
export const updatePlace = async (
  db: LedgerDb,
  id: number,
  input: PlaceUpdate,
): Promise<PlaceEditResult> => {
  const rows = await db.select({ id: places.id }).from(places).where(eq(places.name, input.name));
  if (rows.some((row) => row.id !== id)) {
    return {
      ok: false,
      status: 409,
      error: `「${input.name}」はすでにあります。まとめるときは統合してください`,
    };
  }
  const updated = await db
    .update(places)
    .set({
      name: input.name,
      aliases: cleanAliases(input.name, input.aliases),
      aiHint: input.aiHint === "" ? null : input.aiHint,
    })
    .where(eq(places.id, id))
    .returning({ id: places.id });
  return updated.length === 0 ? NOT_FOUND : { ok: true };
};

/**
 * 店舗を別の店舗にまとめる。取引を統合先へ付け替えて、統合元を消す。
 *
 * 統合元の名前は統合先の別名に残す。同じ表記の明細やレシートを AI が読んだときに、統合先として扱えるようにするため。
 * チェーンと OpenPOI の情報は、統合先になければ引き継ぐ。OpenPOI の施設は後から引き直せないので、消すと失われる。
 * OpenPOI の情報は出典と組なので、項目ごとに混ぜず、統合先に施設の情報がないときにまとめて移す。
 * 統合元をアーカイブせず消すのは、名前が残っていると同じ表記の登録が隠れた統合元に付いてしまうため。
 * 統合先がアーカイブ済みなら、取引が増えてまた使う店舗になるので元に戻す。
 */
export const mergePlace = async (
  db: LedgerDb,
  sourceId: number,
  targetId: number,
): Promise<PlaceEditResult> => {
  if (sourceId === targetId) {
    return { ok: false, status: 400, error: "同じ店舗には統合できません" };
  }
  const [[source], [target]] = await Promise.all(
    [sourceId, targetId].map((id) =>
      db
        .select({
          name: places.name,
          aliases: places.aliases,
          aiHint: places.aiHint,
          chain: places.chain,
          address: places.address,
          lng: places.lng,
          lat: places.lat,
          poiCategory: places.poiCategory,
          poiLicenses: places.poiLicenses,
          poiAttributions: places.poiAttributions,
        })
        .from(places)
        .where(eq(places.id, id)),
    ),
  );
  if (source === undefined || target === undefined) return NOT_FOUND;

  await db.batch([
    db.update(transactions).set({ placeId: targetId }).where(eq(transactions.placeId, sourceId)),
    db
      .update(places)
      .set({
        aliases: cleanAliases(target.name, [...target.aliases, source.name, ...source.aliases]),
        aiHint: target.aiHint ?? source.aiHint,
        chain: target.chain ?? source.chain,
        ...(target.lng === null && {
          address: source.address,
          lng: source.lng,
          lat: source.lat,
          poiCategory: source.poiCategory,
          poiLicenses: source.poiLicenses,
          poiAttributions: source.poiAttributions,
        }),
        archived: false,
      })
      .where(eq(places.id, targetId)),
    db.delete(places).where(eq(places.id, sourceId)),
  ]);
  return { ok: true };
};

/**
 * 取引が 1 件もない店舗を消す。取引がある店舗は消さない。
 */
export const deleteUnusedPlace = async (db: LedgerDb, id: number): Promise<PlaceEditResult> => {
  const deleted = await db
    .delete(places)
    .where(
      and(
        eq(places.id, id),
        notExists(
          db.select({ id: transactions.id }).from(transactions).where(eq(transactions.placeId, id)),
        ),
      ),
    )
    .returning({ id: places.id });
  if (deleted.length > 0) return { ok: true };

  const [exists] = await db.select({ id: places.id }).from(places).where(eq(places.id, id));
  return exists === undefined
    ? NOT_FOUND
    : { ok: false, status: 409, error: "取引がある店舗は削除できません" };
};

/**
 * 名前で店舗を作る batch の文を返す。同じ名前のアーカイブ済みの店舗があれば、また使う店舗として元に戻す。
 *
 * すでにある店舗の情報は変えない（`PlaceDetailSchema` を参照）。
 */
export const upsertPlaceByName = (
  db: LedgerDb,
  name: string,
  detail: PlaceDetail | null | undefined,
) =>
  db
    .insert(places)
    .values({ name, ...placeDetailColumns(detail) })
    .onConflictDoUpdate({
      target: places.name,
      set: { archived: false },
      setWhere: eq(places.archived, true),
    });

import { eq, type SQL, sql } from "drizzle-orm";
import { genres, transactionItems } from "../../db/schema.ts";

/**
 * 品目のカテゴリの ID。内訳のある品目はカテゴリを持たず内訳の親から引くので、
 * この式を使うクエリでは `itemGenreJoin` で内訳を結合しておく。
 */
export const itemCategoryId: SQL<number | null> = sql<
  number | null
>`coalesce(${transactionItems.categoryId}, ${genres.categoryId})`;

/** `itemCategoryId` のために品目の内訳を結合する条件 */
export const itemGenreJoin: SQL = eq(genres.id, transactionItems.genreId);

/**
 * 品目に保存するカテゴリを返す。内訳があればカテゴリは内訳の親から引くので null にする。
 */
export const storedCategoryId = (item: {
  categoryId: number | null;
  genreId: number | null;
}): number | null => (item.genreId === null ? item.categoryId : null);

import { and, asc, eq, max } from "drizzle-orm";
import * as v from "valibot";
import { categories, genres } from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import type { CategoryMode } from "./masters.ts";
import {
  type MasterEditResult,
  masterNameSchema,
  type MoveOffset,
  moveInOrder,
  nameConflictMessage,
} from "./masterEdit.ts";

export const CategoryNameSchema = masterNameSchema("カテゴリ名");
export const GenreNameSchema = masterNameSchema("内訳名");

const CATEGORY_NOT_FOUND = { ok: false, status: 404, error: "カテゴリが見つかりません" } as const;
const GENRE_NOT_FOUND = { ok: false, status: 404, error: "内訳が見つかりません" } as const;

/**
 * 同じ種類に同じ名前の別のカテゴリがあれば、その文言を返す。
 */
const findCategoryConflict = async (
  db: LedgerDb,
  mode: CategoryMode,
  name: string,
  id: number | null,
): Promise<string | null> => {
  const rows = await db
    .select({ id: categories.id, archived: categories.archived })
    .from(categories)
    .where(and(eq(categories.mode, mode), eq(categories.name, name)));
  const other = rows.find((row) => row.id !== id);
  return other === undefined ? null : nameConflictMessage(name, other.archived);
};

/**
 * 同じカテゴリに同じ名前の別の内訳があれば、その文言を返す。
 */
const findGenreConflict = async (
  db: LedgerDb,
  categoryId: number,
  name: string,
  id: number | null,
): Promise<string | null> => {
  const rows = await db
    .select({ id: genres.id, archived: genres.archived })
    .from(genres)
    .where(and(eq(genres.categoryId, categoryId), eq(genres.name, name)));
  const other = rows.find((row) => row.id !== id);
  return other === undefined ? null : nameConflictMessage(name, other.archived);
};

/**
 * カテゴリを同じ種類の並びの最後に追加する。
 */
export const createCategory = async (
  db: LedgerDb,
  mode: CategoryMode,
  name: string,
): Promise<MasterEditResult> => {
  const conflict = await findCategoryConflict(db, mode, name, null);
  if (conflict !== null) return { ok: false, status: 409, error: conflict };
  const [last] = await db
    .select({ sort: max(categories.sort) })
    .from(categories)
    .where(eq(categories.mode, mode));
  await db.insert(categories).values({ mode, name, sort: (last?.sort ?? -1) + 1 });
  return { ok: true };
};

/**
 * カテゴリの名前を変える。品目は ID で参照するので書き換えなくて済む。
 */
export const renameCategory = async (
  db: LedgerDb,
  id: number,
  name: string,
): Promise<MasterEditResult> => {
  const [category] = await db
    .select({ mode: categories.mode })
    .from(categories)
    .where(eq(categories.id, id));
  if (category === undefined) return CATEGORY_NOT_FOUND;
  const conflict = await findCategoryConflict(db, category.mode, name, id);
  if (conflict !== null) return { ok: false, status: 409, error: conflict };
  await db.update(categories).set({ name }).where(eq(categories.id, id));
  return { ok: true };
};

/**
 * カテゴリをアーカイブするか元に戻す。アーカイブすると、その内訳も入力の候補に出なくなる。
 */
export const setCategoryArchived = async (
  db: LedgerDb,
  id: number,
  archived: boolean,
): Promise<MasterEditResult> => {
  const updated = await db
    .update(categories)
    .set({ archived })
    .where(eq(categories.id, id))
    .returning({ id: categories.id });
  return updated.length === 0 ? CATEGORY_NOT_FOUND : { ok: true };
};

/**
 * アーカイブしていないカテゴリの並びの中で、カテゴリを前後へ動かす。
 *
 * 取り込んだカテゴリは sort がすべて 0 なので、入れ替える 2 件だけでなく全件に番号を振り直す。
 */
export const moveCategory = async (
  db: LedgerDb,
  id: number,
  offset: MoveOffset,
): Promise<MasterEditResult> => {
  const [category] = await db
    .select({ mode: categories.mode })
    .from(categories)
    .where(eq(categories.id, id));
  if (category === undefined) return CATEGORY_NOT_FOUND;
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.mode, category.mode), eq(categories.archived, false)))
    .orderBy(asc(categories.sort), asc(categories.id));
  const order = moveInOrder(
    rows.map((row) => row.id),
    id,
    offset,
  );
  if (order === null) return CATEGORY_NOT_FOUND;
  const [first, ...rest] = order.map((categoryId, sort) =>
    db.update(categories).set({ sort }).where(eq(categories.id, categoryId)),
  );
  if (first !== undefined) await db.batch([first, ...rest]);
  return { ok: true };
};

/**
 * 内訳をカテゴリの並びの最後に追加する。収入は内訳を持たないので、支出のカテゴリにだけ追加できる。
 */
export const createGenre = async (
  db: LedgerDb,
  categoryId: number,
  name: string,
): Promise<MasterEditResult> => {
  const [category] = await db
    .select({ mode: categories.mode })
    .from(categories)
    .where(eq(categories.id, categoryId));
  if (category === undefined) return CATEGORY_NOT_FOUND;
  if (category.mode !== "payment") {
    return { ok: false, status: 400, error: "収入のカテゴリには内訳を追加できません" };
  }
  const conflict = await findGenreConflict(db, categoryId, name, null);
  if (conflict !== null) return { ok: false, status: 409, error: conflict };
  const [last] = await db
    .select({ sort: max(genres.sort) })
    .from(genres)
    .where(eq(genres.categoryId, categoryId));
  await db.insert(genres).values({ categoryId, name, sort: (last?.sort ?? -1) + 1 });
  return { ok: true };
};

/**
 * 内訳の名前を変える。品目は ID で参照するので書き換えなくて済む。
 */
export const renameGenre = async (
  db: LedgerDb,
  id: number,
  name: string,
): Promise<MasterEditResult> => {
  const [genre] = await db
    .select({ categoryId: genres.categoryId })
    .from(genres)
    .where(eq(genres.id, id));
  if (genre === undefined) return GENRE_NOT_FOUND;
  const conflict = await findGenreConflict(db, genre.categoryId, name, id);
  if (conflict !== null) return { ok: false, status: 409, error: conflict };
  await db.update(genres).set({ name }).where(eq(genres.id, id));
  return { ok: true };
};

/**
 * 内訳をアーカイブするか元に戻す。
 */
export const setGenreArchived = async (
  db: LedgerDb,
  id: number,
  archived: boolean,
): Promise<MasterEditResult> => {
  const updated = await db
    .update(genres)
    .set({ archived })
    .where(eq(genres.id, id))
    .returning({ id: genres.id });
  return updated.length === 0 ? GENRE_NOT_FOUND : { ok: true };
};

/**
 * アーカイブしていない内訳の並びの中で、内訳を前後へ動かす。全件に番号を振り直すのはカテゴリと同じ理由。
 */
export const moveGenre = async (
  db: LedgerDb,
  id: number,
  offset: MoveOffset,
): Promise<MasterEditResult> => {
  const [genre] = await db
    .select({ categoryId: genres.categoryId })
    .from(genres)
    .where(eq(genres.id, id));
  if (genre === undefined) return GENRE_NOT_FOUND;
  const rows = await db
    .select({ id: genres.id })
    .from(genres)
    .where(and(eq(genres.categoryId, genre.categoryId), eq(genres.archived, false)))
    .orderBy(asc(genres.sort), asc(genres.id));
  const order = moveInOrder(
    rows.map((row) => row.id),
    id,
    offset,
  );
  if (order === null) return GENRE_NOT_FOUND;
  const [first, ...rest] = order.map((genreId, sort) =>
    db.update(genres).set({ sort }).where(eq(genres.id, genreId)),
  );
  if (first !== undefined) await db.batch([first, ...rest]);
  return { ok: true };
};

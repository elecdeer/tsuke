import { and, asc, count, desc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import { accounts, categories, genres, places, transactions } from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";

export type CategoryMode = "payment" | "income";

/**
 * アーカイブしていない口座を並び順で返す。
 */
export const listAccounts = async (db: LedgerDb): Promise<{ id: number; name: string }[]> =>
  db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.archived, false))
    .orderBy(asc(accounts.sort), asc(accounts.id));

export type AccountWithHint = { id: number; name: string; aiHint: string | null };

/**
 * アーカイブしていない口座を、AI の読み取りに渡すヒントを付けて並び順で返す。
 *
 * listAccounts と分けるのは、拡張機能が読む `GET /api/accounts` の形を変えないため。
 */
export const listAccountsWithHint = async (db: LedgerDb): Promise<AccountWithHint[]> =>
  db
    .select({ id: accounts.id, name: accounts.name, aiHint: accounts.aiHint })
    .from(accounts)
    .where(eq(accounts.archived, false))
    .orderBy(asc(accounts.sort), asc(accounts.id));

export type ManagedAccount = AccountWithHint & { archived: boolean };

/**
 * 管理画面に出す口座を返す。アーカイブ済みの口座は並び順の後ろに続ける。
 */
export const listManagedAccounts = async (db: LedgerDb): Promise<ManagedAccount[]> =>
  db
    .select({
      id: accounts.id,
      name: accounts.name,
      aiHint: accounts.aiHint,
      archived: accounts.archived,
    })
    .from(accounts)
    .orderBy(asc(accounts.archived), asc(accounts.sort), asc(accounts.id));

export type CategoryWithGenres = {
  id: number;
  name: string;
  genres: { id: number; name: string }[];
};

/**
 * アーカイブしていないカテゴリと、その中のアーカイブしていない内訳を並び順で返す。
 */
export const listCategories = async (
  db: LedgerDb,
  mode: CategoryMode,
): Promise<CategoryWithGenres[]> => {
  const categoryRows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.mode, mode), eq(categories.archived, false)))
    .orderBy(asc(categories.sort), asc(categories.id));
  if (categoryRows.length === 0) return [];

  const genreRows = await db
    .select({ id: genres.id, name: genres.name, categoryId: genres.categoryId })
    .from(genres)
    .where(
      and(
        inArray(
          genres.categoryId,
          categoryRows.map((category) => category.id),
        ),
        eq(genres.archived, false),
      ),
    )
    .orderBy(asc(genres.sort), asc(genres.id));

  return categoryRows.map((category) => ({
    ...category,
    genres: genreRows
      .filter((genre) => genre.categoryId === category.id)
      .map(({ id, name }) => ({ id, name })),
  }));
};

export type ManagedCategory = {
  id: number;
  name: string;
  archived: boolean;
  genres: { id: number; name: string; archived: boolean }[];
};

/**
 * 管理画面に出すカテゴリと内訳を返す。どちらもアーカイブ済みのものは並び順の後ろに続ける。
 */
export const listManagedCategories = async (
  db: LedgerDb,
  mode: CategoryMode,
): Promise<ManagedCategory[]> => {
  const [categoryRows, genreRows] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name, archived: categories.archived })
      .from(categories)
      .where(eq(categories.mode, mode))
      .orderBy(asc(categories.archived), asc(categories.sort), asc(categories.id)),
    db
      .select({
        id: genres.id,
        name: genres.name,
        archived: genres.archived,
        categoryId: genres.categoryId,
      })
      .from(genres)
      .innerJoin(categories, eq(categories.id, genres.categoryId))
      .where(eq(categories.mode, mode))
      .orderBy(asc(genres.archived), asc(genres.sort), asc(genres.id)),
  ]);
  return categoryRows.map((category) => ({
    ...category,
    genres: genreRows
      .filter((genre) => genre.categoryId === category.id)
      .map(({ id, name, archived }) => ({ id, name, archived })),
  }));
};

export type PlaceWithUsage = {
  id: number;
  name: string;
  /** 最後に取引で使った日（YYYY-MM-DD）。使ったことがなければ null */
  lastUsedOn: string | null;
  useCount: number;
};

/**
 * 店舗ごとの最終利用日と利用回数を集計するサブクエリを作る。
 */
const placeUsage = (db: LedgerDb) =>
  db
    .select({
      placeId: transactions.placeId,
      lastUsedOn: max(transactions.date).as("last_used_on"),
      useCount: count().as("use_count"),
    })
    .from(transactions)
    .groupBy(transactions.placeId)
    .as("usage");

/**
 * アーカイブしていない店舗を、最後に使った日の新しい順で返す。使ったことのない店舗は後ろに名前順で並べる。
 */
export const listPlaces = async (db: LedgerDb): Promise<PlaceWithUsage[]> => {
  const usage = placeUsage(db);
  return db
    .select({
      id: places.id,
      name: places.name,
      lastUsedOn: usage.lastUsedOn,
      useCount: sql<number>`coalesce(${usage.useCount}, 0)`,
    })
    .from(places)
    .leftJoin(usage, eq(usage.placeId, places.id))
    .where(eq(places.archived, false))
    .orderBy(sql`${usage.lastUsedOn} IS NULL`, desc(usage.lastUsedOn), asc(places.name));
};

/**
 * アーカイブしていない店舗に付いているチェーンの名前を、名前順で返す。
 */
export const listChains = async (db: LedgerDb): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ chain: places.chain })
    .from(places)
    .where(and(isNotNull(places.chain), eq(places.archived, false)))
    .orderBy(asc(places.chain));
  return rows.flatMap(({ chain }) => (chain === null ? [] : [chain]));
};

export type ManagedPlace = PlaceWithUsage & {
  aliases: string[];
  aiHint: string | null;
  phone: string | null;
  archived: boolean;
};

/**
 * 管理画面に出す店舗を返す。別名とヒントを付け、アーカイブ済みの店舗も含める。並びは listPlaces と同じ。
 */
export const listManagedPlaces = async (db: LedgerDb): Promise<ManagedPlace[]> => {
  const usage = placeUsage(db);
  return db
    .select({
      id: places.id,
      name: places.name,
      lastUsedOn: usage.lastUsedOn,
      useCount: sql<number>`coalesce(${usage.useCount}, 0)`,
      aliases: places.aliases,
      aiHint: places.aiHint,
      phone: places.phone,
      archived: places.archived,
    })
    .from(places)
    .leftJoin(usage, eq(usage.placeId, places.id))
    .orderBy(sql`${usage.lastUsedOn} IS NULL`, desc(usage.lastUsedOn), asc(places.name));
};

/**
 * AI の読み取りに渡す店舗を返す。別名とヒントを付け、アーカイブ済みの店舗は候補にしない。
 */
export const listPlacesForExtraction = async (db: LedgerDb): Promise<ManagedPlace[]> =>
  (await listManagedPlaces(db)).filter((place) => !place.archived);

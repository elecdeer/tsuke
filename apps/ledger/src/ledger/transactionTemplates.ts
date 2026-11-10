import { asc, desc, eq } from "drizzle-orm";
import { categories, genres, places, transactionItems, transactions } from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import type { Aggregation, TransactionMode } from "./transactions.ts";

/** 手入力の登録で雛形にする、よく使う取引 */
export type TransactionTemplate = {
  id: number;
  mode: TransactionMode;
  aggregation: Aggregation;
  fromAccountId: number | null;
  toAccountId: number | null;
  placeName: string | null;
  /** 並び順 */
  items: {
    categoryId: number | null;
    genreId: number | null;
    categoryName: string | null;
    genreName: string | null;
    name: string | null;
    memo: string | null;
    amount: number;
  }[];
};

/**
 * 取引をよく使う取引にしたか返す。取引がなければ false を返す。
 *
 * `getTransaction` に含めないのは、編集フォームが取引の中身を key にして作り直すため。
 * 印を付けただけで入力中の値が消えないよう、取引の中身とは別に読む。
 */
export const isTransactionFavorite = async (db: LedgerDb, id: number): Promise<boolean> => {
  const [row] = await db
    .select({ isFavorite: transactions.isFavorite })
    .from(transactions)
    .where(eq(transactions.id, id));
  return row?.isFavorite ?? false;
};

/**
 * 取引のよく使う印を付け外しする。
 */
export const setTransactionFavorite = async (
  db: LedgerDb,
  id: number,
  favorite: boolean,
): Promise<{ ok: true } | { ok: false; status: 404; error: string }> => {
  const [updated] = await db
    .update(transactions)
    .set({ isFavorite: favorite })
    .where(eq(transactions.id, id))
    .returning({ id: transactions.id });
  return updated === undefined
    ? { ok: false, status: 404, error: "取引が見つかりません" }
    : { ok: true };
};

/**
 * よく使う取引を、日付の新しい順に品目付きで返す。
 */
export const listTransactionTemplates = async (db: LedgerDb): Promise<TransactionTemplate[]> => {
  const [rows, itemRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        mode: transactions.mode,
        aggregation: transactions.aggregation,
        fromAccountId: transactions.fromAccountId,
        toAccountId: transactions.toAccountId,
        placeName: places.name,
      })
      .from(transactions)
      .leftJoin(places, eq(places.id, transactions.placeId))
      .where(eq(transactions.isFavorite, true))
      .orderBy(desc(transactions.date), desc(transactions.id)),
    db
      .select({
        transactionId: transactionItems.transactionId,
        categoryId: transactionItems.categoryId,
        genreId: transactionItems.genreId,
        categoryName: categories.name,
        genreName: genres.name,
        name: transactionItems.name,
        memo: transactionItems.memo,
        amount: transactionItems.amount,
      })
      .from(transactionItems)
      .innerJoin(transactions, eq(transactions.id, transactionItems.transactionId))
      .leftJoin(categories, eq(categories.id, transactionItems.categoryId))
      .leftJoin(genres, eq(genres.id, transactionItems.genreId))
      .where(eq(transactions.isFavorite, true))
      .orderBy(asc(transactionItems.sort), asc(transactionItems.id)),
  ]);
  return rows.map((row) => ({
    ...row,
    items: itemRows
      .filter((item) => item.transactionId === row.id)
      .map(({ transactionId: _transactionId, ...item }) => item),
  }));
};

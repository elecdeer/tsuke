import { and, asc, desc, eq, gt, gte, inArray, lt, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  accounts,
  categories,
  genres,
  places,
  transactionItems,
  transactions,
} from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import { periodRange } from "./dates.ts";
import { hasUnreceivedAdvance, linkedAmountSql } from "./reimbursements.ts";

export type TransactionMode = (typeof transactions.$inferSelect)["mode"];
export type Aggregation = (typeof transactions.$inferSelect)["aggregation"];

/** 取引の一覧の絞り込み。period 以外は省略できる */
export type TransactionFilter = {
  /** 一覧にする期間。月（YYYY-MM）か年（YYYY） */
  period: string;
  mode?: TransactionMode | undefined;
  /** 支払元か入金先のどちらかがこの口座の取引 */
  accountId?: number | undefined;
  /** このカテゴリの品目を 1 つでも含む取引 */
  categoryId?: number | undefined;
  /** この内訳の品目を 1 つでも含む取引 */
  genreId?: number | undefined;
  placeId?: number | undefined;
  /** このチェーンの店舗の取引 */
  chain?: string | undefined;
  /** 立替のある支出（any）か、未入金の残りがある支出（unreceived） */
  advance?: "any" | "unreceived" | undefined;
};

export type TransactionListItem = {
  id: number;
  date: string;
  mode: TransactionMode;
  aggregation: Aggregation;
  fromAccountName: string | null;
  toAccountName: string | null;
  placeId: number | null;
  placeName: string | null;
  /** 並び順 */
  items: {
    name: string | null;
    memo: string | null;
    categoryName: string | null;
    genreName: string | null;
    amount: number;
  }[];
  /** 品目の金額の合計 */
  total: number;
  /** 支出のうち立替の額 */
  advanceAmount: number;
  /** 紐付けた収入から充てた額の合計 */
  linkedAmount: number;
};

const fromAccounts = alias(accounts, "from_accounts");
const toAccounts = alias(accounts, "to_accounts");

/**
 * 絞り込みの条件を WHERE 句にする。
 *
 * カテゴリ・内訳は、一覧に出す品目の結合とは別の副問い合わせで絞る。条件に合わない品目も、取引の品目として一覧に出すため。
 */
const filterConditions = (db: LedgerDb, filter: TransactionFilter): SQL[] => {
  const { start, end } = periodRange(filter.period);
  const conditions: SQL[] = [gte(transactions.date, start), lt(transactions.date, end)];
  if (filter.advance === "unreceived") conditions.push(hasUnreceivedAdvance);
  if (filter.advance === "any") conditions.push(gt(transactions.advanceAmount, 0));
  if (filter.mode !== undefined) conditions.push(eq(transactions.mode, filter.mode));
  if (filter.accountId !== undefined) {
    const accountCondition = or(
      eq(transactions.fromAccountId, filter.accountId),
      eq(transactions.toAccountId, filter.accountId),
    );
    if (accountCondition !== undefined) conditions.push(accountCondition);
  }
  if (filter.placeId !== undefined) conditions.push(eq(transactions.placeId, filter.placeId));
  if (filter.chain !== undefined) {
    conditions.push(
      inArray(
        transactions.placeId,
        db.select({ id: places.id }).from(places).where(eq(places.chain, filter.chain)),
      ),
    );
  }

  const itemConditions: SQL[] = [];
  if (filter.categoryId !== undefined) {
    itemConditions.push(eq(transactionItems.categoryId, filter.categoryId));
  }
  if (filter.genreId !== undefined)
    itemConditions.push(eq(transactionItems.genreId, filter.genreId));
  if (itemConditions.length > 0) {
    conditions.push(
      inArray(
        transactions.id,
        db
          .select({ id: transactionItems.transactionId })
          .from(transactionItems)
          .where(and(...itemConditions)),
      ),
    );
  }
  return conditions;
};

/**
 * 絞り込みの条件に合う取引を、日付の新しい順に返す。同じ日は ID の新しい順。期間（月か年）の中の取引だけを返す。
 */
export const listTransactions = async (
  db: LedgerDb,
  filter: TransactionFilter,
): Promise<TransactionListItem[]> => {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      mode: transactions.mode,
      aggregation: transactions.aggregation,
      fromAccountName: fromAccounts.name,
      toAccountName: toAccounts.name,
      placeId: transactions.placeId,
      placeName: places.name,
      advanceAmount: transactions.advanceAmount,
      linkedAmount: linkedAmountSql,
      itemName: transactionItems.name,
      itemMemo: transactionItems.memo,
      categoryName: categories.name,
      genreName: genres.name,
      amount: transactionItems.amount,
    })
    .from(transactions)
    .innerJoin(transactionItems, eq(transactionItems.transactionId, transactions.id))
    .leftJoin(fromAccounts, eq(fromAccounts.id, transactions.fromAccountId))
    .leftJoin(toAccounts, eq(toAccounts.id, transactions.toAccountId))
    .leftJoin(places, eq(places.id, transactions.placeId))
    .leftJoin(categories, eq(categories.id, transactionItems.categoryId))
    .leftJoin(genres, eq(genres.id, transactionItems.genreId))
    .where(and(...filterConditions(db, filter)))
    .orderBy(
      desc(transactions.date),
      desc(transactions.id),
      asc(transactionItems.sort),
      asc(transactionItems.id),
    );

  const byId = new Map<number, TransactionListItem>();
  for (const row of rows) {
    const listed = byId.get(row.id) ?? {
      id: row.id,
      date: row.date,
      mode: row.mode,
      aggregation: row.aggregation,
      fromAccountName: row.fromAccountName,
      toAccountName: row.toAccountName,
      placeId: row.placeId,
      placeName: row.placeName,
      items: [],
      total: 0,
      advanceAmount: row.advanceAmount,
      linkedAmount: row.linkedAmount,
    };
    listed.items.push({
      name: row.itemName,
      memo: row.itemMemo,
      categoryName: row.categoryName,
      genreName: row.genreName,
      amount: row.amount,
    });
    listed.total += row.amount;
    byId.set(row.id, listed);
  }
  // Map は入れた順を保つので、SQL の並びのまま返る
  return [...byId.values()];
};

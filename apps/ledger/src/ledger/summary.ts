import { and, asc, eq, gt, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { categories, genres, transactionItems, transactions } from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import { advanceSharesOf } from "./advance.ts";
import { monthRange } from "./dates.ts";
import type { CategoryMode } from "./masters.ts";

/** カテゴリのない品目をまとめる名前 */
export const UNCATEGORIZED_NAME = "未分類";
/** 内訳のない品目をまとめる名前 */
export const NO_GENRE_NAME = "内訳なし";

export type GenreTotal = { genreId: number | null; name: string; amount: number };

export type CategoryTotal = {
  categoryId: number | null;
  name: string;
  amount: number;
  /** 金額の多い順 */
  genres: GenreTotal[];
};

export type ModeSummary = {
  total: number;
  /** 金額の多い順 */
  categories: CategoryTotal[];
};

export type MonthlySummary = Record<CategoryMode, ModeSummary>;

type SummaryRow = {
  mode: string;
  categoryId: number | null;
  categoryName: string | null;
  genreId: number | null;
  genreName: string | null;
  amount: number;
};

/**
 * 金額の多い順に並べる。同じ金額なら ID の小さい順（ID のないものは後ろ）。
 */
const byAmountDesc = <T extends { amount: number }>(
  idOf: (value: T) => number | null,
): ((a: T, b: T) => number) => {
  return (a, b) =>
    b.amount - a.amount ||
    (idOf(a) ?? Number.MAX_SAFE_INTEGER) - (idOf(b) ?? Number.MAX_SAFE_INTEGER);
};

/**
 * 1 つの種類（支出か収入）の集計の行を、カテゴリと内訳の木にまとめる。
 */
const buildModeSummary = (rows: SummaryRow[]): ModeSummary => {
  const byCategory = new Map<number | null, CategoryTotal>();
  for (const row of rows) {
    const category = byCategory.get(row.categoryId) ?? {
      categoryId: row.categoryId,
      name: row.categoryName ?? UNCATEGORIZED_NAME,
      amount: 0,
      genres: [],
    };
    category.amount += row.amount;
    category.genres.push({
      genreId: row.genreId,
      name: row.genreName ?? NO_GENRE_NAME,
      amount: row.amount,
    });
    byCategory.set(row.categoryId, category);
  }

  const categoryTotals = [...byCategory.values()]
    .map((category) => ({
      ...category,
      genres: [...category.genres].sort(byAmountDesc<GenreTotal>((genre) => genre.genreId)),
    }))
    .sort(byAmountDesc<CategoryTotal>((category) => category.categoryId));

  return {
    total: categoryTotals.reduce((total, category) => total + category.amount, 0),
    categories: categoryTotals,
  };
};

/** カテゴリと内訳の組み合わせを表すキー */
const groupKey = (categoryId: number | null, genreId: number | null): string =>
  `${categoryId}:${genreId}`;

/**
 * 月の支出の立替の按分額を、カテゴリと内訳ごとに合計する。
 *
 * 端数の調整は取引ごとに行うので、SQL では合計せず、品目を読んで計算する。
 */
const sumAdvanceShares = async (
  db: LedgerDb,
  { start, end }: { start: string; end: string },
): Promise<Map<string, number>> => {
  const rows = await db
    .select({
      transactionId: transactions.id,
      advanceAmount: transactions.advanceAmount,
      categoryId: transactionItems.categoryId,
      genreId: transactionItems.genreId,
      amount: transactionItems.amount,
      isAdvanceTarget: transactionItems.isAdvanceTarget,
    })
    .from(transactionItems)
    .innerJoin(transactions, eq(transactions.id, transactionItems.transactionId))
    .where(
      and(
        gte(transactions.date, start),
        lt(transactions.date, end),
        eq(transactions.mode, "payment"),
        eq(transactions.aggregation, "always"),
        gt(transactions.advanceAmount, 0),
      ),
    )
    .orderBy(asc(transactions.id), asc(transactionItems.sort), asc(transactionItems.id));

  const byTransaction = new Map<number, typeof rows>();
  for (const row of rows) {
    byTransaction.set(row.transactionId, [...(byTransaction.get(row.transactionId) ?? []), row]);
  }
  const totals = new Map<string, number>();
  for (const items of byTransaction.values()) {
    const shares = advanceSharesOf(items, items[0]?.advanceAmount ?? 0);
    items.forEach((item, index) => {
      const key = groupKey(item.categoryId, item.genreId);
      totals.set(key, (totals.get(key) ?? 0) + (shares[index] ?? 0));
    });
  }
  return totals;
};

/**
 * 月の支出と収入を、カテゴリと内訳ごとに合計する。
 *
 * 集計の設定が「常に集計に含める」の取引だけを入れる。「年の集計にのみ含める」は月の集計には入れない。
 * 品目の金額は符号付きなので、値引きの品目はそのまま差し引かれる。
 * 支出は立替の按分額を引いた負担額で合計し、負担額が 0 になったカテゴリと内訳は出さない。
 */
export const summarizeMonth = async (db: LedgerDb, month: string): Promise<MonthlySummary> => {
  const { start, end } = monthRange(month);
  const [rows, advanceShares] = await Promise.all([
    db
      .select({
        mode: transactions.mode,
        categoryId: transactionItems.categoryId,
        categoryName: categories.name,
        genreId: transactionItems.genreId,
        genreName: genres.name,
        amount: sql<number>`cast(${sum(transactionItems.amount)} as integer)`,
      })
      .from(transactionItems)
      .innerJoin(transactions, eq(transactions.id, transactionItems.transactionId))
      .leftJoin(categories, eq(categories.id, transactionItems.categoryId))
      .leftJoin(genres, eq(genres.id, transactionItems.genreId))
      .where(
        and(
          gte(transactions.date, start),
          lt(transactions.date, end),
          inArray(transactions.mode, ["payment", "income"]),
          eq(transactions.aggregation, "always"),
        ),
      )
      .groupBy(transactions.mode, transactionItems.categoryId, transactionItems.genreId),
    sumAdvanceShares(db, { start, end }),
  ]);

  const paymentRows = rows
    .filter((row) => row.mode === "payment")
    .map((row) => ({
      ...row,
      amount: row.amount - (advanceShares.get(groupKey(row.categoryId, row.genreId)) ?? 0),
    }))
    .filter((row) => row.amount !== 0);

  return {
    payment: buildModeSummary(paymentRows),
    income: buildModeSummary(rows.filter((row) => row.mode === "income")),
  };
};

import { and, asc, eq, gt, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { categories, genres, transactionItems, transactions } from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import { advanceSharesOf } from "./advance.ts";
import { monthRange, monthsOfYear } from "./dates.ts";
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

/** カテゴリと内訳の組み合わせを、月ごとに分けて表すキー */
const groupKey = (month: string, categoryId: number | null, genreId: number | null): string =>
  `${month}:${categoryId}:${genreId}`;

/** 取引の集計の設定のうち、集計に入れるもの */
type Aggregation = "always" | "yearly_only";

/** 集計する期間（start 以上 end 未満）と、入れる取引の集計の設定 */
type SummaryScope = { start: string; end: string; aggregations: Aggregation[] };

/** 取引の日付が属する月（YYYY-MM） */
const monthOfDate = sql<string>`substr(${transactions.date}, 1, 7)`;

/**
 * 期間の支出の立替の按分額を、月とカテゴリと内訳ごとに合計する。
 *
 * 端数の調整は取引ごとに行うので、SQL では合計せず、品目を読んで計算する。
 */
const sumAdvanceShares = async (
  db: LedgerDb,
  { start, end, aggregations }: SummaryScope,
): Promise<Map<string, number>> => {
  const rows = await db
    .select({
      transactionId: transactions.id,
      date: transactions.date,
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
        inArray(transactions.aggregation, aggregations),
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
      const key = groupKey(item.date.slice(0, 7), item.categoryId, item.genreId);
      totals.set(key, (totals.get(key) ?? 0) + (shares[index] ?? 0));
    });
  }
  return totals;
};

type MonthlySummaryRow = SummaryRow & { month: string };

/**
 * 期間の支出と収入を、月とカテゴリと内訳ごとに合計する。
 *
 * 品目の金額は符号付きなので、値引きの品目はそのまま差し引かれる。
 * 支出は立替の按分額を引いた負担額で合計し、負担額が 0 になった組み合わせは出さない。
 */
const summarizeByMonth = async (
  db: LedgerDb,
  scope: SummaryScope,
): Promise<MonthlySummaryRow[]> => {
  const [rows, advanceShares] = await Promise.all([
    db
      .select({
        month: monthOfDate,
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
          gte(transactions.date, scope.start),
          lt(transactions.date, scope.end),
          inArray(transactions.mode, ["payment", "income"]),
          inArray(transactions.aggregation, scope.aggregations),
        ),
      )
      .groupBy(
        monthOfDate,
        transactions.mode,
        transactionItems.categoryId,
        transactionItems.genreId,
      ),
    sumAdvanceShares(db, scope),
  ]);

  return rows
    .map((row) =>
      row.mode === "payment"
        ? {
            ...row,
            amount:
              row.amount -
              (advanceShares.get(groupKey(row.month, row.categoryId, row.genreId)) ?? 0),
          }
        : row,
    )
    .filter((row) => row.amount !== 0);
};

/**
 * 月の支出と収入を、カテゴリと内訳ごとに合計する。
 *
 * 集計の設定が「常に集計に含める」の取引だけを入れる。「年の集計にのみ含める」は月の集計には入れない。
 */
export const summarizeMonth = async (db: LedgerDb, month: string): Promise<MonthlySummary> => {
  const rows = await summarizeByMonth(db, { ...monthRange(month), aggregations: ["always"] });
  return {
    payment: buildModeSummary(rows.filter((row) => row.mode === "payment")),
    income: buildModeSummary(rows.filter((row) => row.mode === "income")),
  };
};

/** 年のカテゴリの合計。monthly は 1 月から 12 月の順の 12 か月分 */
export type YearlyCategoryTotal = CategoryTotal & { monthly: number[] };

export type YearlyModeSummary = { total: number; categories: YearlyCategoryTotal[] };

export type MonthTotal = { month: string; payment: number; income: number };

export type YearlySummary = Record<CategoryMode, YearlyModeSummary> & {
  /** 1 月から 12 月の順の、月ごとの支出と収入の合計 */
  months: MonthTotal[];
};

/**
 * 月ごとの行を年で足し合わせ、カテゴリごとに月ごとの金額を添える。
 */
const buildYearlyModeSummary = (rows: MonthlySummaryRow[], months: string[]): YearlyModeSummary => {
  const byGroup = new Map<string, SummaryRow>();
  for (const row of rows) {
    const key = `${row.categoryId}:${row.genreId}`;
    const current = byGroup.get(key);
    byGroup.set(
      key,
      current === undefined ? row : { ...current, amount: current.amount + row.amount },
    );
  }
  // 月ごとには出ていても、年で足すと打ち消し合って 0 になる組み合わせがあるので、ここでも外す
  const summary = buildModeSummary([...byGroup.values()].filter((row) => row.amount !== 0));
  return {
    total: summary.total,
    categories: summary.categories.map((category) => ({
      ...category,
      monthly: months.map((month) =>
        rows
          .filter((row) => row.month === month && row.categoryId === category.categoryId)
          .reduce((total, row) => total + row.amount, 0),
      ),
    })),
  };
};

/**
 * 年（1 月から 12 月）の支出と収入を、カテゴリと内訳ごと、月ごとに合計する。
 *
 * 集計の設定が「常に集計に含める」と「年の集計にのみ含める」の取引を入れる。
 * 立替の扱いと、値引きの品目の扱いは月の集計と同じ。
 */
export const summarizeYear = async (db: LedgerDb, year: number): Promise<YearlySummary> => {
  const months = monthsOfYear(year);
  const rows = await summarizeByMonth(db, {
    start: `${year}-01-01`,
    end: `${year + 1}-01-01`,
    aggregations: ["always", "yearly_only"],
  });
  const paymentRows = rows.filter((row) => row.mode === "payment");
  const incomeRows = rows.filter((row) => row.mode === "income");
  const totalOf = (modeRows: MonthlySummaryRow[], month: string): number =>
    modeRows.filter((row) => row.month === month).reduce((total, row) => total + row.amount, 0);
  return {
    payment: buildYearlyModeSummary(paymentRows, months),
    income: buildYearlyModeSummary(incomeRows, months),
    months: months.map((month) => ({
      month,
      payment: totalOf(paymentRows, month),
      income: totalOf(incomeRows, month),
    })),
  };
};

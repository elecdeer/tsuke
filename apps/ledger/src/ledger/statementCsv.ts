/**
 * 履歴 CSV から読み取った行の一括登録。
 */
import { eq, sql, type SQL } from "drizzle-orm";
import * as v from "valibot";
import {
  accounts,
  categories,
  genres,
  importBatches,
  places,
  transactionItems,
  transactions,
} from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import { upsertPlaceByName } from "./places.ts";

/** 1 回の登録で受け付ける行数の上限 */
const REGISTER_ROWS_MAX = 500;

const IdSchema = v.pipe(v.number(), v.integer());
const DateSchema = v.pipe(v.string(), v.isoDate());
const TextSchema = v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(200)));
const PositiveAmountSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1));

/** 一括登録の入力 */
export const StatementCsvRegisterSchema = v.object({
  fileName: v.pipe(v.string(), v.maxLength(200)),
  /** CSV の口座。支出の支払元、収入の入金先、振替の片方になる */
  accountId: IdSchema,
  rows: v.pipe(
    v.array(
      v.variant("mode", [
        v.object({
          mode: v.literal("payment"),
          date: DateSchema,
          /** 返金は負の金額にする */
          amount: v.pipe(v.number(), v.safeInteger()),
          placeName: TextSchema,
          name: TextSchema,
          genreId: IdSchema,
        }),
        v.object({
          mode: v.literal("income"),
          date: DateSchema,
          amount: PositiveAmountSchema,
          placeName: TextSchema,
          name: TextSchema,
          categoryId: v.nullable(IdSchema),
        }),
        v.object({
          mode: v.literal("transfer"),
          date: DateSchema,
          amount: PositiveAmountSchema,
          name: TextSchema,
          /** CSV の口座から見たお金の向き */
          direction: v.picklist(["out", "in"]),
          counterAccountId: IdSchema,
        }),
      ]),
    ),
    v.minLength(1),
    v.maxLength(REGISTER_ROWS_MAX),
  ),
});

export type StatementCsvRegisterInput = v.InferOutput<typeof StatementCsvRegisterSchema>;
type RegisterRow = StatementCsvRegisterInput["rows"][number];

/**
 * 前後の空白を取り除いた後の空文字を null にする。
 */
const blankToNull = (value: string | null): string | null => (value === "" ? null : value);

/**
 * 店舗を持てる行の店舗名を返す。
 */
const placeNameOf = (row: RegisterRow): string | null =>
  row.mode === "transfer" ? null : blankToNull(row.placeName);

/**
 * 入力の内訳・カテゴリ・口座が台帳にあるかを確かめ、なければ理由を返す。あれば内訳の親カテゴリを返す。
 *
 * 行ごとの ID を IN で聞くと D1 のバインド数の上限に当たりうるので、マスタを丸ごと読んで照らし合わせる。
 */
const resolveMasters = async (
  db: LedgerDb,
  input: StatementCsvRegisterInput,
): Promise<{ ok: true; categoryIdByGenre: Map<number, number> } | { ok: false; error: string }> => {
  const [genreRows, incomeRows, accountRows] = await Promise.all([
    db
      .select({ id: genres.id, categoryId: genres.categoryId })
      .from(genres)
      .innerJoin(categories, eq(categories.id, genres.categoryId))
      .where(eq(categories.mode, "payment")),
    db.select({ id: categories.id }).from(categories).where(eq(categories.mode, "income")),
    db.select({ id: accounts.id }).from(accounts),
  ]);
  const categoryIdByGenre = new Map(genreRows.map((genre) => [genre.id, genre.categoryId]));
  const incomeIds = new Set(incomeRows.map((category) => category.id));
  const accountIds = new Set(accountRows.map((account) => account.id));

  if (!accountIds.has(input.accountId)) return { ok: false, error: "口座が見つかりません" };
  for (const row of input.rows) {
    if (row.mode === "payment" && !categoryIdByGenre.has(row.genreId)) {
      return { ok: false, error: `支出の内訳が見つかりません: ${row.genreId}` };
    }
    if (row.mode === "income" && row.categoryId !== null && !incomeIds.has(row.categoryId)) {
      return { ok: false, error: `収入のカテゴリが見つかりません: ${row.categoryId}` };
    }
    if (row.mode === "transfer") {
      if (!accountIds.has(row.counterAccountId)) {
        return { ok: false, error: "振替の相手の口座が見つかりません" };
      }
      if (row.counterAccountId === input.accountId) {
        return { ok: false, error: "振替の支払元と入金先は別の口座にしてください" };
      }
    }
  }
  return { ok: true, categoryIdByGenre };
};

/**
 * 行の取引の口座の向きを決める。from は残高が減る口座、to は増える口座。
 */
const accountColumns = (
  row: RegisterRow,
  accountId: number,
): { fromAccountId: number | null; toAccountId: number | null } => {
  if (row.mode === "payment") return { fromAccountId: accountId, toAccountId: null };
  if (row.mode === "income") return { fromAccountId: null, toAccountId: accountId };
  return row.direction === "out"
    ? { fromAccountId: accountId, toAccountId: row.counterAccountId }
    : { fromAccountId: row.counterAccountId, toAccountId: accountId };
};

/**
 * 履歴 CSV の行をまとめて登録する。
 *
 * 全体を 1 回の batch で入れるので、途中で失敗しても一部の行だけが残って、やり直しで二重に登録されることはない。
 * batch の中では作った行の ID を受け渡せないので、createPayment と同じく取引は取り込みの記録を MAX(id) で、
 * 品目は直前に入れた取引を MAX(id) で参照する。
 */
export const registerStatementCsv = async (
  db: LedgerDb,
  input: StatementCsvRegisterInput,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> => {
  const masters = await resolveMasters(db, input);
  if (!masters.ok) return masters;

  const lastTransactionId = sql`(SELECT MAX(${transactions.id}) FROM ${transactions})`;
  const lastBatchId: SQL<number> = sql`(SELECT MAX(${importBatches.id}) FROM ${importBatches})`;

  const placeNames = [...new Set(input.rows.flatMap((row) => placeNameOf(row) ?? []))];
  const rowStatements = input.rows.flatMap((row) => {
    const placeName = placeNameOf(row);
    return [
      db.insert(transactions).values({
        date: row.date,
        mode: row.mode,
        ...accountColumns(row, input.accountId),
        placeId:
          placeName === null
            ? null
            : sql`(SELECT ${places.id} FROM ${places} WHERE ${places.name} = ${placeName})`,
        source: "statement_csv",
        importBatchId: lastBatchId,
      }),
      db.insert(transactionItems).values({
        transactionId: lastTransactionId,
        categoryId:
          row.mode === "payment"
            ? (masters.categoryIdByGenre.get(row.genreId) ?? null)
            : row.mode === "income"
              ? row.categoryId
              : null,
        genreId: row.mode === "payment" ? row.genreId : null,
        name: blankToNull(row.name),
        amount: row.amount,
      }),
    ];
  });

  await db.batch([
    db.insert(importBatches).values({
      source: "statement_csv",
      fileName: input.fileName,
      rowCount: input.rows.length,
    }),
    ...placeNames.map((name) => upsertPlaceByName(db, name, null)),
    ...rowStatements,
  ]);
  return { ok: true, count: input.rows.length };
};

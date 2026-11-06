import { and, asc, between, eq, sql } from "drizzle-orm";
import * as v from "valibot";
import { places, transactionItems, transactions } from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";

/** 1 回の登録済み判定で受け付ける明細行数の上限 */
const STATEMENT_ENTRIES_MAX = 500;

/** 明細の登録済み判定の入力 */
export const StatementMatchInputSchema = v.object({
  entries: v.pipe(
    v.array(
      v.object({
        date: v.pipe(v.string(), v.isoDate()),
        amount: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
      }),
    ),
    v.maxLength(STATEMENT_ENTRIES_MAX),
  ),
});

export type StatementMatchInput = v.InferOutput<typeof StatementMatchInputSchema>;
export type StatementEntry = StatementMatchInput["entries"][number];

/** 明細の行に割り当てた、登録済みの支出 */
export type RegisteredPayment = {
  transactionId: number;
  date: string;
  /** 取引の品目の合計 */
  amount: number;
  placeName: string | null;
};

/** 登録済み判定で同じ利用とみなす日付のずれ（日） */
export const STATEMENT_TOLERANCE_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * YYYY-MM-DD の日付どうしの差を日数で返す。
 */
const diffDays = (a: string, b: string): number =>
  Math.round((Date.parse(a) - Date.parse(b)) / DAY_MS);

/**
 * YYYY-MM-DD の日付を days 日ずらす。
 */
const shiftDate = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * 明細の各行に、登録済みの支出を 1 対 1 で割り当てる。
 *
 * 金額が一致し日付のずれが `toleranceDays` 以内のものを候補とし、ずれの小さい組から順に確定させる。
 * 同じ日に同額の利用が 2 回あって片方しか登録されていない場合に両方を登録済みと誤判定しないよう、
 * 1 件の支出は 1 行にしか割り当てない。カテゴリや口座は手入力時と異なることがあるため判定に使わない。
 *
 * @returns `entries` と同じ順序で、割り当てた支出（なければ null）
 */
export const matchRegisteredPayments = (
  entries: ReadonlyArray<StatementEntry>,
  payments: ReadonlyArray<RegisteredPayment>,
  toleranceDays: number = STATEMENT_TOLERANCE_DAYS,
): Array<RegisteredPayment | null> => {
  const candidates: Array<{ entryIndex: number; paymentIndex: number; distance: number }> = [];
  entries.forEach((entry, entryIndex) => {
    payments.forEach((payment, paymentIndex) => {
      if (payment.amount !== entry.amount) return;
      const distance = Math.abs(diffDays(payment.date, entry.date));
      if (distance <= toleranceDays) candidates.push({ entryIndex, paymentIndex, distance });
    });
  });
  // Array.prototype.sort は安定ソートなので、同じずれなら明細の並び順・支出の並び順を保つ
  candidates.sort((a, b) => a.distance - b.distance);

  const matches: Array<RegisteredPayment | null> = entries.map(() => null);
  const usedPayments = new Set<number>();
  for (const { entryIndex, paymentIndex } of candidates) {
    if (matches[entryIndex] !== null || usedPayments.has(paymentIndex)) continue;
    matches[entryIndex] = payments[paymentIndex] ?? null;
    usedPayments.add(paymentIndex);
  }
  return matches;
};

/** 登録済みかを確かめる明細の行。支出の返金は金額が負になる */
export type StatementModeEntry = StatementEntry & {
  mode: "payment" | "income" | "transfer";
};

/**
 * 1 つの種類の取引について、明細の行に登録済みの取引を割り当てる。
 *
 * 明細の 1 行は 1 回の利用なので、1 件の取引の品目の合計と比べる
 * （レシートを品目ごとに登録した取引でも、合計が明細の金額と一致する）。
 * CSV から取り込んだ取引も対象にする。
 */
const findRegisteredByMode = async (
  db: LedgerDb,
  mode: StatementModeEntry["mode"],
  entries: ReadonlyArray<StatementEntry>,
): Promise<Array<RegisteredPayment | null>> => {
  if (entries.length === 0) return [];
  const dates = entries.map((entry) => entry.date).sort();
  const from = shiftDate(dates[0] ?? "", -STATEMENT_TOLERANCE_DAYS);
  const to = shiftDate(dates.at(-1) ?? "", STATEMENT_TOLERANCE_DAYS);

  const registered = await db
    .select({
      transactionId: transactions.id,
      date: transactions.date,
      amount: sql<number>`sum(${transactionItems.amount})`,
      placeName: places.name,
    })
    .from(transactions)
    .innerJoin(transactionItems, eq(transactionItems.transactionId, transactions.id))
    .leftJoin(places, eq(places.id, transactions.placeId))
    .where(and(eq(transactions.mode, mode), between(transactions.date, from, to)))
    .groupBy(transactions.id)
    .orderBy(asc(transactions.date), asc(transactions.id));

  return matchRegisteredPayments(entries, registered);
};

/**
 * 明細の各行について、登録済みの支出を探す。
 */
export const findRegisteredPayments = (
  db: LedgerDb,
  entries: ReadonlyArray<StatementEntry>,
): Promise<Array<RegisteredPayment | null>> => findRegisteredByMode(db, "payment", entries);

/**
 * 明細の各行について、同じ種類の登録済みの取引を探す。
 *
 * @returns `entries` と同じ順序で、割り当てた取引（なければ null）
 */
export const findRegisteredTransactions = async (
  db: LedgerDb,
  entries: ReadonlyArray<StatementModeEntry>,
): Promise<Array<RegisteredPayment | null>> => {
  const matches: Array<RegisteredPayment | null> = entries.map(() => null);
  const modes = ["payment", "income", "transfer"] as const;
  await Promise.all(
    modes.map(async (mode) => {
      const indexes = entries.flatMap((entry, index) => (entry.mode === mode ? [index] : []));
      const found = await findRegisteredByMode(
        db,
        mode,
        indexes.flatMap((index) => entries[index] ?? []),
      );
      found.forEach((match, position) => {
        const index = indexes[position];
        if (index !== undefined) matches[index] = match;
      });
    }),
  );
  return matches;
};

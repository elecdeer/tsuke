import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import {
  accounts,
  advanceReimbursements,
  places,
  transactionItems,
  transactions,
} from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import { advanceAmountAfterLink, advanceLimitOf } from "./advance.ts";

/** 紐付けの候補に出す支出 */
export type ReimbursablePayment = {
  paymentId: number;
  date: string;
  /** 店舗か最初の品目の名前。どちらもなければ null */
  title: string | null;
  total: number;
  advanceAmount: number;
  /** 対象の品目の合計 */
  advanceLimit: number;
  /** この収入以外から紐付けた額の合計 */
  otherLinked: number;
};

/** 紐付けの候補。searchText は画面で探すときに見る店舗と品目の名前 */
export type ReimbursementCandidate = ReimbursablePayment & { searchText: string };

/** 収入に紐付いた支出 */
export type LinkedPayment = ReimbursablePayment & { amount: number };

/** 支出に紐付いた収入 */
export type LinkedIncome = {
  incomeId: number;
  date: string;
  placeName: string | null;
  accountName: string | null;
  /** この支出へ充てた額 */
  amount: number;
};

/** 収入の編集で送る紐付け */
export type ReimbursementInput = {
  paymentId: number;
  amount: number;
  /** まだ別の入金があるので、立替額を紐付けた額で上書きしない */
  expectMore: boolean;
};

/** 候補を一度に返す数 */
const CANDIDATE_LIMIT = 200;

/** その支出に紐付けた額の合計を出す SQL */
export const linkedAmountSql = sql<number>`coalesce((
  SELECT sum(${advanceReimbursements.amount}) FROM ${advanceReimbursements}
  WHERE ${advanceReimbursements.paymentTransactionId} = ${transactions.id}
), 0)`;

/** 未入金の残りがある支出の条件 */
export const hasUnreceivedAdvance: SQL = sql`${transactions.advanceAmount} > ${linkedAmountSql}`;

/**
 * 支出の金額の情報を読み、指定の並びで返す。otherLinked には incomeId の収入から紐付けた額を入れない。
 */
const loadReimbursablePayments = async (
  db: LedgerDb,
  paymentIds: number[],
  incomeId: number,
): Promise<ReimbursementCandidate[]> => {
  if (paymentIds.length === 0) return [];
  const [payments, items, links] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        advanceAmount: transactions.advanceAmount,
        placeName: places.name,
      })
      .from(transactions)
      .leftJoin(places, eq(places.id, transactions.placeId))
      .where(inArray(transactions.id, paymentIds)),
    db
      .select({
        transactionId: transactionItems.transactionId,
        name: transactionItems.name,
        amount: transactionItems.amount,
        isAdvanceTarget: transactionItems.isAdvanceTarget,
      })
      .from(transactionItems)
      .where(inArray(transactionItems.transactionId, paymentIds))
      .orderBy(asc(transactionItems.sort), asc(transactionItems.id)),
    db
      .select({
        paymentId: advanceReimbursements.paymentTransactionId,
        amount: advanceReimbursements.amount,
      })
      .from(advanceReimbursements)
      .where(
        and(
          inArray(advanceReimbursements.paymentTransactionId, paymentIds),
          ne(advanceReimbursements.incomeTransactionId, incomeId),
        ),
      ),
  ]);
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const itemsById = new Map<number, typeof items>();
  for (const item of items) {
    itemsById.set(item.transactionId, [...(itemsById.get(item.transactionId) ?? []), item]);
  }
  const otherLinked = new Map<number, number>();
  for (const link of links) {
    otherLinked.set(link.paymentId, (otherLinked.get(link.paymentId) ?? 0) + link.amount);
  }

  return paymentIds.flatMap((id) => {
    const payment = paymentById.get(id);
    if (payment === undefined) return [];
    const paymentItems = itemsById.get(id) ?? [];
    return [
      {
        paymentId: id,
        date: payment.date,
        title: payment.placeName ?? paymentItems.find((item) => item.name !== null)?.name ?? null,
        total: paymentItems.reduce((sum, item) => sum + item.amount, 0),
        advanceAmount: payment.advanceAmount,
        advanceLimit: advanceLimitOf(paymentItems),
        otherLinked: otherLinked.get(id) ?? 0,
        searchText: [payment.placeName, ...paymentItems.map((item) => item.name)]
          .filter((name) => name !== null)
          .join(" "),
      },
    ];
  });
};

/**
 * 収入に紐付ける支出の候補を返す。未入金の残りがある支出を新しい順に先に出し、残りの枠で他の支出を新しい順に出す。
 *
 * 検索は画面で行うので、件数の上限まで読む。上限より古い支出でも、立替額を入れれば未入金として候補に出る。
 */
export const listReimbursementCandidates = async (
  db: LedgerDb,
  incomeId: number,
): Promise<ReimbursementCandidate[]> => {
  const select = (condition: SQL) =>
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.mode, "payment"), condition))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(CANDIDATE_LIMIT);
  const [unreceived, others] = await Promise.all([
    select(hasUnreceivedAdvance),
    select(sql`NOT (${hasUnreceivedAdvance})`),
  ]);
  const ids = [...unreceived, ...others].slice(0, CANDIDATE_LIMIT).map((row) => row.id);
  return loadReimbursablePayments(db, ids, incomeId);
};

/**
 * 収入に紐付いた支出を、支出の日付の新しい順に返す。
 */
export const getLinkedPayments = async (
  db: LedgerDb,
  incomeId: number,
): Promise<LinkedPayment[]> => {
  const links = await db
    .select({
      paymentId: advanceReimbursements.paymentTransactionId,
      amount: advanceReimbursements.amount,
    })
    .from(advanceReimbursements)
    .innerJoin(transactions, eq(transactions.id, advanceReimbursements.paymentTransactionId))
    .where(eq(advanceReimbursements.incomeTransactionId, incomeId))
    .orderBy(desc(transactions.date), desc(transactions.id));
  const amountById = new Map(links.map((link) => [link.paymentId, link.amount]));
  const payments = await loadReimbursablePayments(
    db,
    links.map((link) => link.paymentId),
    incomeId,
  );
  return payments.map(({ searchText: _searchText, ...payment }) => ({
    ...payment,
    amount: amountById.get(payment.paymentId) ?? 0,
  }));
};

/**
 * 支出に紐付いた収入を、日付の新しい順に返す。
 */
export const getLinkedIncomes = async (db: LedgerDb, paymentId: number): Promise<LinkedIncome[]> =>
  db
    .select({
      incomeId: advanceReimbursements.incomeTransactionId,
      date: transactions.date,
      placeName: places.name,
      accountName: accounts.name,
      amount: advanceReimbursements.amount,
    })
    .from(advanceReimbursements)
    .innerJoin(transactions, eq(transactions.id, advanceReimbursements.incomeTransactionId))
    .leftJoin(places, eq(places.id, transactions.placeId))
    .leftJoin(accounts, eq(accounts.id, transactions.toAccountId))
    .where(eq(advanceReimbursements.paymentTransactionId, paymentId))
    .orderBy(desc(transactions.date), desc(transactions.id));

/**
 * 支出に紐付けた額の合計を返す。
 */
export const linkedAmountOf = async (db: LedgerDb, paymentId: number): Promise<number> => {
  const rows = await db
    .select({ amount: advanceReimbursements.amount })
    .from(advanceReimbursements)
    .where(eq(advanceReimbursements.paymentTransactionId, paymentId));
  return rows.reduce((sum, row) => sum + row.amount, 0);
};

/** 紐付けの保存で書き換える内容 */
export type ReimbursementPlan = {
  links: { paymentId: number; amount: number }[];
  /** 立替額を書き換える支出 */
  payments: { id: number; advanceAmount: number }[];
};

/**
 * 収入の紐付けの入力を確かめ、書き換える内容を返す。合わなければ理由を返す。
 *
 * 外した支出の立替額は変えないので、外した額がそのまま未入金の残りに戻る。
 */
export const planReimbursements = async (
  db: LedgerDb,
  incomeId: number,
  incomeAmount: number,
  inputs: readonly ReimbursementInput[],
): Promise<{ ok: true; plan: ReimbursementPlan } | { ok: false; error: string }> => {
  if (inputs.length === 0) return { ok: true, plan: { links: [], payments: [] } };

  if (new Set(inputs.map((input) => input.paymentId)).size !== inputs.length) {
    return { ok: false, error: "同じ支出を複数回紐付けることはできません" };
  }
  if (inputs.some((input) => input.amount <= 0)) {
    return { ok: false, error: "支出へ充てる額は 1 円以上にしてください" };
  }
  const allocated = inputs.reduce((sum, input) => sum + input.amount, 0);
  if (allocated !== incomeAmount) {
    return { ok: false, error: "支出へ充てる額の合計を、収入の金額と一致させてください" };
  }

  const paymentIds = inputs.map((input) => input.paymentId);
  const modes = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(inArray(transactions.id, paymentIds), eq(transactions.mode, "payment")));
  if (modes.length !== paymentIds.length) {
    return { ok: false, error: "紐付ける支出が見つかりません" };
  }

  const paymentById = new Map(
    (await loadReimbursablePayments(db, paymentIds, incomeId)).map((payment) => [
      payment.paymentId,
      payment,
    ]),
  );
  const payments: ReimbursementPlan["payments"] = [];
  for (const input of inputs) {
    const payment = paymentById.get(input.paymentId);
    if (payment === undefined) return { ok: false, error: "紐付ける支出が見つかりません" };
    const linked = payment.otherLinked + input.amount;
    const advanceAmount = advanceAmountAfterLink(payment.advanceAmount, linked, input.expectMore);
    if (advanceAmount > payment.advanceLimit) {
      return {
        ok: false,
        error: `${payment.date} の支出の対象の品目の合計を超えています。立替分とそれ以外で収入を 2 件に分けてください`,
      };
    }
    payments.push({ id: input.paymentId, advanceAmount });
  }
  return {
    ok: true,
    plan: {
      links: inputs.map(({ paymentId, amount }) => ({ paymentId, amount })),
      payments,
    },
  };
};

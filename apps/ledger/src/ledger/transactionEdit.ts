import { and, asc, eq, inArray, sql } from "drizzle-orm";
import * as v from "valibot";
import {
  accounts,
  advanceReimbursements,
  categories,
  genres,
  places,
  transactionItems,
  transactions,
} from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import { advanceLimitOf } from "./advance.ts";
import { PlaceDetailSchema, placeDetailColumns } from "./placeDetail.ts";
import { upsertPlaceByName } from "./places.ts";
import {
  getLinkedIncomes,
  getLinkedPayments,
  linkedAmountOf,
  planReimbursements,
  type LinkedIncome,
  type LinkedPayment,
  type ReimbursementInput,
} from "./reimbursements.ts";
import type { Aggregation, TransactionMode } from "./transactions.ts";

export type TransactionDetail = {
  id: number;
  date: string;
  mode: TransactionMode;
  aggregation: Aggregation;
  source: (typeof transactions.$inferSelect)["source"];
  fromAccountId: number | null;
  toAccountId: number | null;
  placeName: string | null;
  /** レシートの写真を保存しているか。キーは画面に要らないので渡さない */
  hasReceiptImage: boolean;
  /** 支出のうち立替の額 */
  advanceAmount: number;
  /** 支出に紐付いた収入 */
  linkedIncomes: LinkedIncome[];
  /** 収入に紐付いた支出 */
  linkedPayments: LinkedPayment[];
  items: {
    categoryId: number | null;
    genreId: number | null;
    name: string | null;
    memo: string | null;
    amount: number;
    isAdvanceTarget: boolean;
  }[];
};

/**
 * 編集する取引を品目付きで返す。なければ undefined を返す。
 */
export const getTransaction = async (
  db: LedgerDb,
  id: number,
): Promise<TransactionDetail | undefined> => {
  const [transaction] = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      mode: transactions.mode,
      aggregation: transactions.aggregation,
      source: transactions.source,
      fromAccountId: transactions.fromAccountId,
      toAccountId: transactions.toAccountId,
      placeName: places.name,
      receiptImageKey: transactions.receiptImageKey,
      advanceAmount: transactions.advanceAmount,
    })
    .from(transactions)
    .leftJoin(places, eq(places.id, transactions.placeId))
    .where(eq(transactions.id, id));
  if (transaction === undefined) return undefined;
  const { receiptImageKey, ...columns } = transaction;

  const [items, linkedIncomes, linkedPayments] = await Promise.all([
    db
      .select({
        categoryId: transactionItems.categoryId,
        genreId: transactionItems.genreId,
        name: transactionItems.name,
        memo: transactionItems.memo,
        amount: transactionItems.amount,
        isAdvanceTarget: transactionItems.isAdvanceTarget,
      })
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, id))
      .orderBy(asc(transactionItems.sort), asc(transactionItems.id)),
    columns.mode === "payment" ? getLinkedIncomes(db, id) : [],
    columns.mode === "income" ? getLinkedPayments(db, id) : [],
  ]);
  return {
    ...columns,
    hasReceiptImage: receiptImageKey !== null,
    linkedIncomes,
    linkedPayments,
    items,
  };
};

const TextSchema = v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(200)));
const IdSchema = v.nullable(v.pipe(v.number(), v.integer()));

/**
 * 取引の編集の入力。種類は変えられないので持たない。
 *
 * advanceAmount と reimbursements は省くと今の値のままにする。
 */
export const TransactionUpdateSchema = v.object({
  date: v.pipe(v.string(), v.isoDate()),
  aggregation: v.picklist(["always", "never", "yearly_only"]),
  fromAccountId: IdSchema,
  toAccountId: IdSchema,
  placeName: TextSchema,
  placeDetail: v.optional(v.nullable(PlaceDetailSchema)),
  items: v.pipe(
    v.array(
      v.object({
        categoryId: IdSchema,
        genreId: IdSchema,
        name: TextSchema,
        memo: TextSchema,
        amount: v.pipe(v.number(), v.safeInteger()),
        isAdvanceTarget: v.optional(v.boolean()),
      }),
    ),
    v.minLength(1),
    v.maxLength(100),
  ),
  /** 支出のうち立替の額 */
  advanceAmount: v.optional(v.pipe(v.number(), v.safeInteger(), v.minValue(0))),
  /** 収入に紐付ける支出 */
  reimbursements: v.optional(
    v.pipe(
      v.array(
        v.object({
          paymentId: v.pipe(v.number(), v.safeInteger()),
          amount: v.pipe(v.number(), v.safeInteger()),
          expectMore: v.boolean(),
        }),
      ),
      v.maxLength(100),
    ),
  ),
});

export type TransactionUpdate = v.InferOutput<typeof TransactionUpdateSchema>;

/**
 * 前後の空白を取り除いた後の空文字を null にする。
 */
const blankToNull = (value: string | null): string | null => (value === "" ? null : value);

/**
 * 種類ごとの口座・店舗・品目の決まりに合っているかを確かめ、合わなければ理由を返す。
 *
 * - 支出：支払元だけ。品目は複数
 * - 収入：入金先だけ。品目は 1 件で内訳を持たない
 * - 振替：支払元と入金先の両方（別の口座）。店舗・カテゴリなし。品目は 1 件で金額は正
 * - 残高調整：支払元か入金先の片方。店舗・カテゴリなし。品目は 1 件で金額は正
 */
export const checkModeRules = (mode: TransactionMode, input: TransactionUpdate): string | null => {
  const { fromAccountId, toAccountId, items } = input;
  const placeName = blankToNull(input.placeName);
  switch (mode) {
    case "payment":
      if (toAccountId !== null) return "支出には入金先を指定できません";
      return null;
    case "income":
      if (fromAccountId !== null) return "収入には支払元を指定できません";
      if (items.length !== 1) return "収入の品目は 1 件にしてください";
      if (items.some((item) => item.genreId !== null)) return "収入には内訳を指定できません";
      return null;
    case "transfer":
      if (fromAccountId === null || toAccountId === null) {
        return "振替には支払元と入金先の両方を指定してください";
      }
      if (fromAccountId === toAccountId) return "振替の支払元と入金先は別の口座にしてください";
      break;
    case "adjustment":
      if ((fromAccountId === null) === (toAccountId === null)) {
        return "残高調整には支払元か入金先のどちらか一方を指定してください";
      }
      break;
  }
  if (placeName !== null) return "振替・残高調整には店舗を指定できません";
  if (items.length !== 1) return "振替・残高調整の品目は 1 件にしてください";
  if (items.some((item) => item.categoryId !== null || item.genreId !== null)) {
    return "振替・残高調整にはカテゴリを指定できません";
  }
  if (items.some((item) => item.amount <= 0)) return "振替・残高調整の金額は正にしてください";
  return null;
};

/**
 * 品目のカテゴリ・内訳を確かめ、内訳から親のカテゴリを決めた品目を返す。合わなければ理由を返す。
 *
 * 内訳があればカテゴリは内訳の親にする（入力のカテゴリは見ない）。内訳がなければ入力のカテゴリをそのまま使う。
 * カテゴリは取引の種類（支出・収入）と同じ種類のものに限る。
 */
const resolveItemCategories = async (
  db: LedgerDb,
  mode: TransactionMode,
  items: TransactionUpdate["items"],
): Promise<{ ok: true; items: TransactionUpdate["items"] } | { ok: false; error: string }> => {
  if (mode !== "payment" && mode !== "income") return { ok: true, items };

  const genreIds = [
    ...new Set(items.flatMap((item) => (item.genreId === null ? [] : [item.genreId]))),
  ];
  const genreRows =
    genreIds.length === 0
      ? []
      : await db
          .select({ id: genres.id, categoryId: genres.categoryId })
          .from(genres)
          .innerJoin(categories, eq(categories.id, genres.categoryId))
          .where(and(inArray(genres.id, genreIds), eq(categories.mode, mode)));
  const categoryIdByGenre = new Map(genreRows.map((genre) => [genre.id, genre.categoryId]));
  const unknownGenres = genreIds.filter((id) => !categoryIdByGenre.has(id));
  if (unknownGenres.length > 0) {
    return { ok: false, error: `内訳が見つかりません: ${unknownGenres.join(", ")}` };
  }

  const resolved = items.map((item) => ({
    ...item,
    categoryId:
      item.genreId === null ? item.categoryId : (categoryIdByGenre.get(item.genreId) ?? null),
  }));

  const categoryIds = [
    ...new Set(
      resolved.flatMap((item) =>
        item.genreId === null && item.categoryId !== null ? [item.categoryId] : [],
      ),
    ),
  ];
  if (categoryIds.length > 0) {
    const categoryRows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(inArray(categories.id, categoryIds), eq(categories.mode, mode)));
    const known = new Set(categoryRows.map((category) => category.id));
    const unknownCategories = categoryIds.filter((id) => !known.has(id));
    if (unknownCategories.length > 0) {
      return { ok: false, error: `カテゴリが見つかりません: ${unknownCategories.join(", ")}` };
    }
  }
  return { ok: true, items: resolved };
};

/**
 * 口座がすべてあるかを確かめる。
 */
const accountsExist = async (db: LedgerDb, ids: (number | null)[]): Promise<boolean> => {
  const wanted = [...new Set(ids.filter((id) => id !== null))];
  if (wanted.length === 0) return true;
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(inArray(accounts.id, wanted));
  return rows.length === wanted.length;
};

/**
 * 種類ごとの立替の決まりと、支出の立替額の範囲を確かめ、合わなければ理由を返す。
 */
const checkAdvanceRules = (
  mode: TransactionMode,
  input: TransactionUpdate,
  advanceAmount: number,
  linkedAmount: number,
): string | null => {
  const items = input.items.map((item) => ({
    amount: item.amount,
    isAdvanceTarget: item.isAdvanceTarget ?? false,
  }));
  if (mode !== "payment") {
    return advanceAmount !== 0 || items.some((item) => item.isAdvanceTarget)
      ? "立替額を指定できるのは支出だけです"
      : null;
  }
  if (input.reimbursements !== undefined && input.reimbursements.length > 0) {
    return "紐付けは収入の画面から作ってください";
  }
  if (advanceAmount < linkedAmount) return "立替額は紐付けた額の合計以上にしてください";
  if (advanceAmount > 0 && advanceAmount > advanceLimitOf(items)) {
    return "立替額は対象の品目の合計以下にしてください";
  }
  return null;
};

export type EditResult = { ok: true } | { ok: false; status: 400 | 404; error: string };

/**
 * 取引を書き換える。種類と取り込み元（source）は変えない。
 *
 * 店舗の作成・取引の更新・品目の総入れ替えを 1 回の batch で行うので、途中で失敗しても品目が消えたままにはならない。
 * 品目は差分を取らずに消してから入れ直す。
 */
export const updateTransaction = async (
  db: LedgerDb,
  id: number,
  input: TransactionUpdate,
): Promise<EditResult> => {
  const [current] = await db
    .select({
      mode: transactions.mode,
      placeName: places.name,
      advanceAmount: transactions.advanceAmount,
    })
    .from(transactions)
    .leftJoin(places, eq(places.id, transactions.placeId))
    .where(eq(transactions.id, id));
  if (current === undefined) return { ok: false, status: 404, error: "取引が見つかりません" };

  const ruleError = checkModeRules(current.mode, input);
  if (ruleError !== null) return { ok: false, status: 400, error: ruleError };
  if (!(await accountsExist(db, [input.fromAccountId, input.toAccountId]))) {
    return { ok: false, status: 400, error: "口座が見つかりません" };
  }
  const resolved = await resolveItemCategories(db, current.mode, input.items);
  if (!resolved.ok) return { ok: false, status: 400, error: resolved.error };

  const advanceAmount = input.advanceAmount ?? current.advanceAmount;
  const linkedAmount = current.mode === "payment" ? await linkedAmountOf(db, id) : 0;
  const advanceError = checkAdvanceRules(current.mode, input, advanceAmount, linkedAmount);
  if (advanceError !== null) return { ok: false, status: 400, error: advanceError };

  // 省いたときも今の紐付けのまま確かめる。収入の金額だけが変わって、和が合わなくなるのを防ぐため
  const reimbursements: readonly ReimbursementInput[] =
    current.mode !== "income"
      ? []
      : (input.reimbursements ??
        (await getLinkedPayments(db, id)).map((payment) => ({
          paymentId: payment.paymentId,
          amount: payment.amount,
          expectMore: payment.otherLinked + payment.amount < payment.advanceAmount,
        })));
  const planned = await planReimbursements(
    db,
    id,
    input.items.reduce((sum, item) => sum + item.amount, 0),
    reimbursements,
  );
  if (!planned.ok) return { ok: false, status: 400, error: planned.error };
  const { plan } = planned;

  const placeName = blankToNull(input.placeName);
  const updateTransactionRow = db
    .update(transactions)
    .set({
      date: input.date,
      // 紐付いた収入は立替の入金なので、収入の集計に数えて二重に計上しないようにする
      aggregation: plan.links.length > 0 ? "never" : input.aggregation,
      advanceAmount,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      placeId:
        placeName === null
          ? null
          : sql`(SELECT ${places.id} FROM ${places} WHERE ${places.name} = ${placeName})`,
    })
    .where(eq(transactions.id, id));
  const deleteItems = db.delete(transactionItems).where(eq(transactionItems.transactionId, id));
  const insertItems = db.insert(transactionItems).values(
    resolved.items.map((item, index) => ({
      transactionId: id,
      categoryId: item.categoryId,
      genreId: item.genreId,
      name: blankToNull(item.name),
      memo: blankToNull(item.memo),
      amount: item.amount,
      isAdvanceTarget: item.isAdvanceTarget ?? false,
      sort: index,
    })),
  );
  const reimbursementWrites =
    current.mode === "income"
      ? [
          db.delete(advanceReimbursements).where(eq(advanceReimbursements.incomeTransactionId, id)),
          ...plan.links.map((link) =>
            db.insert(advanceReimbursements).values({
              paymentTransactionId: link.paymentId,
              incomeTransactionId: id,
              amount: link.amount,
            }),
          ),
          ...plan.payments.map((payment) =>
            db
              .update(transactions)
              .set({ advanceAmount: payment.advanceAmount })
              .where(eq(transactions.id, payment.id)),
          ),
        ]
      : [];

  // 店舗を変えていないときは作らない。過去の取引を直しただけでアーカイブ済みの店舗が元に戻らないようにするため
  if (placeName === null || placeName === current.placeName) {
    await db.batch([updateTransactionRow, deleteItems, insertItems, ...reimbursementWrites]);
  } else {
    await db.batch([
      upsertPlaceByName(db, placeName, input.placeDetail),
      updateTransactionRow,
      deleteItems,
      insertItems,
      ...reimbursementWrites,
    ]);
  }
  return { ok: true };
};

/**
 * 取引を消す。品目と収入の紐付けは外部キーの on delete cascade で消える。
 *
 * 紐付いた支出は消さない。消すと収入の金額と充てた額の和が合わなくなるため。
 * 収入を消しても支出の立替額は変えないので、消えた額がそのまま未入金の残りに戻る。
 *
 * レシートの写真は DB の外にあるので、消す相手のキーを返す。呼び出し側で `removeReceiptImage` に渡す。
 */
export const deleteTransaction = async (
  db: LedgerDb,
  id: number,
): Promise<
  { ok: true; receiptImageKey: string | null } | { ok: false; status: 400 | 404; error: string }
> => {
  if ((await linkedAmountOf(db, id)) > 0) {
    return {
      ok: false,
      status: 400,
      error: "収入が紐付いている支出は削除できません。先に収入の画面で紐付けを外してください",
    };
  }
  const [deleted] = await db
    .delete(transactions)
    .where(eq(transactions.id, id))
    .returning({ receiptImageKey: transactions.receiptImageKey });
  return deleted === undefined
    ? { ok: false, status: 404, error: "取引が見つかりません" }
    : { ok: true, receiptImageKey: deleted.receiptImageKey };
};

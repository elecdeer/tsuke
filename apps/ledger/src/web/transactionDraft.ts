import { suggestAllocation } from "../ledger/advance.ts";
import type { PlaceDetail } from "../ledger/placeDetail.ts";
import type { ReimbursablePayment } from "../ledger/reimbursements.ts";
import type { TransactionDetail, TransactionUpdate } from "../ledger/transactionEdit.ts";
import type { TransactionTemplate } from "../ledger/transactionTemplates.ts";
import type { TransactionMode } from "../ledger/transactions.ts";
import { categoryLabels, categoryValueOf, parseCategoryValue } from "./categoryValue.ts";

/**
 * 編集画面の入力中の値。入力欄に合わせてすべて文字列で持つ。
 *
 * - 口座は口座の ID、なければ空文字
 * - 品目の `category` は、カテゴリだけなら `c:カテゴリID`、内訳なら `g:カテゴリID:内訳ID`、なければ空文字
 * - `placeDetail` は、このフォームで新しい店舗を入れたときだけ持つ（文字列にはしない）
 * - `advanceAmount` と `reimbursements` は取引の編集だけで持つ。登録のフォームには立替の入力がない
 */
export type TransactionDraft = {
  date: string;
  aggregation: TransactionUpdate["aggregation"];
  fromAccountId: string;
  toAccountId: string;
  placeName: string;
  placeDetail: PlaceDetail | null;
  items: ItemDraft[];
  /** 支出のうち立替の額。空なら 0 */
  advanceAmount?: string;
  /** 収入に紐付ける支出 */
  reimbursements?: ReimbursementDraft[];
};

export type ReimbursementDraft = {
  payment: ReimbursablePayment;
  amount: string;
  expectMore: boolean;
};

export type ItemDraft = {
  /** React の key。品目を並べ替えても入力欄が入れ替わらないようにする */
  key: number;
  category: string;
  name: string;
  memo: string;
  amount: string;
  /** 立替の対象の印 */
  isAdvanceTarget?: boolean;
};

/**
 * 空の品目を作る。
 */
export const emptyItem = (key: number): ItemDraft => ({
  key,
  category: "",
  name: "",
  memo: "",
  amount: "",
});

/**
 * 改行を空白に置き換えて 1 行にする。品目名・メモは 1 行の値なので、貼り付けた改行も残さない。
 */
export const toSingleLine = (value: string): string => value.replace(/[\r\n]+/g, " ");

/**
 * 品目の金額の合計を返す。入力の途中で数字になっていない金額は 0 として足す。
 */
export const itemsTotal = (items: ItemDraft[]): number =>
  items.reduce((sum, item) => sum + (Number(item.amount.replaceAll(",", "")) || 0), 0);

/**
 * 保存されている取引から、入力中の値を作る。
 */
export const draftFromTransaction = (transaction: TransactionDetail): TransactionDraft => ({
  date: transaction.date,
  aggregation: transaction.aggregation,
  fromAccountId: transaction.fromAccountId === null ? "" : String(transaction.fromAccountId),
  toAccountId: transaction.toAccountId === null ? "" : String(transaction.toAccountId),
  placeName: transaction.placeName ?? "",
  placeDetail: null,
  items: transaction.items.map((item, index) => ({
    key: index,
    category: categoryValueOf(item.categoryId, item.genreId),
    name: item.name ?? "",
    memo: item.memo ?? "",
    amount: String(item.amount),
    isAdvanceTarget: item.isAdvanceTarget,
  })),
  advanceAmount: transaction.advanceAmount === 0 ? "" : String(transaction.advanceAmount),
  reimbursements: transaction.linkedPayments.map(({ amount, ...payment }) => ({
    payment,
    amount: String(amount),
    // 未入金の残りがある支出は、保存し直しても立替額を上書きしないようにする
    expectMore: payment.otherLinked + amount < payment.advanceAmount,
  })),
});

/**
 * よく使う取引から、手入力の登録の値を作る。日付は今日にする。
 *
 * 立替と紐付けはその取引だけの事情なので写さない。アーカイブした口座・カテゴリ・店舗は今の選択肢にないので、空にする
 * （店舗の名前をそのまま送ると、アーカイブした店舗が元に戻ってしまう）。
 */
export const draftFromTemplate = (
  template: TransactionTemplate,
  context: {
    today: string;
    accounts: readonly { id: number }[];
    categories: {
      payment: Parameters<typeof categoryLabels>[0];
      income: Parameters<typeof categoryLabels>[0];
    };
    placeNames: readonly string[];
  },
): TransactionDraft => {
  const accountValue = (id: number | null): string =>
    context.accounts.some((account) => account.id === id) ? String(id) : "";
  const knownCategories = categoryLabels(
    template.mode === "payment"
      ? context.categories.payment
      : template.mode === "income"
        ? context.categories.income
        : [],
  );
  const placeName = template.placeName ?? "";
  return {
    date: context.today,
    aggregation: template.aggregation,
    fromAccountId: accountValue(template.fromAccountId),
    toAccountId: accountValue(template.toAccountId),
    placeName: context.placeNames.includes(placeName) ? placeName : "",
    placeDetail: null,
    items:
      template.items.length === 0
        ? [emptyItem(0)]
        : template.items.map((item, index) => {
            const category = categoryValueOf(item.categoryId, item.genreId);
            return {
              key: index,
              category: category in knownCategories ? category : "",
              name: item.name ?? "",
              memo: item.memo ?? "",
              amount: String(item.amount),
            };
          }),
  };
};

/**
 * 入力の途中で取引の種類を変えたときの値を返す。その種類で持てない値は残さない。
 *
 * - カテゴリは種類ごとに別のものなので消す
 * - 支出のほかは品目が 1 件なので、先頭の品目だけを残す
 * - 残高調整は口座を片方だけ持つので、両方あれば入金先を残す
 * - 店舗は支出と収入だけが持つ
 */
export const draftForMode = (draft: TransactionDraft, mode: TransactionMode): TransactionDraft => {
  const items = mode === "payment" ? draft.items : draft.items.slice(0, 1);
  const hasPlace = mode === "payment" || mode === "income";
  return {
    ...draft,
    fromAccountId:
      mode === "income" || (mode === "adjustment" && draft.toAccountId !== "")
        ? ""
        : draft.fromAccountId,
    toAccountId: mode === "payment" ? "" : draft.toAccountId,
    placeName: hasPlace ? draft.placeName : "",
    placeDetail: hasPlace ? draft.placeDetail : null,
    items: items.map((item) => ({ ...item, category: "" })),
  };
};

/**
 * 入力中の値が元の値から変わったかを返す。どちらも同じ関数で作るので、項目の並びは揃っている。
 */
export const isDraftEdited = (draft: TransactionDraft, original: TransactionDraft): boolean =>
  JSON.stringify(draft) !== JSON.stringify(original);

const AMOUNT_PATTERN = /^-?\d+$/;
const POSITIVE_AMOUNT_PATTERN = /^\d+$/;

/**
 * 金額の入力を数値にする。3 桁区切りのカンマと前後の空白を取り除き、整数でなければ NaN を返す。
 */
const parseAmount = (text: string, pattern: RegExp): number => {
  const cleaned = text.replaceAll(",", "").trim();
  return pattern.test(cleaned) ? Number(cleaned) : Number.NaN;
};

/**
 * 金額の入力を、画面の合計に使う数値にする。入力途中の整数でない金額は 0 と数える。
 */
export const draftAmountOf = (text: string): number => parseAmount(text, AMOUNT_PATTERN) || 0;

/**
 * 品目の金額の和を返す。
 */
export const itemsTotalOf = (items: readonly ItemDraft[]): number =>
  items.reduce((sum, item) => sum + draftAmountOf(item.amount), 0);

/**
 * 立替の入力に値があるか。立替額か、紐付けた支出があれば true を返す。
 *
 * 編集画面で立替の入力欄を最初から開いておくかを決めるのに使う。
 */
export const hasAdvanceInput = (
  draft: Pick<TransactionDraft, "advanceAmount" | "reimbursements">,
): boolean => (draft.advanceAmount ?? "").trim() !== "" || (draft.reimbursements ?? []).length > 0;

/**
 * 品目の立替の対象の印を変え、対象の品目の合計を立替額に入れる。印がなくなったら立替額を空にする。
 */
export const toggleAdvanceTarget = (
  items: readonly ItemDraft[],
  key: number,
  checked: boolean,
): { items: ItemDraft[]; advanceAmount: string } => {
  const next = items.map((item) =>
    item.key === key ? { ...item, isAdvanceTarget: checked } : item,
  );
  const targets = next.filter((item) => item.isAdvanceTarget);
  return { items: next, advanceAmount: targets.length === 0 ? "" : String(itemsTotalOf(targets)) };
};

/**
 * 収入の金額を支出へ配分した候補で、充てる額を入れ直す。
 */
export const allocateReimbursements = (
  reimbursements: readonly ReimbursementDraft[],
  incomeAmount: number,
): ReimbursementDraft[] => {
  const amounts = suggestAllocation(
    incomeAmount,
    reimbursements.map((reimbursement) => reimbursement.payment),
  );
  return reimbursements.map((reimbursement, index) => ({
    ...reimbursement,
    amount: String(amounts[index] ?? 0),
  }));
};

/**
 * 入力中の値を保存の入力にする。金額が整数でない品目があれば理由を返す。
 *
 * 金額の 3 桁区切りのカンマと前後の空白は取り除く。立替の入力を持たないフォームでは、立替の項目を入れない。
 */
export const updateFromDraft = (
  draft: TransactionDraft,
): { ok: true; input: TransactionUpdate } | { ok: false; error: string } => {
  const items: TransactionUpdate["items"] = [];
  for (const [index, item] of draft.items.entries()) {
    const amount = parseAmount(item.amount, AMOUNT_PATTERN);
    if (Number.isNaN(amount)) {
      return { ok: false, error: `${index + 1} 件目の金額を整数で入れてください` };
    }
    items.push({
      ...parseCategoryValue(item.category),
      name: item.name,
      memo: item.memo,
      amount,
      isAdvanceTarget: item.isAdvanceTarget ?? false,
    });
  }

  const advanceAmount =
    draft.advanceAmount === undefined || draft.advanceAmount.trim() === ""
      ? 0
      : parseAmount(draft.advanceAmount, POSITIVE_AMOUNT_PATTERN);
  if (Number.isNaN(advanceAmount)) {
    return { ok: false, error: "立替額を 0 以上の整数で入れてください" };
  }

  const reimbursements: NonNullable<TransactionUpdate["reimbursements"]> = [];
  for (const reimbursement of draft.reimbursements ?? []) {
    const amount = parseAmount(reimbursement.amount, POSITIVE_AMOUNT_PATTERN);
    if (Number.isNaN(amount)) {
      return { ok: false, error: "支出へ充てる額を整数で入れてください" };
    }
    reimbursements.push({
      paymentId: reimbursement.payment.paymentId,
      amount,
      expectMore: reimbursement.expectMore,
    });
  }

  return {
    ok: true,
    input: {
      date: draft.date,
      aggregation: draft.aggregation,
      fromAccountId: draft.fromAccountId === "" ? null : Number(draft.fromAccountId),
      toAccountId: draft.toAccountId === "" ? null : Number(draft.toAccountId),
      placeName: draft.placeName,
      placeDetail: draft.placeDetail,
      items,
      ...(draft.advanceAmount !== undefined && { advanceAmount }),
      ...(draft.reimbursements !== undefined && { reimbursements }),
    },
  };
};

/**
 * 配列の index の要素を offset だけ動かした配列を返す。範囲の外へは動かさない。
 */
export const moveItem = <T>(items: T[], index: number, offset: number): T[] => {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const moved = [...items];
  const [item] = moved.splice(index, 1);
  if (item === undefined) return items;
  moved.splice(target, 0, item);
  return moved;
};

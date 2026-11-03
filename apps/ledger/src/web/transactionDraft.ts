import type { PlaceDetail } from "../ledger/placeDetail.ts";
import type { TransactionDetail, TransactionUpdate } from "../ledger/transactionEdit.ts";
import { categoryValueOf, parseCategoryValue } from "./categoryValue.ts";

/**
 * 編集画面の入力中の値。入力欄に合わせてすべて文字列で持つ。
 *
 * - 口座は口座の ID、なければ空文字
 * - 品目の `category` は、カテゴリだけなら `c:カテゴリID`、内訳なら `g:カテゴリID:内訳ID`、なければ空文字
 * - `placeDetail` は、このフォームで新しい店舗を入れたときだけ持つ（文字列にはしない）
 */
export type TransactionDraft = {
  date: string;
  aggregation: TransactionUpdate["aggregation"];
  fromAccountId: string;
  toAccountId: string;
  placeName: string;
  placeDetail: PlaceDetail | null;
  items: ItemDraft[];
};

export type ItemDraft = {
  /** React の key。品目を並べ替えても入力欄が入れ替わらないようにする */
  key: number;
  category: string;
  name: string;
  memo: string;
  amount: string;
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
  })),
});

/**
 * 入力中の値が元の値から変わったかを返す。どちらも同じ関数で作るので、項目の並びは揃っている。
 */
export const isDraftEdited = (draft: TransactionDraft, original: TransactionDraft): boolean =>
  JSON.stringify(draft) !== JSON.stringify(original);

const AMOUNT_PATTERN = /^-?\d+$/;

/**
 * 入力中の値を保存の入力にする。金額が整数でない品目があれば理由を返す。
 *
 * 金額の 3 桁区切りのカンマと前後の空白は取り除く。
 */
export const updateFromDraft = (
  draft: TransactionDraft,
): { ok: true; input: TransactionUpdate } | { ok: false; error: string } => {
  const items: TransactionUpdate["items"] = [];
  for (const [index, item] of draft.items.entries()) {
    const amountText = item.amount.replaceAll(",", "").trim();
    if (!AMOUNT_PATTERN.test(amountText)) {
      return { ok: false, error: `${index + 1} 件目の金額を整数で入れてください` };
    }
    items.push({
      ...parseCategoryValue(item.category),
      name: item.name,
      memo: item.memo,
      amount: Number(amountText),
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

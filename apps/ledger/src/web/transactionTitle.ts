import type { TransactionMode } from "../ledger/transactions.ts";
import { MODE_LABELS } from "./labels.ts";

type TitleItem = {
  name: string | null;
  memo: string | null;
  genreName: string | null;
  categoryName: string | null;
};

/**
 * 空文字や空白だけの文字列を null にする。
 *
 * 保存時にも空文字は null にしているが、それ以前に入った行や空白だけの値が残っていても見出しが空にならないよう、表示の側でも弾く。
 */
const textOrNull = (value: string | null): string | null =>
  value === null || value.trim() === "" ? null : value;

/**
 * 品目の中から、最初に値のある項目を探す。
 */
const firstTextOf = <T>(items: T[], pick: (item: T) => string | null): string | null => {
  for (const item of items) {
    const text = textOrNull(pick(item));
    if (text !== null) return text;
  }
  return null;
};

/**
 * 取引の見出し。店舗、品目名、メモ、内訳、カテゴリの順に最初に見つかったもの。どれもなければ種類の名前にする。
 */
export const titleOf = (transaction: {
  mode: TransactionMode;
  placeName: string | null;
  items: TitleItem[];
}): string => {
  const { items } = transaction;
  return (
    textOrNull(transaction.placeName) ??
    firstTextOf(items, (item) => item.name) ??
    firstTextOf(items, (item) => item.memo) ??
    firstTextOf(items, (item) => item.genreName) ??
    firstTextOf(items, (item) => item.categoryName) ??
    MODE_LABELS[transaction.mode]
  );
};

/**
 * 品目の要約。1 件ならその名前、複数なら「最初の品目名 ほか N 件」。
 *
 * 1 件で店舗がないときは見出しが品目名になるので、重ねて出さないよう null にする。
 */
export const itemsSummaryOf = (transaction: {
  placeName: string | null;
  items: Pick<TitleItem, "name" | "memo">[];
}): string | null => {
  const [first, ...rest] = transaction.items;
  if (first === undefined) return null;
  const firstName = textOrNull(first.name) ?? textOrNull(first.memo);
  if (rest.length === 0) return textOrNull(transaction.placeName) === null ? null : firstName;
  return `${firstName ?? "品目"} ほか ${rest.length} 件`;
};

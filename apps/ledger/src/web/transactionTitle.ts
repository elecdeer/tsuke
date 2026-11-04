import type { TransactionMode } from "../ledger/transactions.ts";
import { MODE_LABELS } from "./labels.ts";

/**
 * 取引の見出し。店舗、品目名、メモ、内訳、カテゴリの順に最初に見つかったもの。どれもなければ種類の名前にする。
 */
export const titleOf = (transaction: {
  mode: TransactionMode;
  placeName: string | null;
  items: {
    name: string | null;
    memo: string | null;
    genreName: string | null;
    categoryName: string | null;
  }[];
}): string => {
  const { items } = transaction;
  return (
    transaction.placeName ??
    items.find((item) => item.name !== null)?.name ??
    items.find((item) => item.memo !== null)?.memo ??
    items.find((item) => item.genreName !== null)?.genreName ??
    items.find((item) => item.categoryName !== null)?.categoryName ??
    MODE_LABELS[transaction.mode]
  );
};

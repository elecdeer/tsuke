import type { LedgerOutput } from "ledger/client";

/** 読み取りの結果のうち、支払元の注記に使う項目 */
export type AccountGuess = Pick<
  LedgerOutput<"/api/transactions/extract", "POST">,
  "paymentMethod" | "accountId" | "accountMatch"
>;

/**
 * AI が推測で選んだ口座に添える注記を返す。注記がいらなければ null を返す。
 *
 * 文言は台帳のレシート読み取り（apps/ledger/src/web/accountGuessNote.ts）にそろえる。
 * 拡張機能は台帳から型しか読めないので、関数は共有せずに同じものを持つ。
 * 表記から決めきれた口座や、ユーザーが選び直した口座には出さない。
 */
export const accountGuessNote = (
  guess: AccountGuess,
  selectedAccountId: number | null,
): string | null => {
  if (guess.accountMatch !== "inferred") return null;
  if (guess.accountId === null || guess.accountId !== selectedAccountId) return null;
  return guess.paymentMethod === null
    ? "支払い方法が書かれていないので、口座は推測です"
    : `支払い方法の表記「${guess.paymentMethod}」からの推測です`;
};

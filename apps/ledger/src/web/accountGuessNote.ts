import type { ExtractedPayment } from "../llm/extractPayment.ts";

/**
 * AI が推測で選んだ支払元に添える注記を返す。注記がいらなければ null を返す。
 *
 * 表記から決めきれた支払元や、ユーザーが選び直した支払元には出さない。
 * 選び直した後も出し続けると、ユーザーが確かめた支払元まで疑わしく見えるため。
 */
export const accountGuessNote = (
  extracted: Pick<ExtractedPayment, "paymentMethod" | "accountId" | "accountMatch">,
  selectedAccountId: number | null,
): string | null => {
  if (extracted.accountMatch !== "inferred") return null;
  if (extracted.accountId === null || extracted.accountId !== selectedAccountId) return null;
  return extracted.paymentMethod === null
    ? "支払い方法が書かれていないので、支払元は推測です"
    : `支払い方法の表記「${extracted.paymentMethod}」からの推測です`;
};

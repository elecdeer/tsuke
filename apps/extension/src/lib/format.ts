const yenFormat = new Intl.NumberFormat("ja-JP");

/**
 * 金額を「1,234」の形で書く。円の記号は付けない（単位を小さく添える所や、見出しで金額だと分かる所で使う）。
 * 負の金額は「−1,234」にする。書き方は台帳（apps/ledger/src/web/format.ts）にそろえる。
 */
export const formatAmount = (amount: number): string =>
  `${amount < 0 ? "−" : ""}${yenFormat.format(Math.abs(amount))}`;

/**
 * 金額を「1,234円」の形で書く。文の中など、見出しや列の名前から金額だと分からない所で使う。
 */
export const formatYen = (amount: number): string => `${formatAmount(amount)}円`;

/**
 * YYYY-MM-DD の日付を、明細の表記に近い「5/19」の形で書く。
 */
export const formatShortDate = (date: string): string => {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
};

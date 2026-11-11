const yenFormat = new Intl.NumberFormat("ja-JP");

/**
 * 金額を「1,234」の形で書く。円の記号は付けない（単位を小さく添える所や、見出しや列の名前で金額だと分かる所で使う）。
 * 負の金額は「−1,234」にする。
 */
export const formatAmount = (amount: number): string =>
  `${amount < 0 ? "−" : ""}${yenFormat.format(Math.abs(amount))}`;

/**
 * 金額を「1,234円」の形で書く。文の中など、見出しや列の名前から金額だと分からない所で使う。
 */
export const formatYen = (amount: number): string => `${formatAmount(amount)}円`;

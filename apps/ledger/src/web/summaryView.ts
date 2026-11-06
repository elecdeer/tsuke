/**
 * 集計の画面の、月の表示と年の表示の行き来に使う URL。
 */

/**
 * 月の集計の画面の URL を作る。
 */
export const monthSummaryHref = (month: string): string => `/?month=${month}`;

/**
 * 年の集計の画面の URL を作る。
 */
export const yearSummaryHref = (year: number): string => `/?year=${year}`;

/**
 * 年の表示から月の表示へ移るときの月を返す。今年なら今月、それ以外の年はその年の 12 月にする。
 */
export const monthForYear = (year: number, currentMonth: string): string =>
  currentMonth.startsWith(`${year}-`) ? currentMonth : `${year}-12`;

/**
 * 「1万」「−2.5万」の形で金額を短く書く。グラフの目盛りのように、幅の狭い所で使う。
 */
export const formatCompactAmount = (amount: number): string => {
  if (amount === 0) return "0";
  const sign = amount < 0 ? "−" : "";
  const man = Math.abs(amount) / 10_000;
  return `${sign}${Number(man.toFixed(1))}万`;
};

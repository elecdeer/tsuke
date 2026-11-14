/**
 * 画面で使う日付・月の扱い。日付は YYYY-MM-DD、月は YYYY-MM の文字列で持つ。
 *
 * Workers には Temporal がないので、日本時間の今日は Intl で求める。
 */

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 日本時間の今日の日付を返す。
 */
export const todayInTokyo = (now: Date = new Date()): string =>
  // sv-SE の日付の書式は YYYY-MM-DD になる
  now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

/**
 * 日付が属する月を返す。
 */
export const monthOf = (date: string): string => date.slice(0, 7);

/**
 * 月の文字列が YYYY-MM の形で、実在する月なら true を返す。
 */
export const isMonth = (value: string): boolean => MONTH_PATTERN.test(value);

/**
 * 日付の文字列が YYYY-MM-DD の形で、実在する日なら true を返す。
 */
export const isDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

/**
 * 月を months か月ずらす。
 */
export const shiftMonth = (month: string, months: number): string => {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (monthNumber ?? 1) - 1 + months, 1));
  return shifted.toISOString().slice(0, 7);
};

/**
 * 月の初日と、翌月の初日を返す。期間は start 以上 end 未満で比べる。
 */
export const monthRange = (month: string): { start: string; end: string } => ({
  start: `${month}-01`,
  end: `${shiftMonth(month, 1)}-01`,
});

/**
 * 年の 12 か月（YYYY-MM）を 1 月から順に返す。
 */
export const monthsOfYear = (year: number): string[] =>
  Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);

/**
 * 「2026年10月」の形で月を書く。
 */
export const formatMonth = (month: string): string => {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}年${monthNumber}月`;
};

/**
 * 期間が年（YYYY）なら true を返す。期間は月（YYYY-MM）か年（YYYY）の文字列で持つ。
 */
export const isYearPeriod = (period: string): boolean => period.length === 4;

/**
 * 期間の初日と、次の期間の初日を返す。期間は start 以上 end 未満で比べる。
 */
export const periodRange = (period: string): { start: string; end: string } =>
  isYearPeriod(period)
    ? { start: `${period}-01-01`, end: `${Number(period) + 1}-01-01` }
    : monthRange(period);

/**
 * 期間を count 個ずらす。月なら月を、年なら年をずらす。
 */
export const shiftPeriod = (period: string, count: number): string =>
  isYearPeriod(period) ? String(Number(period) + count) : shiftMonth(period, count);

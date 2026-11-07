const yenFormat = new Intl.NumberFormat("ja-JP");

/**
 * 金額を「1,234」の形で書く。円の記号は付けない（見出しや列の名前で金額だと分かる所で使う）。負の金額は「−1,234」にする。
 */
export const formatAmount = (amount: number): string =>
  `${amount < 0 ? "−" : ""}${yenFormat.format(Math.abs(amount))}`;

/**
 * 金額を「1,234円」の形で書く。文の中など、見出しや列の名前から金額だと分からない所で使う。
 */
export const formatYen = (amount: number): string => `${formatAmount(amount)}円`;

/**
 * 金額を符号付きで書く。正なら「+1,234」、負なら「−1,234」、0 なら「0」にする。収支のようにお金の向きを示す所で使う。
 */
export const formatSignedAmount = (amount: number): string =>
  amount > 0 ? `+${formatAmount(amount)}` : formatAmount(amount);

/**
 * 全体に対する割合を「12.3%」の形で書く。全体が 0 以下なら空にする。
 */
export const formatPercent = (part: number, whole: number): string =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "";

/**
 * YYYY-MM-DD の日付を「10/28（火）」の形で書く。
 */
export const formatDay = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  const weekday = "日月火水木金土"[parsed.getUTCDay()];
  return `${parsed.getUTCMonth() + 1}/${parsed.getUTCDate()}（${weekday}）`;
};

/**
 * YYYY-MM-DD の日付を「2026/10/28」の形で書く。月をまたぐ一覧の、日付の列で使う。
 */
export const formatFullDay = (date: string): string => date.replaceAll("-", "/");

/**
 * YYYY-MM-DD の日付を「28 水」の形で書く。月がほかの所で分かる一覧の、日付の列で使う。
 */
export const formatDayOfMonth = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  return `${parsed.getUTCDate()} ${"日月火水木金土"[parsed.getUTCDay()]}`;
};

const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * ISO 8601 の日時を、日本時間の「2026/10/28 09:05」の形で書く。
 *
 * サーバーと端末で同じ文字列になるよう、端末のタイムゾーンではなく日本時間に決めて書く。
 */
export const formatDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));

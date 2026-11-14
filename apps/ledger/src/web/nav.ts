import type { NavigationState } from "void/pages-client";
import { monthSummaryHref, yearSummaryHref } from "./summaryView.ts";
import { transactionsHref } from "./transactionsHref.ts";

/** クエリの月の形（2026-10） */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
/** クエリの年の形（2026） */
const YEAR_PATTERN = /^\d{4}$/;

/**
 * パスがナビゲーションの項目の下にあれば true を返す。
 */
export const isActive = (path: string, href: string): boolean =>
  href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

/**
 * ナビゲーションで今いる画面として示すパスを返す。
 *
 * 画面の移動中は、移動先のデータが届くまで前の画面が残る。押したタブにすぐ下線を移して反応を返すため、
 * GET で読み込み中なら移動先のパスを返す。フォームの送信（submitting）は画面を移るとは限らないので、今のパスのままにする。
 */
export const navPath = (path: string, navigation: NavigationState): string =>
  navigation.state === "loading" && navigation.location !== null
    ? navigation.location.pathname
    : path;

/**
 * 画面の移動かフォームの送信の途中なら true を返す。
 */
export const isNavigating = (navigation: NavigationState): boolean => navigation.state !== "idle";

/**
 * クエリの期間を返す。年の指定を月より先に見る。どちらもないか形が正しくなければ null を返す。
 */
const periodOf = (query: URLSearchParams): string | null => {
  const year = query.get("year");
  if (year !== null) return YEAR_PATTERN.test(year) ? year : null;
  const month = query.get("month");
  return month !== null && MONTH_PATTERN.test(month) ? month : null;
};

/**
 * ナビゲーションの項目のリンク先を返す。集計と取引の一覧の間では、今見ている期間（月か年）を引き継ぐ。
 *
 * 期間を指定していない画面（今月）からは、これまでどおり項目の URL のまま移る。
 * 取引の一覧の絞り込みは集計にない条件なので、期間のほかは引き継がない。
 */
export const navHref = (href: string, path: string, query: URLSearchParams): string => {
  const period = periodOf(query);
  if (period === null) return href;
  if (href === "/transactions" && path === "/") return transactionsHref({ period });
  if (href === "/" && path === "/transactions") {
    return period.length === 4 ? yearSummaryHref(Number(period)) : monthSummaryHref(period);
  }
  return href;
};

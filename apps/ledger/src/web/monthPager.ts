/**
 * 月を並べたページのどれか。前の月・今の月・次の月の順に横に並ぶ。
 */
export type MonthPage = "prev" | "current" | "next";

const PAGES: ReadonlyArray<MonthPage> = ["prev", "current", "next"];

/** スナップで止まったとみなす、ページの左端からのずれ（px）。小数のスクロール位置の誤差を許す */
const SNAP_TOLERANCE = 1;

/**
 * 横のスクロール位置から、ちょうど止まっているページを返す。ページの間で止まっていれば null を返す。
 *
 * pageLefts は前・今・次のページの左端の位置（スクロールの箱の中での offsetLeft）。
 */
export const snappedPage = (
  scrollLeft: number,
  pageLefts: readonly [number, number, number],
): MonthPage | null => {
  const index = pageLefts.findIndex((left) => Math.abs(scrollLeft - left) <= SNAP_TOLERANCE);
  return PAGES[index] ?? null;
};

/**
 * 隣の月のページを縦にずらす量を返す。
 *
 * 縦にスクロールして並びの上端がヘッダーの下に隠れていても、隣の月はその先頭がヘッダーのすぐ下に来るよう見せる。
 * 上端が見えていればずらさない。
 */
export const neighborOffset = (scrollerTop: number, viewportTop: number): number =>
  Math.max(0, viewportTop - scrollerTop);

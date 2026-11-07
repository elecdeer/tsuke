/**
 * 月を移る向き。次の月へ進むなら next、前の月へ戻るなら prev。
 */
export type MonthSlideDirection = "next" | "prev";

/**
 * 月を移るときの横にずらすアニメーションの向きを、ルート要素の data-month-slide に書く。
 *
 * Void の Link は document.startViewTransition にコールバックだけを渡し、遷移の型（types）を付けられない。
 * そのため向きはルート要素の属性で CSS（src/styles.css）に伝える。
 * 属性は移動のあとも残るが、CSS は月の移動のビュー遷移の間だけ読むので消さない。
 */
export const setMonthSlide = (
  root: { dataset: Record<string, string | undefined> },
  direction: MonthSlideDirection,
): void => {
  root.dataset.monthSlide = direction;
};

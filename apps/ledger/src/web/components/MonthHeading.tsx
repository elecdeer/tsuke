import { Link } from "@void/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type Ref, useEffect, useRef, useState } from "react";
import { formatMonth, shiftMonth } from "@/ledger/dates";
import { visuallyHiddenClassName } from "@tsuke/ui/lib/a11y";
import { navigatePeriod } from "@/web/components/PeriodPager";
import styles from "./PeriodHeading.module.css";

/**
 * 「10月」の形で月だけを書く。前後の月へのリンクは年をまたいでも月だけで足りる。
 */
const monthLabel = (month: string): string => `${Number(month.slice(5))}月`;

/**
 * 年の下に月を大きく出す見出し。
 */
const MonthTitle = ({ month }: { month: string }) => (
  <h1 aria-label={formatMonth(month)} className={styles.title}>
    <span className={styles.caption}>{month.slice(0, 4)}</span>
    <span className={styles.number}>{Number(month.slice(5))}</span>
  </h1>
);

/**
 * 画面が扱う月。年の下に月を大きく出し、前後の月へのリンクを添える。移り先の URL は hrefOf で月から作る。
 *
 * 前後の月へのリンクを押すと、払ったときと同じく期間の並び（PeriodPager）を横に送って移る。
 */
export const MonthHeading = ({
  month,
  hrefOf,
  headingRef,
}: {
  month: string;
  hrefOf: (month: string) => string;
  /** 見出しが画面の上に出ているかを見るための参照（useMonthHeadingHidden） */
  headingRef?: Ref<HTMLDivElement>;
}) => {
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  return (
    <div ref={headingRef} className={styles.PeriodHeading}>
      <div className={styles.links}>
        <Link
          href={hrefOf(previous)}
          viewTransition
          onNavigate={navigatePeriod("prev")}
          className={styles.link}
        >
          ← {monthLabel(previous)}
        </Link>
        <Link
          href={hrefOf(next)}
          viewTransition
          onNavigate={navigatePeriod("next")}
          className={styles.link}
        >
          {monthLabel(next)} →
        </Link>
      </div>
      <MonthTitle month={month} />
    </div>
  );
};

/**
 * 月の見出しがスクロールで固定ヘッダーの裏に隠れたかどうか。隠れたら StickyMonthBar を出す。
 *
 * 見出しそのものを sticky にして縮めると、縮むたびに下の並びが動いてしまう。
 * そのため見出しは動かさず、隠れたときだけ別のバーを重ねる。
 * enabled が false の間（月ではない見出しを出しているとき）は見ない。
 */
export const useMonthHeadingHidden = (
  enabled: boolean,
): { headingRef: Ref<HTMLDivElement>; hidden: boolean } => {
  const headingRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const heading = headingRef.current;
    if (!enabled || heading === null) {
      setHidden(false);
      return;
    }
    // rootMargin には calc() も rem も書けないので、固定ヘッダーの実際の高さを測って使う
    const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry === undefined) return;
        setHidden(!entry.isIntersecting && entry.boundingClientRect.top < headerHeight);
      },
      { rootMargin: `-${headerHeight}px 0px 0px 0px` },
    );
    observer.observe(heading);
    return () => observer.disconnect();
  }, [enabled]);
  return { headingRef, hidden };
};

/**
 * スクロールして月の見出しが隠れたあと、ヘッダーの下に貼り付くコンパクトな月のバー。
 *
 * 高さ 0 の sticky な箱に絶対配置で載せるので、出し入れしても下の並びは動かない。
 * 画面全体の高さを持つ親の最初の子に置く（親の中でしか貼り付かない）。
 * 隠れている間は inert にして、フォーカスも読み上げも受けないようにする。
 */
export const StickyMonthBar = ({
  month,
  hrefOf,
  shown,
}: {
  month: string;
  hrefOf: (month: string) => string;
  shown: boolean;
}) => {
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  return (
    <div className={styles.StickyMonthBar} inert={!shown}>
      <div className={styles.bar} data-hidden={shown ? undefined : ""}>
        {/* 大きい見出しをそのまま縮めた形にし、同じ月だと見てわかるようにする */}
        <p className={styles.month}>
          {/* 「11 2026」の並びでは読み上げで意味が通らないので、読み上げには年月を渡す */}
          <span className={visuallyHiddenClassName}>{formatMonth(month)}</span>
          <span aria-hidden="true" className={styles.number}>
            {Number(month.slice(5))}
          </span>
          <span aria-hidden="true" className={styles.year}>
            {month.slice(0, 4)}
          </span>
        </p>
        {/* 帯を細く保つため、前後の月は文字ではなく矢印だけにする */}
        <div className={styles.arrows}>
          <Link
            href={hrefOf(previous)}
            viewTransition
            onNavigate={navigatePeriod("prev")}
            aria-label={monthLabel(previous)}
            className={styles.arrow}
          >
            <ChevronLeft className={styles.arrowIcon} aria-hidden="true" />
          </Link>
          <Link
            href={hrefOf(next)}
            viewTransition
            onNavigate={navigatePeriod("next")}
            aria-label={monthLabel(next)}
            className={styles.arrow}
          >
            <ChevronRight className={styles.arrowIcon} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
};

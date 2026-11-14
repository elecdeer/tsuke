import { Link } from "@void/react";
import { navigatePeriod } from "@/web/components/PeriodPager";
import { yearSummaryHref } from "@/web/summaryView";
import styles from "./PeriodHeading.module.css";

/**
 * 集計の画面が扱う年。年を大きく出し、前後の年へのリンクを添える。
 *
 * 前後の年へのリンクを押すと、払ったときと同じく年の並び（PeriodPager）を横に送って移る。
 */
export const YearHeading = ({ year }: { year: number }) => (
  <div className={styles.PeriodHeading}>
    <div className={styles.links}>
      <Link
        href={yearSummaryHref(year - 1)}
        viewTransition
        onNavigate={navigatePeriod("prev")}
        className={styles.link}
      >
        ← {year - 1}
      </Link>
      <Link
        href={yearSummaryHref(year + 1)}
        viewTransition
        onNavigate={navigatePeriod("next")}
        className={styles.link}
      >
        {year + 1} →
      </Link>
    </div>
    <h1 aria-label={`${year}年`} className={styles.title}>
      <span className={styles.caption}>年</span>
      <span className={styles.number}>{year}</span>
    </h1>
  </div>
);

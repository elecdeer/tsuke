import { Link } from "@void/react";
import { setMonthSlide } from "@/web/monthSlide";
import { yearSummaryHref } from "@/web/summaryView";

/**
 * 集計の画面が扱う年。年を大きく出し、前後の年へのリンクを添える。
 *
 * 前後の年へ移るときは、月の見出しと同じく本文を横にずらして入れ替える。
 */
export const YearHeading = ({ year }: { year: number }) => (
  <div className="flex flex-col gap-1">
    <div className="flex gap-4 text-xs text-muted-foreground">
      <Link
        href={yearSummaryHref(year - 1)}
        viewTransition
        onNavigate={() => setMonthSlide(document.documentElement, "prev")}
        className="hover:text-foreground"
      >
        ← {year - 1}
      </Link>
      <Link
        href={yearSummaryHref(year + 1)}
        viewTransition
        onNavigate={() => setMonthSlide(document.documentElement, "next")}
        className="hover:text-foreground"
      >
        {year + 1} →
      </Link>
    </div>
    <h1 aria-label={`${year}年`} className="flex flex-col">
      <span className="text-xs text-muted-foreground">年</span>
      <span className="text-6xl leading-none font-semibold tracking-tighter">{year}</span>
    </h1>
  </div>
);

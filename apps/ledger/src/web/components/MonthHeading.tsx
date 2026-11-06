import { Link } from "@void/react";
import { formatMonth, shiftMonth } from "@/ledger/dates";
import { setMonthSlide } from "@/web/monthSlide";

/**
 * 「10月」の形で月だけを書く。前後の月へのリンクは年をまたいでも月だけで足りる。
 */
const monthLabel = (month: string): string => `${Number(month.slice(5))}月`;

/**
 * 年の下に月を大きく出す見出し。前後の月の仮の中身（MonthPager の placeholder）でも使う。
 */
export const MonthTitle = ({ month }: { month: string }) => (
  <h1 aria-label={formatMonth(month)} className="flex flex-col">
    <span className="text-xs text-muted-foreground">{month.slice(0, 4)}</span>
    <span className="text-6xl leading-none font-semibold tracking-tighter">
      {Number(month.slice(5))}
    </span>
  </h1>
);

/**
 * 画面が扱う月。年の下に月を大きく出し、前後の月へのリンクを添える。移り先の URL は hrefOf で月から作る。
 *
 * 前後の月へ移るときは、スマホのアプリの画面送りのように本文を横にずらして入れ替える（src/styles.css）。
 * 画面を横に送って月を移るのは MonthPager が受け持つ。
 */
export const MonthHeading = ({
  month,
  hrefOf,
}: {
  month: string;
  hrefOf: (month: string) => string;
}) => {
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <Link
          href={hrefOf(previous)}
          viewTransition
          onNavigate={() => setMonthSlide(document.documentElement, "prev")}
          className="hover:text-foreground"
        >
          ← {monthLabel(previous)}
        </Link>
        <Link
          href={hrefOf(next)}
          viewTransition
          onNavigate={() => setMonthSlide(document.documentElement, "next")}
          className="hover:text-foreground"
        >
          {monthLabel(next)} →
        </Link>
      </div>
      <MonthTitle month={month} />
    </div>
  );
};

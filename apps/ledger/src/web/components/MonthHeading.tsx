import { Link } from "@void/react";
import { formatMonth, shiftMonth } from "@/ledger/dates";
import { scrollMonthPager } from "@/web/components/MonthPager";
import { type MonthSlideDirection, setMonthSlide } from "@/web/monthSlide";

/**
 * 「10月」の形で月だけを書く。前後の月へのリンクは年をまたいでも月だけで足りる。
 */
const monthLabel = (month: string): string => `${Number(month.slice(5))}月`;

/**
 * 年の下に月を大きく出す見出し。
 */
const MonthTitle = ({ month }: { month: string }) => (
  <h1 aria-label={formatMonth(month)} className="flex flex-col">
    <span className="text-xs text-muted-foreground">{month.slice(0, 4)}</span>
    <span className="text-6xl leading-none font-semibold tracking-tighter">
      {Number(month.slice(5))}
    </span>
  </h1>
);

/**
 * 前後の月へのリンクを押したとき、月の並び（MonthPager）があれば横に送って移り、リンクでは移らない。
 * 並びがなければ、リンクで移りつつ本文を横にずらすビュー遷移の向きを伝える。
 */
const navigateMonth =
  (direction: MonthSlideDirection) =>
  (event: { preventDefault: () => void }): void => {
    if (scrollMonthPager(direction)) {
      event.preventDefault();
      return;
    }
    setMonthSlide(document.documentElement, direction);
  };

/**
 * 画面が扱う月。年の下に月を大きく出し、前後の月へのリンクを添える。移り先の URL は hrefOf で月から作る。
 *
 * 前後の月へのリンクを押すと、払ったときと同じく月の並び（MonthPager）を横に送って移る。
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
          onNavigate={navigateMonth("prev")}
          className="hover:text-foreground"
        >
          ← {monthLabel(previous)}
        </Link>
        <Link
          href={hrefOf(next)}
          viewTransition
          onNavigate={navigateMonth("next")}
          className="hover:text-foreground"
        >
          {monthLabel(next)} →
        </Link>
      </div>
      <MonthTitle month={month} />
    </div>
  );
};

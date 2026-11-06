import { Link } from "@void/react";
import { useEffect } from "react";
import { ChevronRight } from "lucide-react";
import type { CategoryTotal, ModeSummary } from "@/ledger/summary";
import { cn } from "@/lib/utils";
import { MonthHeading } from "@/web/components/MonthHeading";
import { MonthPager } from "@/web/components/MonthPager";
import { Section } from "@/web/components/Section";
import { Skeleton } from "@/web/components/Skeleton";
import { ROW_COLUMNS, SummaryTotals } from "@/web/components/SummaryTotals";
import { SummaryViewSwitch } from "@/web/components/SummaryViewSwitch";
import { YearHeading } from "@/web/components/YearHeading";
import { YearSummaryBody } from "@/web/components/YearSummary";
import { monthForYear, monthSummaryHref, yearSummaryHref } from "@/web/summaryView";
import { formatAmount, formatPercent } from "@/web/format";
import { createMonthPageCache } from "@/web/monthPageCache";
import { transactionsHref } from "@/web/transactionsHref";
import type { Props } from "./index.server";

type Mode = "payment" | "income";

/**
 * カテゴリ 1 つ分の行。開くと内訳ごとの合計と、そのカテゴリの取引の一覧へのリンクが出る。
 */
const CategoryRow = ({
  category,
  total,
  month,
  mode,
}: {
  category: CategoryTotal;
  total: number;
  month: string;
  mode: Mode;
}) => {
  const ratio = total > 0 ? Math.max(category.amount / total, 0) : 0;
  return (
    <details className="group border-b">
      <summary
        className={cn(
          ROW_COLUMNS,
          "cursor-pointer list-none py-2.5 hover:bg-muted/60 [&::-webkit-details-marker]:hidden",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
          <span className="truncate">{category.name}</span>
        </span>
        <span className="text-right text-xs text-muted-foreground tabular-nums">
          {formatPercent(category.amount, total)}
        </span>
        <span className="text-right tabular-nums">{formatAmount(category.amount)}</span>
        {/* 合計に対する割合。幅だけで比べられるよう、地の線は引かない */}
        <span className="col-span-3 mt-1.5 h-0.5">
          <span className="block h-full bg-foreground" style={{ width: `${ratio * 100}%` }} />
        </span>
      </summary>
      <ul className="pb-2 text-sm">
        {category.genres.map((genre) => {
          const content = (
            <>
              <span className="truncate pl-5">{genre.name}</span>
              <span className="text-right text-xs text-muted-foreground tabular-nums">
                {formatPercent(genre.amount, category.amount)}
              </span>
              <span className="text-right tabular-nums">{formatAmount(genre.amount)}</span>
            </>
          );
          return (
            <li key={genre.genreId ?? "none"}>
              {/* 内訳のない品目は条件で絞り込めないので、一覧へのリンクにしない */}
              {category.categoryId !== null && genre.genreId !== null ? (
                <Link
                  href={transactionsHref({
                    month,
                    mode,
                    categoryId: category.categoryId,
                    genreId: genre.genreId,
                  })}
                  className={cn(ROW_COLUMNS, "py-1.5 hover:bg-muted/60")}
                >
                  {content}
                </Link>
              ) : (
                <div className={cn(ROW_COLUMNS, "py-1.5")}>{content}</div>
              )}
            </li>
          );
        })}
        {category.categoryId !== null && (
          <li>
            <Link
              href={transactionsHref({ month, mode, categoryId: category.categoryId })}
              className="inline-block py-1.5 pl-5 text-xs text-muted-foreground hover:text-foreground"
            >
              {category.name}の取引 →
            </Link>
          </li>
        )}
      </ul>
    </details>
  );
};

/**
 * 支出か収入のカテゴリ別の合計。
 */
const CategoryBreakdown = ({
  summary,
  month,
  mode,
}: {
  summary: ModeSummary;
  month: string;
  mode: Mode;
}) =>
  summary.categories.length === 0 ? (
    <p className="border-t border-foreground py-2.5 text-sm text-muted-foreground">
      この月の記録はありません
    </p>
  ) : (
    <div className="border-t border-foreground">
      {summary.categories.map((category) => (
        <CategoryRow
          key={category.categoryId ?? "none"}
          category={category}
          total={summary.total}
          month={month}
          mode={mode}
        />
      ))}
    </div>
  );

type MonthProps = Extract<Props, { view: "month" }>;
type YearProps = Extract<Props, { view: "year" }>;

/**
 * 月の集計の見出し。月・年の切り替えと、前後の月へのリンクの付いた月。
 */
const MonthSummaryHeading = ({ month }: { month: string }) => (
  <>
    <SummaryViewSwitch
      view="month"
      monthHref={monthSummaryHref(month)}
      yearHref={yearSummaryHref(Number(month.slice(0, 4)))}
    />
    <MonthHeading month={month} hrefOf={monthSummaryHref} />
  </>
);

type MonthSummary = MonthProps["summary"];

/** 最近見た月の集計。隣の月を、骨組みではなく前に見た集計で見せる */
const summaryCache = createMonthPageCache<MonthSummary>();

/**
 * 月の合計とカテゴリ別の内訳。月を移るときに横に送る部分。
 *
 * 広い画面では 1 行目に月の見出しを見えないように置き、上に重ねた本物の見出しの右に合計の下端をそろえる
 * （見出しの高さを測って渡すと、描くまで位置が決まらずにずれる）。
 */
const MonthSummaryFigures = ({ month, summary }: { month: string; summary: MonthSummary }) => (
  <>
    <div className="grid gap-x-4 gap-y-6 md:grid-cols-12 md:items-end">
      <div aria-hidden className="hidden md:invisible md:col-span-3 md:flex md:flex-col md:gap-4">
        <MonthSummaryHeading month={month} />
      </div>
      <div className="md:col-span-9">
        <SummaryTotals payment={summary.payment.total} income={summary.income.total} />
      </div>
    </div>
    <Section label="支出">
      <CategoryBreakdown summary={summary.payment} month={month} mode="payment" />
    </Section>
    <Section label="収入">
      <CategoryBreakdown summary={summary.income} month={month} mode="income" />
    </Section>
  </>
);

/**
 * 隣の月の仮の中身。前に見た月なら覚えている集計を、まだ見ていなければ骨組みを出す。
 */
const NeighborSummary = ({ month }: { month: string }) => {
  const cached = summaryCache.recall(monthSummaryHref(month));
  if (cached !== undefined) {
    return (
      <div className="flex flex-col gap-12">
        <MonthSummaryFigures month={month} summary={cached} />
      </div>
    );
  }
  return (
    <Section label="" className="gap-y-0">
      <Skeleton rows={6} />
    </Section>
  );
};

/**
 * 月ごとの集計の画面。横に送ると前後の月へ移る。
 *
 * 取引の一覧とそろえ、月の見出しは動かさず、合計とカテゴリ別の内訳だけを横に送る。
 * 広い画面では合計を見出しの右に並べたいので、横に送る並びを見出しの高さから始め、見出しをその上に重ねる。
 */
const MonthSummaryPage = ({ month, summary }: MonthProps) => {
  useEffect(() => summaryCache.remember(monthSummaryHref(month), summary), [month, summary]);
  return (
    <div className="flex flex-col gap-12 md:grid md:grid-cols-12 md:gap-x-4">
      {/* 送っている途中の合計が見出しの後ろをくぐるよう、地の色で塗って上に重ねる。左右の余白も塗る */}
      <div className="relative z-10 flex flex-col gap-4 bg-background md:col-span-3 md:col-start-1 md:row-start-1 md:-mx-4 md:self-start md:px-4">
        <MonthSummaryHeading month={month} />
      </div>
      <div className="min-w-0 md:col-span-12 md:col-start-1 md:row-start-1">
        <MonthPager
          month={month}
          hrefOf={monthSummaryHref}
          placeholder={(neighbor) => <NeighborSummary month={neighbor} />}
          className="flex flex-col gap-12"
        >
          <MonthSummaryFigures month={month} summary={summary} />
        </MonthPager>
      </div>
    </div>
  );
};

/**
 * 年の集計の画面。月ごとの推移のグラフと、カテゴリ別の年の合計を出す。
 */
const YearSummaryPage = ({ year, currentMonth, summary }: YearProps) => (
  <div className="flex flex-col gap-12">
    <div className="grid gap-x-4 gap-y-6 md:grid-cols-12 md:items-end">
      <div className="flex flex-col gap-4 md:col-span-3">
        <SummaryViewSwitch
          view="year"
          monthHref={monthSummaryHref(monthForYear(year, currentMonth))}
          yearHref={yearSummaryHref(year)}
        />
        <YearHeading year={year} />
      </div>
      <div className="md:col-span-9">
        <SummaryTotals payment={summary.payment.total} income={summary.income.total} />
      </div>
    </div>
    <YearSummaryBody year={year} summary={summary} />
  </div>
);

/**
 * 集計の画面。クエリの年の指定で、月の表示と年の表示を切り替える。
 */
const SummaryPage = (props: Props) =>
  props.view === "year" ? <YearSummaryPage {...props} /> : <MonthSummaryPage {...props} />;

export default SummaryPage;

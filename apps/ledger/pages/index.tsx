import { Link } from "@void/react";
import { type ReactNode, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { shiftMonth } from "@/ledger/dates";
import type { CategoryTotal, ModeSummary } from "@/ledger/summary";
import { cn } from "@/lib/utils";
import { MonthHeading } from "@/web/components/MonthHeading";
import { PeriodPager } from "@/web/components/PeriodPager";
import { Section } from "@/web/components/Section";
import { SkeletonBlock } from "@/web/components/Skeleton";
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

type Totals = { payment: number; income: number };

/**
 * 合計と、その下の本体（カテゴリ別の内訳やグラフ）。前後の期間へ移るときに横に送る部分。
 * まだ読んでいない隣の期間（totals と body が null）では、合計の金額と本体の全体を骨組みにする。
 *
 * 広い画面では 1 行目に見出しを見えないように置き、上に重ねた本物の見出しの右に合計の下端をそろえる
 * （見出しの高さを測って渡すと、描くまで位置が決まらずにずれる）。
 */
const SummaryFigures = ({
  heading,
  totals,
  body,
}: {
  heading: ReactNode;
  totals: Totals | null;
  body: ReactNode;
}) => (
  <>
    <div className="grid gap-x-4 gap-y-6 md:grid-cols-12 md:items-end">
      <div aria-hidden className="hidden md:invisible md:col-span-3 md:flex md:flex-col md:gap-4">
        {heading}
      </div>
      <div className="md:col-span-9">
        <SummaryTotals totals={totals} />
      </div>
    </div>
    {body ?? <SkeletonBlock rows={6} />}
  </>
);

/**
 * 集計の画面の骨組み。見出しは動かさず、合計と本体だけを横に送る（取引の一覧とそろえる）。
 *
 * 広い画面では合計を見出しの右に並べたいので、横に送る並びを見出しの高さから始め、見出しをその上に重ねる。
 */
const SummaryLayout = ({ heading, children }: { heading: ReactNode; children: ReactNode }) => (
  <div className="flex flex-col gap-12 md:grid md:grid-cols-12 md:gap-x-4">
    {/*
     * 送っている途中の合計が見出しの後ろをくぐるよう、地の色で塗って上に重ねる。
     * 塗るのは見出しの幅（と左の余白）だけにし、右の端は地の色へ溶かしてぼかし、切れ目を目立たせない
     */}
    <div className="relative z-10 flex flex-col gap-4 bg-background md:col-span-3 md:col-start-1 md:row-start-1 md:-ml-4 md:w-max md:self-start md:pl-4 md:after:pointer-events-none md:after:absolute md:after:inset-y-0 md:after:left-full md:after:w-10 md:after:bg-linear-to-r md:after:from-background md:after:to-transparent md:after:backdrop-blur-[3px] md:after:mask-[linear-gradient(to_right,black,transparent)] md:after:content-['']">
      {heading}
    </div>
    <div className="min-w-0 md:col-span-12 md:col-start-1 md:row-start-1">{children}</div>
  </div>
);

type MonthSummary = MonthProps["summary"];

/** 最近見た月の集計。隣の月を、骨組みではなく前に見た集計で見せる */
const monthCache = createMonthPageCache<MonthSummary>();

/**
 * 月の集計の合計とカテゴリ別の内訳。集計を読んでいなければ（null）骨組みにする。
 */
const MonthSummaryFigures = ({
  month,
  summary,
}: {
  month: string;
  summary: MonthSummary | null;
}) => (
  <SummaryFigures
    heading={<MonthSummaryHeading month={month} />}
    totals={summary && { payment: summary.payment.total, income: summary.income.total }}
    body={
      summary && (
        <>
          <Section label="支出">
            <CategoryBreakdown summary={summary.payment} month={month} mode="payment" />
          </Section>
          <Section label="収入">
            <CategoryBreakdown summary={summary.income} month={month} mode="income" />
          </Section>
        </>
      )
    }
  />
);

/**
 * 月ごとの集計の画面。横に送ると前後の月へ移る。
 */
const MonthSummaryPage = ({ month, summary }: MonthProps) => {
  useEffect(() => monthCache.remember(monthSummaryHref(month), summary), [month, summary]);
  return (
    <SummaryLayout heading={<MonthSummaryHeading month={month} />}>
      <PeriodPager
        period={month}
        previous={shiftMonth(month, -1)}
        next={shiftMonth(month, 1)}
        hrefOf={monthSummaryHref}
        // 前に見た月なら覚えている集計を、まだ見ていなければ骨組みを出す
        placeholder={(neighbor) => (
          <div className="flex flex-col gap-12">
            <MonthSummaryFigures
              month={neighbor}
              summary={monthCache.recall(monthSummaryHref(neighbor)) ?? null}
            />
          </div>
        )}
        className="flex flex-col gap-12"
      >
        <MonthSummaryFigures month={month} summary={summary} />
      </PeriodPager>
    </SummaryLayout>
  );
};

/**
 * 年の集計の見出し。月・年の切り替えと、前後の年へのリンクの付いた年。
 */
const YearSummaryHeading = ({ year, currentMonth }: { year: number; currentMonth: string }) => (
  <>
    <SummaryViewSwitch
      view="year"
      monthHref={monthSummaryHref(monthForYear(year, currentMonth))}
      yearHref={yearSummaryHref(year)}
    />
    <YearHeading year={year} />
  </>
);

type YearSummary = YearProps["summary"];

/** 最近見た年の集計。隣の年を、骨組みではなく前に見た集計で見せる */
const yearCache = createMonthPageCache<YearSummary>();

/**
 * 年の集計の合計と、月ごとの推移のグラフ、カテゴリ別の年の合計。集計を読んでいなければ（null）骨組みにする。
 */
const YearSummaryFigures = ({
  year,
  currentMonth,
  summary,
}: {
  year: number;
  currentMonth: string;
  summary: YearSummary | null;
}) => (
  <SummaryFigures
    heading={<YearSummaryHeading year={year} currentMonth={currentMonth} />}
    totals={summary && { payment: summary.payment.total, income: summary.income.total }}
    body={summary && <YearSummaryBody year={year} summary={summary} />}
  />
);

/**
 * 年の集計の画面。横に送ると前後の年へ移る。
 */
const YearSummaryPage = ({ year, currentMonth, summary }: YearProps) => {
  useEffect(() => yearCache.remember(yearSummaryHref(year), summary), [year, summary]);
  /** 年の並びの期間（文字列）から年の集計の URL を作る */
  const hrefOf = (period: string) => yearSummaryHref(Number(period));
  return (
    <SummaryLayout heading={<YearSummaryHeading year={year} currentMonth={currentMonth} />}>
      <PeriodPager
        period={String(year)}
        previous={String(year - 1)}
        next={String(year + 1)}
        hrefOf={hrefOf}
        placeholder={(neighbor) => (
          <div className="flex flex-col gap-12">
            <YearSummaryFigures
              year={Number(neighbor)}
              currentMonth={currentMonth}
              summary={yearCache.recall(hrefOf(neighbor)) ?? null}
            />
          </div>
        )}
        className="flex flex-col gap-12"
      >
        <YearSummaryFigures year={year} currentMonth={currentMonth} summary={summary} />
      </PeriodPager>
    </SummaryLayout>
  );
};

/**
 * 集計の画面。クエリの年の指定で、月の表示と年の表示を切り替える。
 */
const SummaryPage = (props: Props) =>
  props.view === "year" ? <YearSummaryPage {...props} /> : <MonthSummaryPage {...props} />;

export default SummaryPage;

import { Link } from "@void/react";
import { type ReactNode, useEffect } from "react";
import { shiftMonth } from "@/ledger/dates";
import type { CategoryTotal, ModeSummary } from "@/ledger/summary";
import { MonthHeading } from "@/web/components/MonthHeading";
import { PeriodPager } from "@/web/components/PeriodPager";
import { Section } from "@tsuke/ui/patterns/Section";
import { SkeletonBlock } from "@/web/components/Skeleton";
import { SummaryTotals } from "@/web/components/SummaryTotals";
import { CategoryDetails, CategoryList, GenreRow } from "@/web/components/CategorySummary";
import { PeriodViewSwitch } from "@/web/components/PeriodViewSwitch";
import { YearHeading } from "@/web/components/YearHeading";
import { YearSummaryBody } from "@/web/components/YearSummary";
import { monthForYear, monthSummaryHref, yearSummaryHref } from "@/web/summaryView";
import { createMonthPageCache } from "@/web/monthPageCache";
import { transactionsHref } from "@/web/transactionsHref";
import type { Props } from "./index.server";
import styles from "./index.module.css";

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
}) => (
  <CategoryDetails name={category.name} amount={category.amount} total={total}>
    <ul className={styles.Genres}>
      {category.genres.map((genre) => (
        <li key={genre.genreId ?? "none"} className={styles.item}>
          <GenreRow
            name={genre.name}
            amount={genre.amount}
            total={category.amount}
            indent
            // 内訳のない品目は条件で絞り込めないので、一覧へのリンクにしない
            href={
              category.categoryId !== null && genre.genreId !== null
                ? transactionsHref({
                    period: month,
                    mode,
                    categoryId: category.categoryId,
                    genreId: genre.genreId,
                  })
                : undefined
            }
          />
        </li>
      ))}
      {category.categoryId !== null && (
        <li className={styles.item}>
          <Link
            href={transactionsHref({ period: month, mode, categoryId: category.categoryId })}
            className={styles.transactionsLink}
          >
            {category.name}の取引 →
          </Link>
        </li>
      )}
    </ul>
  </CategoryDetails>
);

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
}) => (
  <CategoryList isEmpty={summary.categories.length === 0} empty="この月の記録はありません">
    {summary.categories.map((category) => (
      <CategoryRow
        key={category.categoryId ?? "none"}
        category={category}
        total={summary.total}
        month={month}
        mode={mode}
      />
    ))}
  </CategoryList>
);

type MonthProps = Extract<Props, { view: "month" }>;
type YearProps = Extract<Props, { view: "year" }>;

/**
 * 月の集計の見出し。月・年の切り替えと、前後の月へのリンクの付いた月。
 */
const MonthSummaryHeading = ({ month }: { month: string }) => (
  <>
    <PeriodViewSwitch
      label="集計の単位"
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
    <div className={styles.Figures}>
      <div aria-hidden className={styles.headingSpace}>
        {heading}
      </div>
      <div className={styles.totals}>
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
  <div className={styles.SummaryLayout}>
    <div className={styles.heading}>{heading}</div>
    <div className={styles.body}>{children}</div>
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
          <div className={styles.Stack}>
            <MonthSummaryFigures
              month={neighbor}
              summary={monthCache.recall(monthSummaryHref(neighbor)) ?? null}
            />
          </div>
        )}
        gap="loose"
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
    <PeriodViewSwitch
      label="集計の単位"
      view="year"
      monthHref={monthSummaryHref(monthForYear(year, currentMonth))}
      yearHref={yearSummaryHref(year)}
    />
    <YearHeading year={year} hrefOf={yearSummaryHref} />
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
          <div className={styles.Stack}>
            <YearSummaryFigures
              year={Number(neighbor)}
              currentMonth={currentMonth}
              summary={yearCache.recall(hrefOf(neighbor)) ?? null}
            />
          </div>
        )}
        gap="loose"
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

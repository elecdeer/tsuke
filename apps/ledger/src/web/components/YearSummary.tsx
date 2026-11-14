import { useState } from "react";
import { monthsOfYear } from "@/ledger/dates";
import type { YearlyModeSummary, YearlySummary } from "@/ledger/summary";
import { MonthlyBarChart } from "@/web/components/MonthlyBarChart";
import { Section } from "@tsuke/ui/patterns/Section";
import { CategoryDetails, CategoryList, GenreRow } from "@/web/components/CategorySummary";
import styles from "./YearSummary.module.css";

type YearlyCategory = YearlyModeSummary["categories"][number];

/**
 * カテゴリ 1 つ分の行。開くと月ごとの金額のグラフと、内訳ごとの合計が出る。
 *
 * グラフは開いたときにだけ描く。カテゴリは数十あるので、閉じたものまで描くと重くなるため。
 */
const YearCategoryRow = ({
  category,
  total,
  year,
}: {
  category: YearlyCategory;
  total: number;
  year: number;
}) => {
  const [open, setOpen] = useState(false);
  const months = monthsOfYear(year);
  return (
    <CategoryDetails name={category.name} amount={category.amount} total={total} onToggle={setOpen}>
      <div className={styles.Breakdown}>
        {open && (
          <MonthlyBarChart
            bars={months.map((month, index) => ({
              month,
              series: category.name,
              amount: category.monthly[index] ?? 0,
            }))}
            series={[category.name]}
            ariaLabel={`${year}年の${category.name}の月ごとの金額`}
            height={140}
          />
        )}
        <ul className={styles.genres}>
          {category.genres.map((genre) => (
            <li key={genre.genreId ?? "none"}>
              <GenreRow name={genre.name} amount={genre.amount} total={category.amount} />
            </li>
          ))}
        </ul>
      </div>
    </CategoryDetails>
  );
};

/**
 * 支出か収入のカテゴリ別の年の合計。
 */
const YearCategoryBreakdown = ({ summary, year }: { summary: YearlyModeSummary; year: number }) => (
  <CategoryList isEmpty={summary.categories.length === 0} empty="この年の記録はありません">
    {summary.categories.map((category) => (
      <YearCategoryRow
        key={category.categoryId ?? "none"}
        category={category}
        total={summary.total}
        year={year}
      />
    ))}
  </CategoryList>
);

/**
 * 年の集計の中身。月ごとの支出と収入のグラフと、カテゴリ別の年の合計を出す。
 */
export const YearSummaryBody = ({ year, summary }: { year: number; summary: YearlySummary }) => (
  <>
    <Section label="月ごと">
      <MonthlyBarChart
        bars={summary.months.flatMap((month) => [
          { month: month.month, series: "支出", amount: month.payment },
          { month: month.month, series: "収入", amount: month.income },
        ])}
        series={["支出", "収入"]}
        ariaLabel={`${year}年の月ごとの支出と収入`}
        height={240}
        ruled
      />
      <p className={styles.Note}>
        棒を押すとその月の集計へ移ります。「年の集計にのみ含める」の取引も含めています
      </p>
    </Section>
    <Section label="支出">
      <YearCategoryBreakdown summary={summary.payment} year={year} />
    </Section>
    <Section label="収入">
      <YearCategoryBreakdown summary={summary.income} year={year} />
    </Section>
  </>
);

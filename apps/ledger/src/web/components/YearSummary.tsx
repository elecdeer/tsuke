import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { monthsOfYear } from "@/ledger/dates";
import type { YearlyModeSummary, YearlySummary } from "@/ledger/summary";
import { cn } from "@/lib/utils";
import { MonthlyBarChart } from "@/web/components/MonthlyBarChart";
import { Section } from "@/web/components/Section";
import { ROW_COLUMNS } from "@/web/components/SummaryTotals";
import { formatAmount, formatPercent } from "@/web/format";

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
  const ratio = total > 0 ? Math.max(category.amount / total, 0) : 0;
  const months = monthsOfYear(year);
  return (
    <details className="group border-b" onToggle={(event) => setOpen(event.currentTarget.open)}>
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
      <div className="flex flex-col gap-3 pb-3 pl-5">
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
        <ul className="text-sm">
          {category.genres.map((genre) => (
            <li key={genre.genreId ?? "none"} className={cn(ROW_COLUMNS, "py-1.5")}>
              <span className="truncate">{genre.name}</span>
              <span className="text-right text-xs text-muted-foreground tabular-nums">
                {formatPercent(genre.amount, category.amount)}
              </span>
              <span className="text-right tabular-nums">{formatAmount(genre.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
};

/**
 * 支出か収入のカテゴリ別の年の合計。
 */
const YearCategoryBreakdown = ({ summary, year }: { summary: YearlyModeSummary; year: number }) =>
  summary.categories.length === 0 ? (
    <p className="border-t border-foreground py-2.5 text-sm text-muted-foreground">
      この年の記録はありません
    </p>
  ) : (
    <div className="border-t border-foreground">
      {summary.categories.map((category) => (
        <YearCategoryRow
          key={category.categoryId ?? "none"}
          category={category}
          total={summary.total}
          year={year}
        />
      ))}
    </div>
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
        className="border-t border-foreground pt-3"
      />
      <p className="mt-2 text-xs text-muted-foreground">
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

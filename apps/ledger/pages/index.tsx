import { Link } from "@void/react";
import { ChevronRight } from "lucide-react";
import type { CategoryTotal, ModeSummary } from "@/ledger/summary";
import { cn } from "@/lib/utils";
import { MonthHeading, MonthTitle } from "@/web/components/MonthHeading";
import { MonthPager } from "@/web/components/MonthPager";
import { Section } from "@/web/components/Section";
import { Skeleton } from "@/web/components/Skeleton";
import { formatAmount, formatPercent, formatSignedAmount } from "@/web/format";
import { transactionsHref } from "@/web/transactionsHref";
import type { Props } from "./index.server";

type Mode = "payment" | "income";

/** 名前・割合・金額の 3 列。カテゴリの行と内訳の行で列をそろえる */
const ROW_COLUMNS = "grid grid-cols-[minmax(0,1fr)_4rem_7rem] items-baseline gap-x-4";

/**
 * 支出・収入・収支の合計。収支はこの画面で一番見てほしい数字なので、アクセントの色で出す。
 */
const Totals = ({ payment, income }: { payment: number; income: number }) => {
  const items = [
    { label: "支出", value: formatAmount(payment), accent: false },
    { label: "収入", value: formatAmount(income), accent: false },
    { label: "収支", value: formatSignedAmount(income - payment), accent: true },
  ];
  return (
    <dl className="grid grid-cols-3 gap-x-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "flex flex-col gap-1 border-t pt-1.5",
            item.accent ? "border-primary text-primary" : "border-foreground",
          )}
        >
          <dt className={cn("text-xs", !item.accent && "text-muted-foreground")}>{item.label}</dt>
          <dd className="text-xl font-semibold tracking-tight tabular-nums sm:text-3xl">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
};

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

/**
 * 集計の画面の URL を月から作る。
 */
const summaryHref = (month: string): string => `/?month=${month}`;

/**
 * 隣の月の集計を読むまで出しておく仮の中身。月の見出しの位置を本物にそろえる。
 */
const SummaryPlaceholder = ({ month }: { month: string }) => (
  <div className="flex flex-col gap-12">
    {/* 前後の月へのリンクの行の高さだけ空ける */}
    <div className="flex flex-col gap-1 pt-4">
      <MonthTitle month={month} />
    </div>
    <Skeleton rows={6} />
  </div>
);

/**
 * 月ごとの集計の画面。横に送ると前後の月へ移る。
 */
const SummaryPage = ({ month, summary }: Props) => (
  <MonthPager
    month={month}
    hrefOf={summaryHref}
    placeholder={(neighbor) => <SummaryPlaceholder month={neighbor} />}
    className="flex flex-col gap-12"
  >
    <div className="grid gap-x-4 gap-y-6 md:grid-cols-12 md:items-end">
      <div className="md:col-span-3">
        <MonthHeading month={month} hrefOf={summaryHref} />
      </div>
      <div className="md:col-span-9">
        <Totals payment={summary.payment.total} income={summary.income.total} />
      </div>
    </div>
    <Section label="支出">
      <CategoryBreakdown summary={summary.payment} month={month} mode="payment" />
    </Section>
    <Section label="収入">
      <CategoryBreakdown summary={summary.income} month={month} mode="income" />
    </Section>
  </MonthPager>
);

export default SummaryPage;

import { cn } from "@tsuke/ui/lib/utils";
import { SkeletonText } from "@/web/components/Skeleton";
import { formatAmount, formatSignedAmount } from "@/web/format";

/** 名前・割合・金額の 3 列。集計のカテゴリの行と内訳の行で列をそろえる */
export const ROW_COLUMNS = "grid grid-cols-[minmax(0,1fr)_4rem_7rem] items-baseline gap-x-4";

/**
 * 支出・収入・収支の合計。収支は集計の画面で一番見てほしい数字なので、アクセントの色で出す。
 * 合計がまだわからない（隣の月を読む前）なら null を渡すと、金額の所だけを骨組みにする。
 */
export const SummaryTotals = ({
  totals,
}: {
  totals: { payment: number; income: number } | null;
}) => {
  const items = [
    { label: "支出", value: totals && formatAmount(totals.payment), accent: false },
    { label: "収入", value: totals && formatAmount(totals.income), accent: false },
    {
      label: "収支",
      value: totals && formatSignedAmount(totals.income - totals.payment),
      accent: true,
    },
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
            {item.value ?? <SkeletonText className="w-24" />}
          </dd>
        </div>
      ))}
    </dl>
  );
};

import { cn } from "@/lib/utils";
import { formatAmount, formatSignedAmount } from "@/web/format";

/** 名前・割合・金額の 3 列。集計のカテゴリの行と内訳の行で列をそろえる */
export const ROW_COLUMNS = "grid grid-cols-[minmax(0,1fr)_4rem_7rem] items-baseline gap-x-4";

/**
 * 支出・収入・収支の合計。収支は集計の画面で一番見てほしい数字なので、アクセントの色で出す。
 */
export const SummaryTotals = ({ payment, income }: { payment: number; income: number }) => {
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

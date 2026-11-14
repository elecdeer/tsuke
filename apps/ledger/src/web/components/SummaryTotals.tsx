import { SkeletonText } from "@/web/components/Skeleton";
import { formatAmount, formatSignedAmount } from "@/web/format";
import styles from "./SummaryTotals.module.css";

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
    <dl className={styles.SummaryTotals}>
      {items.map((item) => (
        <div key={item.label} className={styles.item} data-accent={item.accent || undefined}>
          <dt className={styles.label}>{item.label}</dt>
          <dd className={styles.value}>{item.value ?? <SkeletonText width="lg" />}</dd>
        </div>
      ))}
    </dl>
  );
};

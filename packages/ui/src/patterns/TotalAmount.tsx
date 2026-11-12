import { formatAmount } from "@tsuke/ui/lib/format";
import { cn } from "@tsuke/ui/lib/utils";
import { YenUnit } from "@tsuke/ui/patterns/YenUnit";

/**
 * 合計の金額。その画面で一番大事な数字なので大きく出し、単位は小さく添えて数字を読む邪魔をしない。
 */
export const TotalAmount = ({
  amount,
  label = "合計",
  className,
}: {
  amount: number;
  /** 金額の左に小さく添える名前 */
  label?: string;
  className?: string;
}) => (
  <div className={cn("flex items-baseline justify-between gap-3", className)}>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-2xl font-semibold tracking-tight tabular-nums">
      {formatAmount(amount)}
      <YenUnit className="ml-0.5" />
    </span>
  </div>
);

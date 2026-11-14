import { formatAmount } from "@tsuke/ui/lib/format";
import { cn } from "@tsuke/ui/lib/utils";
import { YenUnit } from "@tsuke/ui/patterns/YenUnit";
import styles from "./TotalAmount.module.css";

/**
 * 合計の金額。その画面で一番大事な数字なので大きく出し、単位は小さく添えて数字を読む邪魔をしない。
 * className は、並べる側がこの合計の置き場所（幅など）を決めるときにだけ使う。
 */
export const TotalAmount = ({
  amount,
  label = "合計",
  ruled = false,
  className,
}: {
  amount: number;
  /** 金額の左に小さく添える名前 */
  label?: string;
  /** まとまりの始まりとして、上に黒の線を引く */
  ruled?: boolean;
  className?: string;
}) => (
  <div className={cn(styles.TotalAmount, className)} data-ruled={ruled || undefined}>
    <span className={styles.label}>{label}</span>
    <span className={styles.amount}>
      {formatAmount(amount)}
      <YenUnit className={styles.unit} />
    </span>
  </div>
);

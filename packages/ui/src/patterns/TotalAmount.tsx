import { TriangleAlert } from "lucide-react";
import { formatAmount } from "@tsuke/ui/lib/format";
import { cn } from "@tsuke/ui/lib/utils";
import { YenUnit } from "@tsuke/ui/patterns/YenUnit";
import styles from "./TotalAmount.module.css";

/**
 * 合計の金額。その画面で一番大事な数字なので大きく出し、単位は小さく添えて数字を読む邪魔をしない。
 * className は、並べる側がこの合計の置き場所（幅など）を決めるときにだけ使う。
 *
 * `expected` を渡すと、合計がそれと合わないあいだ、その金額を添えて知らせる。
 * 品目を直せば知らせが消えるよう、合っているかは渡された金額どうしでその都度比べる。
 */
export const TotalAmount = ({
  amount,
  label = "合計",
  ruled = false,
  expected = null,
  className,
}: {
  amount: number;
  /** 金額の左に小さく添える名前 */
  label?: string;
  /** まとまりの始まりとして、上に黒の線を引く */
  ruled?: boolean;
  /** 合っているはずの合計（レシートから読み取った合計など）。分からなければ null */
  expected?: number | null;
  className?: string;
}) => (
  <div className={cn(styles.TotalAmount, className)} data-ruled={ruled || undefined}>
    <span className={styles.label}>{label}</span>
    <span className={styles.amount}>
      {formatAmount(amount)}
      <YenUnit className={styles.unit} />
    </span>
    {expected !== null && expected !== amount && (
      <output className={styles.mismatch}>
        <TriangleAlert className={styles.mismatchIcon} aria-hidden="true" />
        読み取った合計 {formatAmount(expected)}円と合いません
      </output>
    )}
  </div>
);

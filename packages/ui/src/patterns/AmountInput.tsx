import type { ComponentProps } from "react";
import { Input } from "@tsuke/ui/components/input";
import { YenUnit } from "@tsuke/ui/patterns/YenUnit";
import styles from "./AmountInput.module.css";

/**
 * 金額の入力欄。数字は右揃えにし、「円」を欄の右端に添える。
 */
export const AmountInput = (props: Omit<ComponentProps<typeof Input>, "align" | "className">) => (
  <div className={styles.AmountInput}>
    <Input {...props} align="end" className={styles.input} />
    <span aria-hidden="true" className={styles.unit}>
      <YenUnit />
    </span>
  </div>
);

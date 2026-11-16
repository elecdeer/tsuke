import * as React from "react";
import { cn } from "@tsuke/ui/lib/utils";
import styles from "./checkbox.module.css";

/**
 * チェックボックス。印の色は文字の色にそろえ、赤（アクセント）は使わない（docs/design.md）。
 *
 * base-ui の Checkbox は使わず、ネイティブの input に見た目だけを付ける。ラベルで包む書き方と
 * `onChange` のイベントをそのまま使え、印も OS のものになるので、自前で描き直さなくて済むため。
 */
function Checkbox({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "size"> & {
  /** sm は小さな文字の行に並べる小さい印 */
  size?: "default" | "sm";
}) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      data-size={size}
      className={cn(styles.Checkbox, className)}
      {...props}
    />
  );
}

export { Checkbox };

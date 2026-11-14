import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@tsuke/ui/lib/utils";
import styles from "./input.module.css";

function Input({
  className,
  type,
  align = "start",
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & {
  /** end は数字を右に寄せ、桁をそろえる（金額など） */
  align?: "start" | "end";
  /** sm は行の中に並べる低い欄 */
  size?: "default" | "sm";
}) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-align={align}
      data-size={size}
      className={cn(styles.Input, className)}
      {...props}
    />
  );
}

export { Input };

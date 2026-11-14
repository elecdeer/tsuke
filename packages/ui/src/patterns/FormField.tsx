import type { ReactNode } from "react";
import { Label } from "@tsuke/ui/components/label";
import { visuallyHiddenClassName } from "@tsuke/ui/lib/a11y";
import { cn } from "@tsuke/ui/lib/utils";
import styles from "./FormField.module.css";

/**
 * ラベル付きの入力欄。ラベルは欄の上に小さく薄く出す。
 * hideLabel にすると、見た目からは隠して読み上げ用にだけ残す（見出しのある表の中や、行の中に並べるときなど）。
 * className は、並べる側がこの欄の置き場所（グリッドの列など）を決めるときにだけ使う。
 */
export const FormField = ({
  label,
  htmlFor,
  hideLabel = false,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <div className={cn(styles.FormField, className)}>
    <Label htmlFor={htmlFor} className={cn(styles.label, hideLabel && visuallyHiddenClassName)}>
      {label}
    </Label>
    {children}
  </div>
);

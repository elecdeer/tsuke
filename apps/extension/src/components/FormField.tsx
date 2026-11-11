import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * ラベル付きの入力欄。ラベルは欄の上に小さく薄く出す（台帳の FormField と同じ見た目）。
 * hideLabel にすると、見た目からは隠して読み上げ用にだけ残す（行の中に並べるときなど）。
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
  <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
    <Label
      htmlFor={htmlFor}
      className={cn("text-xs font-normal text-muted-foreground", hideLabel && "sr-only")}
    >
      {label}
    </Label>
    {children}
  </div>
);

/**
 * 金額に添える単位。順序は文字の大きさと太さで付けるので、数字より小さく細く出す。
 */
export const YenUnit = ({ className }: { className?: string }) => (
  <span className={cn("text-xs font-normal tracking-normal text-muted-foreground", className)}>
    円
  </span>
);

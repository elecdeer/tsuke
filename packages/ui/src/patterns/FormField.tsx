import type { ReactNode } from "react";
import { Label } from "@tsuke/ui/components/label";
import { cn } from "@tsuke/ui/lib/utils";

/**
 * ラベル付きの入力欄。ラベルは欄の上に小さく薄く出す。
 * hideLabel にすると、見た目からは隠して読み上げ用にだけ残す（見出しのある表の中や、行の中に並べるときなど）。
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

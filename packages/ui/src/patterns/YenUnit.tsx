import { cn } from "@tsuke/ui/lib/utils";

/**
 * 金額に添える単位。順序は文字の大きさと太さで付ける（docs/design.md）ので、数字より小さく細く出す。
 * 数字の後ろに置くので、どの行でも桁がそろう。
 */
export const YenUnit = ({ className }: { className?: string }) => (
  <span className={cn("text-xs font-normal tracking-normal text-muted-foreground", className)}>
    円
  </span>
);

import { cn } from "@tsuke/ui/lib/utils";
import styles from "./YenUnit.module.css";

/**
 * 金額に添える単位。順序は文字の大きさと太さで付ける（docs/design.md）ので、数字より小さく細く出す。
 * 数字の後ろに置くので、どの行でも桁がそろう。
 * className は、並べる側が数字との間（余白）を決めるときにだけ使う。
 */
export const YenUnit = ({ className }: { className?: string }) => (
  <span className={cn(styles.YenUnit, className)}>円</span>
);

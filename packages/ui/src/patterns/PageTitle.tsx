import type { ComponentProps } from "react";
import { cn } from "@tsuke/ui/lib/utils";
import styles from "./PageTitle.module.css";

/**
 * 画面の見出し（h1）。Section の見出しの列に置くことが多い。
 * className は、並べる側が見出しの見せ方（狭い画面では読み上げだけにするなど）を決めるときにだけ使う。
 */
export const PageTitle = ({
  className,
  size = "default",
  children,
  ...props
}: ComponentProps<"h1"> & {
  /** lg は見出しのほかに大きな数字を置かない画面（設定など）で使う */
  size?: "default" | "lg";
}) => (
  <h1 className={cn(styles.PageTitle, className)} data-size={size} {...props}>
    {children}
  </h1>
);

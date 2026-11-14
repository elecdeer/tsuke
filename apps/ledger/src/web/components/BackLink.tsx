import { Link } from "@void/react";
import type { ComponentProps } from "react";
import styles from "./BackLink.module.css";

/**
 * 一つ上の画面（設定・取引の一覧など）へ戻るリンク。文言は「← 設定」のように矢印から始める。
 */
export const BackLink = (props: Omit<ComponentProps<typeof Link>, "className">) => (
  <Link {...props} className={styles.BackLink} />
);

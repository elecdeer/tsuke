import { Link } from "@void/react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { formatAmount, formatPercent } from "@/web/format";
import styles from "./CategorySummary.module.css";

/**
 * カテゴリ別の合計の一覧（月の集計・年の集計）。行がなければ empty を出す。
 */
export const CategoryList = ({
  isEmpty,
  empty,
  children,
}: {
  isEmpty: boolean;
  /** 記録がないときの知らせ */
  empty: string;
  children: ReactNode;
}) =>
  isEmpty ? (
    <p className={styles.CategoryEmpty}>{empty}</p>
  ) : (
    <div className={styles.CategoryList}>{children}</div>
  );

/**
 * カテゴリ 1 つ分の行。名前・合計に対する割合・金額と、割合の横棒を出し、開くと children（内訳など）が出る。
 */
export const CategoryDetails = ({
  name,
  amount,
  total,
  onToggle,
  children,
}: {
  name: string;
  amount: number;
  /** 割合の分母（支出か収入の合計） */
  total: number;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}) => {
  const ratio = total > 0 ? Math.max(amount / total, 0) : 0;
  return (
    <details
      className={styles.CategoryDetails}
      onToggle={onToggle && ((event) => onToggle(event.currentTarget.open))}
    >
      <summary className={styles.summary}>
        <span className={styles.name}>
          <ChevronRight className={styles.chevron} />
          <span className={styles.nameText}>{name}</span>
        </span>
        <span className={styles.percent}>{formatPercent(amount, total)}</span>
        <span className={styles.amount}>{formatAmount(amount)}</span>
        <span className={styles.ratio}>
          <span className={styles.ratioBar} style={{ width: `${ratio * 100}%` }} />
        </span>
      </summary>
      {children}
    </details>
  );
};

/**
 * 内訳 1 つ分の行。列はカテゴリの行にそろえる。href があれば、その条件の取引の一覧へのリンクにする。
 */
export const GenreRow = ({
  name,
  amount,
  total,
  href,
  indent = false,
}: {
  name: string;
  amount: number;
  /** 割合の分母（カテゴリの合計） */
  total: number;
  href?: string;
  /** 名前をカテゴリの名前より下げる */
  indent?: boolean;
}) => {
  const content = (
    <>
      <span className={styles.name}>{name}</span>
      <span className={styles.percent}>{formatPercent(amount, total)}</span>
      <span className={styles.amount}>{formatAmount(amount)}</span>
    </>
  );
  const dataProps = { "data-indent": indent || undefined };
  return href === undefined ? (
    <div className={styles.GenreRow} {...dataProps}>
      {content}
    </div>
  ) : (
    <Link href={href} className={styles.GenreRow} data-link="" {...dataProps}>
      {content}
    </Link>
  );
};

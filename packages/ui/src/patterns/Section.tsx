import type { CSSProperties, ReactNode } from "react";
import styles from "./Section.module.css";

/**
 * 見出しを左の 3 列、中身を右の 9 列に置くまとまり。狭いところでは見出しを中身の上に積む。
 * 置き場所の幅で切り替える（Section.module.css）。
 */
export const Section = ({
  label,
  children,
  gap = "default",
  stickyTop,
}: {
  label: ReactNode;
  children: ReactNode;
  /** none は狭いところで見出しと中身の間を空けない（日付ごとの一覧の行など） */
  gap?: "default" | "none";
  /** 指定すると、スクロールしても見出しをこの高さ（CSS の長さ）に貼り付ける */
  stickyTop?: string;
}) => (
  <section className={styles.Section}>
    <div className={styles.grid} data-gap={gap}>
      <div
        className={styles.label}
        data-sticky={stickyTop === undefined ? undefined : ""}
        style={
          stickyTop === undefined
            ? undefined
            : ({ "--section-sticky-top": stickyTop } as CSSProperties)
        }
      >
        {label}
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  </section>
);

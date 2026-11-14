import { Link } from "@void/react";
import styles from "./SummaryViewSwitch.module.css";

/**
 * 集計の画面の、月の表示と年の表示の切り替え。今の表示はナビと同じく下線で示す。
 */
export const SummaryViewSwitch = ({
  view,
  monthHref,
  yearHref,
}: {
  view: "month" | "year";
  monthHref: string;
  yearHref: string;
}) => (
  <nav aria-label="集計の単位" className={styles.SummaryViewSwitch}>
    {(
      [
        { key: "month", label: "月", href: monthHref },
        { key: "year", label: "年", href: yearHref },
      ] as const
    ).map((item) => (
      <Link
        key={item.key}
        href={item.href}
        aria-current={view === item.key ? "page" : undefined}
        className={styles.link}
      >
        {item.label}
      </Link>
    ))}
  </nav>
);

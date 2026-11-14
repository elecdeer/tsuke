import { Link } from "@void/react";
import styles from "./PeriodViewSwitch.module.css";

/**
 * 集計や取引の一覧の、月の表示と年の表示の切り替え。今の表示はナビと同じく下線で示す。
 */
export const PeriodViewSwitch = ({
  label,
  view,
  monthHref,
  yearHref,
}: {
  /** 読み上げで切り替えの用途を伝える名前（「集計の単位」など） */
  label: string;
  view: "month" | "year";
  monthHref: string;
  yearHref: string;
}) => (
  <nav aria-label={label} className={styles.PeriodViewSwitch}>
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

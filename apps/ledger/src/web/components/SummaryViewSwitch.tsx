import { Link } from "@void/react";
import { cn } from "@tsuke/ui/lib/utils";

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
  <nav aria-label="集計の単位" className="flex gap-4 text-sm">
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
        className={cn(
          "border-b-2 border-transparent pb-0.5 text-muted-foreground hover:text-foreground",
          view === item.key && "border-primary font-medium text-foreground",
        )}
      >
        {item.label}
      </Link>
    ))}
  </nav>
);

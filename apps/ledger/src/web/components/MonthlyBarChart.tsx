import { useRouter } from "@void/react";
import { barY, defineChart, group } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatYen } from "@/web/format";
import { formatCompactAmount, monthSummaryHref } from "@/web/summaryView";

/** グラフの 1 本の棒。series は凡例とツールチップに出す名前 */
export type MonthlyBar = { month: string; series: string; amount: number };

/**
 * 「10月」の形で月だけを書く。
 */
const monthLabel = (month: string): string => `${Number(month.slice(5))}月`;

/**
 * 月ごとの金額の棒グラフ。系列が複数あれば月ごとに横に並べる。棒を押すとその月の集計へ移る。
 *
 * 色は黒とグレーだけにする（docs/design.md）。系列の色はグラフの既定の色の変数を、出てきた順に上書きして決める。
 */
export const MonthlyBarChart = ({
  bars,
  series,
  ariaLabel,
  height,
  className,
}: {
  bars: MonthlyBar[];
  /** 系列の名前。この順に黒、グレーの色を割り当てる */
  series: string[];
  ariaLabel: string;
  height: number;
  className?: string;
}) => {
  const router = useRouter();
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(bars, {
            x: (bar) => monthLabel(bar.month),
            y: "amount",
            color: "series",
            key: (bar) => `${bar.month}:${bar.series}`,
            layout: group({ padding: 0.1 }),
            maxThickness: 24,
          }),
        ],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.2), axis: { ticks: { size: 0 } } },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { line: false, ticks: { size: 0, format: formatCompactAmount } },
          },
        },
        focus: "group-x",
        tooltip: {
          use: tooltip,
          formatGroup: (points) =>
            [
              points[0] === undefined ? "" : monthLabel(points[0].datum.month),
              // 指している棒が先頭に来るので、凡例と同じ系列の順に並べ直す
              ...[...points]
                .sort((a, b) => series.indexOf(a.datum.series) - series.indexOf(b.datum.series))
                .map((point) => `${point.datum.series} ${formatYen(point.datum.amount)}`),
            ].join("\n"),
        },
      }),
    [bars, series],
  );

  return (
    <div
      className={cn("monthly-bar-chart text-muted-foreground", className)}
      data-series-count={series.length}
    >
      {series.length > 1 && (
        <ul className="mb-2 flex gap-4 text-xs" aria-hidden>
          {series.map((name, index) => (
            <li key={name} className="flex items-center gap-1.5">
              <span
                className={cn("size-2.5", index === 0 ? "bg-foreground" : "bg-muted-foreground/50")}
              />
              {name}
            </li>
          ))}
        </ul>
      )}
      <Chart
        definition={definition}
        ariaLabel={ariaLabel}
        height={height}
        onSelect={(point) => {
          if (point !== null) void router.visit(monthSummaryHref(point.datum.month));
        }}
      />
    </div>
  );
};

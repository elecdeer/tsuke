import * as v from "valibot";
import { defineHandler, defineHead, type InferProps } from "void";
import { db } from "void/db";
import { formatMonth, todayInTokyo, monthOf } from "../src/ledger/dates.ts";
import { summarizeMonth, summarizeYear } from "../src/ledger/summary.ts";
import { OptionalMonthSchema, OptionalYearSchema } from "../src/web/params.ts";

export type Props = InferProps<typeof loader>;

const SummaryQuerySchema = v.object({ month: OptionalMonthSchema, year: OptionalYearSchema });

/**
 * 年の指定があれば年の集計、なければ月の集計を読む。どちらの指定もなければ今月にする。
 */
export const loader = defineHandler.withValidator({ query: SummaryQuerySchema })(async (
  _c,
  { query },
) => {
  const currentMonth = monthOf(todayInTokyo());
  if (query.year !== undefined) {
    return {
      view: "year" as const,
      year: query.year,
      currentMonth,
      summary: await summarizeYear(db, query.year),
    };
  }
  const month = query.month ?? currentMonth;
  return { view: "month" as const, month, summary: await summarizeMonth(db, month) };
});

export const head = defineHead<Props>((_c, props) => ({
  title: props.view === "year" ? `${props.year}年の集計` : `${formatMonth(props.month)}の集計`,
}));

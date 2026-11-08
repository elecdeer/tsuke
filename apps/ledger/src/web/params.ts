import * as v from "valibot";
import { isDate, isMonth } from "../ledger/dates.ts";

/** クエリの YYYY-MM。省略できる */
export const OptionalMonthSchema = v.optional(
  v.pipe(v.string(), v.check(isMonth, "月は YYYY-MM で指定してください")),
);

/** クエリの YYYY-MM-DD。省略できる */
export const OptionalDateSchema = v.optional(
  v.pipe(v.string(), v.check(isDate, "日付は YYYY-MM-DD で指定してください")),
);

/** クエリの ID。省略できる */
export const OptionalIdSchema = v.optional(
  v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.safeInteger()),
);

/** クエリの年（YYYY）。省略できる */
export const OptionalYearSchema = v.optional(
  v.pipe(v.string(), v.regex(/^\d{4}$/, "年は YYYY で指定してください"), v.transform(Number)),
);

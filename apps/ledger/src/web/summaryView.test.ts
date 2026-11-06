import { describe, expect, test } from "vite-plus/test";
import {
  formatCompactAmount,
  monthForYear,
  monthSummaryHref,
  yearSummaryHref,
} from "./summaryView.ts";

describe("monthSummaryHref と yearSummaryHref", () => {
  test("月と年のクエリを付けた集計の URL を作る", () => {
    expect(monthSummaryHref("2026-10")).toBe("/?month=2026-10");
    expect(yearSummaryHref(2026)).toBe("/?year=2026");
  });
});

describe("monthForYear", () => {
  test("今年なら今月を返す", () => {
    expect(monthForYear(2026, "2026-11")).toBe("2026-11");
  });

  test("ほかの年はその年の 12 月を返す", () => {
    expect(monthForYear(2025, "2026-11")).toBe("2025-12");
    expect(monthForYear(2027, "2026-11")).toBe("2027-12");
  });
});

describe("formatCompactAmount", () => {
  test("万の単位で、小数は 1 桁までにする", () => {
    expect(formatCompactAmount(0)).toBe("0");
    expect(formatCompactAmount(10_000)).toBe("1万");
    expect(formatCompactAmount(25_000)).toBe("2.5万");
    expect(formatCompactAmount(123_456)).toBe("12.3万");
    expect(formatCompactAmount(-50_000)).toBe("−5万");
    expect(formatCompactAmount(2_000)).toBe("0.2万");
  });
});

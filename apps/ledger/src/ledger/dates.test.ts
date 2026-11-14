import { describe, expect, test } from "vite-plus/test";
import {
  isYearPeriod,
  periodRange,
  shiftPeriod,
  formatMonth,
  isDate,
  isMonth,
  monthOf,
  monthRange,
  shiftMonth,
  todayInTokyo,
  monthsOfYear,
} from "./dates.ts";

describe("todayInTokyo", () => {
  test("UTC で前日でも、日本時間の日付を返す", () => {
    expect(todayInTokyo(new Date("2026-10-28T15:30:00Z"))).toBe("2026-10-29");
  });

  test("UTC と同じ日なら、その日付を返す", () => {
    expect(todayInTokyo(new Date("2026-10-28T14:59:59Z"))).toBe("2026-10-28");
  });
});

describe("monthOf", () => {
  test("日付から月を取り出す", () => {
    expect(monthOf("2026-10-28")).toBe("2026-10");
  });
});

describe("isMonth", () => {
  test.each(["2026-01", "2026-12"])("%s は月として受け付ける", (value) => {
    expect(isMonth(value)).toBe(true);
  });

  test.each(["2026-13", "2026-00", "2026-1", "2026-10-01", ""])(
    "%s は月として受け付けない",
    (value) => {
      expect(isMonth(value)).toBe(false);
    },
  );
});

describe("isDate", () => {
  test.each(["2026-10-28", "2024-02-29"])("%s は日付として受け付ける", (value) => {
    expect(isDate(value)).toBe(true);
  });

  test.each(["2026-02-30", "2025-02-29", "2026-10", "2026/10/28"])(
    "%s は日付として受け付けない",
    (value) => {
      expect(isDate(value)).toBe(false);
    },
  );
});

describe("shiftMonth", () => {
  test("年をまたいで月を進める", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  test("年をまたいで月を戻す", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("monthRange", () => {
  test("月の初日と翌月の初日を返す", () => {
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
});

describe("formatMonth", () => {
  test("年と月を日本語で書く", () => {
    expect(formatMonth("2026-03")).toBe("2026年3月");
  });
});

describe("monthsOfYear", () => {
  test("1 月から 12 月を YYYY-MM で返す", () => {
    expect(monthsOfYear(2026)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
  });
});

describe("isYearPeriod", () => {
  test("YYYY は年、YYYY-MM は月とみなす", () => {
    expect(isYearPeriod("2026")).toBe(true);
    expect(isYearPeriod("2026-11")).toBe(false);
  });
});

describe("periodRange", () => {
  test("年はその年の 1 月 1 日から翌年の 1 月 1 日まで", () => {
    expect(periodRange("2026")).toEqual({ start: "2026-01-01", end: "2027-01-01" });
  });

  test("月はその月の初日から翌月の初日まで", () => {
    expect(periodRange("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
});

describe("shiftPeriod", () => {
  test("年は年をずらす", () => {
    expect(shiftPeriod("2026", -1)).toBe("2025");
    expect(shiftPeriod("2026", 1)).toBe("2027");
  });

  test("月は年をまたいで月をずらす", () => {
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
  });
});

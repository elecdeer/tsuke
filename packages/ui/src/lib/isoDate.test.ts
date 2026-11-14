import { describe, expect, test } from "vite-plus/test";
import { formatIsoDate, parseIsoDate } from "./isoDate.ts";

describe("parseIsoDate", () => {
  test("YYYY-MM-DD をその日の 0 時の Date にする", () => {
    expect(parseIsoDate("2026-11-14")).toEqual(new Date(2026, 10, 14));
  });

  test("うるう年の 2 月 29 日を受け付ける", () => {
    expect(parseIsoDate("2028-02-29")).toEqual(new Date(2028, 1, 29));
  });

  test("実在しない日は undefined にする", () => {
    expect(parseIsoDate("2026-02-30")).toBeUndefined();
    expect(parseIsoDate("2026-13-01")).toBeUndefined();
  });

  test("形が違う文字列は undefined にする", () => {
    expect(parseIsoDate("2026-1-5")).toBeUndefined();
    expect(parseIsoDate("2026/11/14")).toBeUndefined();
    expect(parseIsoDate("")).toBeUndefined();
  });
});

describe("formatIsoDate", () => {
  test("月と日を 2 桁に揃えて YYYY-MM-DD にする", () => {
    expect(formatIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  test("parseIsoDate と往復できる", () => {
    const date = parseIsoDate("2026-12-31");
    expect(date && formatIsoDate(date)).toBe("2026-12-31");
  });
});

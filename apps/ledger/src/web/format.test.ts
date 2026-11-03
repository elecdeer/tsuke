import { describe, expect, test } from "vite-plus/test";
import {
  formatAmount,
  formatDay,
  formatDayOfMonth,
  formatPercent,
  formatSignedAmount,
  formatYen,
} from "./format.ts";

describe("formatYen", () => {
  test("3 桁ごとに区切って円を付ける", () => {
    expect(formatYen(1234567)).toBe("1,234,567円");
  });

  test("負の金額は「−」の符号を前に付ける", () => {
    expect(formatYen(-500)).toBe("−500円");
  });
});

describe("formatPercent", () => {
  test("小数第 1 位までの割合にする", () => {
    expect(formatPercent(1, 3)).toBe("33.3%");
  });

  test("全体が 0 なら空にする", () => {
    expect(formatPercent(0, 0)).toBe("");
  });
});

describe("formatDay", () => {
  test("月/日と曜日を書く", () => {
    expect(formatDay("2026-10-28")).toBe("10/28（水）");
  });
});

describe("formatAmount", () => {
  test("3 桁ごとに区切り、円の記号は付けない", () => {
    expect(formatAmount(1234567)).toBe("1,234,567");
  });

  test("負の金額にはマイナス記号を付ける", () => {
    expect(formatAmount(-500)).toBe("−500");
  });
});

describe("formatSignedAmount", () => {
  test("正の金額には + を付ける", () => {
    expect(formatSignedAmount(181184)).toBe("+181,184");
  });

  test("負の金額にはマイナス記号を付ける", () => {
    expect(formatSignedAmount(-20)).toBe("−20");
  });

  test("0 には符号を付けない", () => {
    expect(formatSignedAmount(0)).toBe("0");
  });
});

describe("formatDayOfMonth", () => {
  test("日と曜日だけを書く", () => {
    expect(formatDayOfMonth("2026-10-28")).toBe("28 水");
  });
});

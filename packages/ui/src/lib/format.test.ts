import { describe, expect, test } from "vite-plus/test";
import { formatAmount, formatYen } from "./format.ts";

describe("formatAmount", () => {
  test("3 桁ごとにカンマで区切る", () => {
    expect(formatAmount(1234567)).toBe("1,234,567");
  });

  test("負の金額は全角のマイナス記号を付ける", () => {
    expect(formatAmount(-1234)).toBe("−1,234");
  });

  test("0 は 0 にする", () => {
    expect(formatAmount(0)).toBe("0");
  });
});

describe("formatYen", () => {
  test("金額の後ろに円を付ける", () => {
    expect(formatYen(1000)).toBe("1,000円");
  });
});

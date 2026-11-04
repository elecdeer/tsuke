import { describe, expect, test } from "vite-plus/test";
import {
  advanceAmountAfterLink,
  advanceLimitOf,
  advanceSharesOf,
  advanceStatusOf,
  allocateByWeight,
  suggestAllocation,
  unreceivedAmountOf,
} from "./advance.ts";

const item = (amount: number, isAdvanceTarget = false) => ({ amount, isAdvanceTarget });

describe("advanceLimitOf", () => {
  test("印がなければ全品目の合計を返す", () => {
    expect(advanceLimitOf([item(3000), item(1000), item(-400)])).toBe(3600);
  });

  test("印があれば印の付いた品目だけの合計を返す", () => {
    expect(advanceLimitOf([item(1000), item(2000, true)])).toBe(2000);
  });
});

describe("allocateByWeight", () => {
  test("重みに比例して分け、端数は余りの大きいものに足して和を一致させる", () => {
    expect(allocateByWeight(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  test("負の重みには負の額を分ける", () => {
    expect(allocateByWeight(2400, [3000, 1000, -400])).toEqual([2000, 667, -267]);
  });

  test("重みの和が 0 以下ならすべて 0 にする", () => {
    expect(allocateByWeight(100, [0, 0])).toEqual([0, 0]);
    expect(allocateByWeight(100, [100, -100])).toEqual([0, 0]);
  });
});

describe("advanceSharesOf", () => {
  test("印がなければ全品目に比例して分ける", () => {
    expect(advanceSharesOf([item(3000), item(1000), item(-400)], 2400)).toEqual([2000, 667, -267]);
  });

  test("印があれば印の付いた品目だけに分ける", () => {
    expect(advanceSharesOf([item(1000), item(2000, true)], 1500)).toEqual([0, 1500]);
  });

  test("立替額が 0 ならすべて 0 にする", () => {
    expect(advanceSharesOf([item(1000), item(2000)], 0)).toEqual([0, 0]);
  });
});

describe("advanceStatusOf", () => {
  test.each([
    [0, 0, "none"],
    [2400, 0, "provisional"],
    [2400, 1200, "partial"],
    [2400, 2400, "settled"],
  ] as const)("立替額 %i、紐付け %i なら %s", (advanceAmount, linked, status) => {
    expect(advanceStatusOf(advanceAmount, linked)).toBe(status);
  });
});

describe("unreceivedAmountOf", () => {
  test("立替額から紐付けた額を引く。超えていれば 0 にする", () => {
    expect(unreceivedAmountOf(2400, 1200)).toBe(1200);
    expect(unreceivedAmountOf(1000, 1200)).toBe(0);
  });
});

describe("suggestAllocation", () => {
  const payment = (advanceAmount: number, advanceLimit: number, otherLinked = 0) => ({
    advanceAmount,
    advanceLimit,
    otherLinked,
  });

  test("支出 1 件なら金額をそのまま充てる", () => {
    expect(suggestAllocation(2000, [payment(2400, 3600)])).toEqual([2000]);
  });

  test("未入金の残りに比例して分ける", () => {
    expect(suggestAllocation(5500, [payment(2000, 3000), payment(3500, 4000)])).toEqual([
      2000, 3500,
    ]);
    expect(suggestAllocation(1100, [payment(2000, 3000, 1000), payment(1000, 3000)])).toEqual([
      550, 550,
    ]);
  });

  test("全支出の残りが 0 なら、紐付けられる余地に比例して分ける", () => {
    expect(suggestAllocation(3000, [payment(0, 1000), payment(0, 2000)])).toEqual([1000, 2000]);
  });

  test("余地もなければ最初の支出に寄せる", () => {
    expect(suggestAllocation(3000, [payment(0, 0), payment(0, 0)])).toEqual([3000, 0]);
  });
});

describe("advanceAmountAfterLink", () => {
  test("既定では紐付けた額の合計で上書きする", () => {
    expect(advanceAmountAfterLink(2400, 2000, false)).toBe(2000);
    expect(advanceAmountAfterLink(2400, 2600, false)).toBe(2600);
  });

  test("まだ入金があるなら立替額を変えず、合計が超えるときだけ上げる", () => {
    expect(advanceAmountAfterLink(2400, 1200, true)).toBe(2400);
    expect(advanceAmountAfterLink(1000, 1200, true)).toBe(1200);
  });
});

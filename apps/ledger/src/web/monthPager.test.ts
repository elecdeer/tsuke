import { describe, expect, test } from "vite-plus/test";
import { neighborOffset, snappedPage } from "./monthPager.ts";

describe("snappedPage", () => {
  const lefts = [0, 375, 750] as const;

  test("今の月のページで止まっていれば current を返す", () => {
    expect(snappedPage(375, lefts)).toBe("current");
  });

  test("左端まで送れば前の月、右端まで送れば次の月を返す", () => {
    expect(snappedPage(0, lefts)).toBe("prev");
    expect(snappedPage(750, lefts)).toBe("next");
  });

  test("小数のスクロール位置のずれは同じページとみなす", () => {
    expect(snappedPage(749.5, lefts)).toBe("next");
  });

  test("ページの間で止まっていれば null を返す", () => {
    expect(snappedPage(500, lefts)).toBeNull();
  });
});

describe("neighborOffset", () => {
  test("並びの上端がヘッダーの下に隠れていれば、隠れた分だけずらす", () => {
    expect(neighborOffset(-200, 56)).toBe(256);
  });

  test("並びの上端が見えていればずらさない", () => {
    expect(neighborOffset(120, 56)).toBe(0);
  });
});

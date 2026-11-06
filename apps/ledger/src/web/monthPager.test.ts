import { describe, expect, test } from "vite-plus/test";
import { fillHeight, neighborOffset, revealHeight, snappedPage } from "./monthPager.ts";

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

describe("revealHeight", () => {
  test("隣の月の下端のうち、深い方まで伸ばす", () => {
    expect(revealHeight([300, 550], 100, 900)).toBe(550);
  });

  test("画面の下端より先は伸ばさない", () => {
    expect(revealHeight([1200], 100, 900)).toBe(800);
  });

  test("箱の上端が画面の下にあれば伸ばさない", () => {
    expect(revealHeight([300], 1000, 900)).toBe(0);
  });
});

describe("fillHeight", () => {
  test("箱の上端から、下の余白を残して画面の下端までの高さを返す", () => {
    expect(fillHeight(300, 800, 100)).toBe(400);
  });

  test("箱が画面の下端より下から始まるなら伸ばさない", () => {
    expect(fillHeight(900, 800, 100)).toBe(0);
  });
});

import { describe, expect, test } from "vite-plus/test";
import {
  DEFAULT_SHEET_DETENT,
  draggedFraction,
  settledDetent,
  steppedDetent,
  toggledDetent,
} from "./sheetDetent.ts";

describe("draggedFraction", () => {
  test("上へ動かすと高くなり、下へ動かすと低くなる", () => {
    expect(draggedFraction(0.4, -100, 500)).toBeCloseTo(0.6);
    expect(draggedFraction(0.4, 100, 500)).toBeCloseTo(0.2);
  });

  test("0 より低く、1 より高くはならない", () => {
    expect(draggedFraction(0.4, 1000, 500)).toBe(0);
    expect(draggedFraction(0.4, -1000, 500)).toBe(1);
  });
});

describe("settledDetent", () => {
  test("止めたときは一番近い段に止まる", () => {
    expect(settledDetent(0.1)).toBe(0);
    expect(settledDetent(0.3)).toBe(0.4);
    expect(settledDetent(0.8)).toBe(1);
  });

  test("払ったときは動いている向きの段に止まる", () => {
    expect(settledDetent(0.45, 0.003)).toBe(1);
    expect(settledDetent(0.35, -0.003)).toBe(0);
  });
});

describe("steppedDetent", () => {
  test("隣の段へ動く", () => {
    expect(steppedDetent(0.4, 1)).toBe(1);
    expect(steppedDetent(0.4, -1)).toBe(0);
  });

  test("端より先へは動かない", () => {
    expect(steppedDetent(1, 1)).toBe(1);
    expect(steppedDetent(0, -1)).toBe(0);
  });
});

describe("toggledDetent", () => {
  test("開いていれば畳む", () => {
    expect(toggledDetent(0.4)).toBe(0);
    expect(toggledDetent(1)).toBe(0);
  });

  test("畳んでいれば既定の高さに開く", () => {
    expect(toggledDetent(0)).toBe(DEFAULT_SHEET_DETENT);
  });
});

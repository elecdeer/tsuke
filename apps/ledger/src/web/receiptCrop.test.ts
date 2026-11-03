import { describe, expect, test } from "vite-plus/test";
import { cropLayout, receiptCrop } from "./receiptCrop.ts";

describe("receiptCrop", () => {
  test("AI の範囲に余白を足して、写真に対する割合にする", () => {
    const crop = receiptCrop({ xmin: 200, ymin: 100, xmax: 700, ymax: 900 });

    expect(crop?.left).toBeCloseTo(0.15);
    expect(crop?.top).toBeCloseTo(0.05);
    expect(crop?.width).toBeCloseTo(0.6);
    expect(crop?.height).toBeCloseTo(0.9);
  });

  test("余白は写真の外にはみ出さない", () => {
    const crop = receiptCrop({ xmin: 5, ymin: 0, xmax: 600, ymax: 1000 });

    expect(crop?.left).toBe(0);
    expect(crop?.top).toBe(0);
    expect(crop?.height).toBe(1);
  });

  test("範囲がないレシートは切り取らない", () => {
    expect(receiptCrop(null)).toBeNull();
    expect(receiptCrop(undefined)).toBeNull();
  });

  test("座標が範囲の外なら、単位の取り違えと見なして切り取らない", () => {
    expect(receiptCrop({ xmin: 100, ymin: 100, xmax: 600, ymax: 1400 })).toBeNull();
    expect(receiptCrop({ xmin: -10, ymin: 100, xmax: 600, ymax: 900 })).toBeNull();
  });

  test("上下や左右が逆の範囲や、狭すぎる範囲は切り取らない", () => {
    expect(receiptCrop({ xmin: 600, ymin: 100, xmax: 200, ymax: 900 })).toBeNull();
    expect(receiptCrop({ xmin: 200, ymin: 100, xmax: 250, ymax: 900 })).toBeNull();
  });

  test("写真のほぼ全体を指す範囲は、切り取っても変わらないので切り取らない", () => {
    expect(receiptCrop({ xmin: 5, ymin: 5, xmax: 995, ymax: 995 })).toBeNull();
  });

  test("幅だけが広い範囲は切り取る", () => {
    expect(receiptCrop({ xmin: 5, ymin: 200, xmax: 995, ymax: 800 })).not.toBeNull();
  });
});

describe("cropLayout", () => {
  test("切り取る範囲が枠いっぱいになる位置と大きさを返す", () => {
    const layout = cropLayout(
      { left: 0.25, top: 0.1, width: 0.5, height: 0.8 },
      { width: 1200, height: 1600 },
    );

    expect(layout.aspectRatio).toBeCloseTo((0.5 * 1200) / (0.8 * 1600));
    expect(layout.image).toEqual({ left: "-50%", top: "-12.5%", width: "200%", height: "125%" });
  });
});

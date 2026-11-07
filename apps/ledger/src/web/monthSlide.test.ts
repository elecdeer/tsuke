import { describe, expect, test } from "vite-plus/test";
import { setMonthSlide } from "./monthSlide.ts";

describe("setMonthSlide", () => {
  test("次の月へ進むときは data-month-slide を next にする", () => {
    const root = { dataset: {} };
    setMonthSlide(root, "next");
    expect(root.dataset).toEqual({ monthSlide: "next" });
  });

  test("前の月へ戻るときは前の向きを上書きして prev にする", () => {
    const root = { dataset: { monthSlide: "next" } };
    setMonthSlide(root, "prev");
    expect(root.dataset).toEqual({ monthSlide: "prev" });
  });
});

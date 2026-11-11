import { describe, expect, test } from "vite-plus/test";
import { formatShortDate } from "./format.ts";

describe("formatShortDate", () => {
  test("月と日の先頭の 0 を落として「月/日」にする", () => {
    expect(formatShortDate("2026-05-09")).toBe("5/9");
  });
});

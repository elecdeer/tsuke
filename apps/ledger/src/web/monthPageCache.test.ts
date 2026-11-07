import { describe, expect, test } from "vite-plus/test";
import { createMonthPageCache } from "./monthPageCache.ts";

describe("createMonthPageCache", () => {
  test("覚えたデータをキーで返す", () => {
    const cache = createMonthPageCache<number>();
    cache.remember("/?month=2026-10", 1);
    expect(cache.recall("/?month=2026-10")).toBe(1);
  });

  test("覚えていないキーには undefined を返す", () => {
    const cache = createMonthPageCache<number>();
    expect(cache.recall("/?month=2026-10")).toBeUndefined();
  });

  test("同じキーで覚え直すと新しいデータに置き換わる", () => {
    const cache = createMonthPageCache<number>();
    cache.remember("a", 1);
    cache.remember("a", 2);
    expect(cache.recall("a")).toBe(2);
  });

  test("数が上限を超えると、いちばん長く覚え直していないものから忘れる", () => {
    const cache = createMonthPageCache<number>(2);
    cache.remember("a", 1);
    cache.remember("b", 2);
    cache.remember("a", 3);
    cache.remember("c", 4);
    expect(cache.recall("b")).toBeUndefined();
    expect(cache.recall("a")).toBe(3);
    expect(cache.recall("c")).toBe(4);
  });
});

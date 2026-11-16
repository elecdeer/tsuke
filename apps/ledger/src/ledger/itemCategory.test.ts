import { describe, expect, test } from "vite-plus/test";
import { storedCategoryId } from "./itemCategory.ts";

describe("storedCategoryId", () => {
  test("内訳のある品目にはカテゴリを持たせない", () => {
    expect(storedCategoryId({ categoryId: 1, genreId: 2 })).toBeNull();
  });

  test("内訳のない品目はカテゴリをそのまま持つ", () => {
    expect(storedCategoryId({ categoryId: 1, genreId: null })).toBe(1);
    expect(storedCategoryId({ categoryId: null, genreId: null })).toBeNull();
  });
});

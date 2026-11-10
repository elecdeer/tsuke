import { describe, expect, test } from "vite-plus/test";
import { moveInOrder } from "./masterEdit.ts";

describe("moveInOrder", () => {
  test("前後へ動かす", () => {
    expect(moveInOrder([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(moveInOrder([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
  });

  test("端より先へは動かさない", () => {
    expect(moveInOrder([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moveInOrder([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
  });

  test("ID がなければ null を返す", () => {
    expect(moveInOrder([1, 2, 3], 4, 1)).toBeNull();
  });
});

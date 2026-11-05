import { describe, expect, test } from "vite-plus/test";
import { titleOf } from "./transactionTitle.ts";

type Item = Parameters<typeof titleOf>[0]["items"][number];

const item: Item = {
  name: null,
  memo: null,
  genreName: null,
  categoryName: null,
};

describe("titleOf", () => {
  test("店舗があれば店舗にする", () => {
    expect(
      titleOf({ mode: "payment", placeName: "スーパー", items: [{ ...item, name: "牛乳" }] }),
    ).toBe("スーパー");
  });

  test("店舗がなければ品目名、メモ、内訳、カテゴリの順に探す", () => {
    const title = (items: Item[]) => titleOf({ mode: "payment", placeName: null, items });
    expect(
      title([
        { ...item, memo: "メモ" },
        { ...item, name: "牛乳" },
      ]),
    ).toBe("牛乳");
    expect(title([{ ...item, genreName: "食料品", categoryName: "食費" }])).toBe("食料品");
    expect(title([{ ...item, categoryName: "食費" }])).toBe("食費");
  });

  test("何もなければ種類の名前にする", () => {
    expect(titleOf({ mode: "transfer", placeName: null, items: [item] })).toBe("振替");
  });
});

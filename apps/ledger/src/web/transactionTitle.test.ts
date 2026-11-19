import { describe, expect, test } from "vite-plus/test";
import { itemsSummaryOf, titleOf } from "./transactionTitle.ts";

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

  test("空文字や空白だけの店舗・品目名は飛ばして次を探す", () => {
    expect(
      titleOf({
        mode: "payment",
        placeName: "",
        items: [
          { ...item, name: "", memo: "メモ" },
          { ...item, name: " 　" },
        ],
      }),
    ).toBe("メモ");
    expect(
      titleOf({
        mode: "payment",
        placeName: null,
        items: [{ ...item, name: "", categoryName: "食費" }],
      }),
    ).toBe("食費");
    expect(titleOf({ mode: "payment", placeName: " ", items: [{ ...item, name: "" }] })).toBe(
      "支出",
    );
  });

  test("何もなければ種類の名前にする", () => {
    expect(titleOf({ mode: "transfer", placeName: null, items: [item] })).toBe("振替");
  });
});

describe("itemsSummaryOf", () => {
  test("品目が 1 件で店舗がなければ、見出しと重なるので出さない", () => {
    expect(itemsSummaryOf({ placeName: null, items: [{ name: "牛乳", memo: null }] })).toBeNull();
  });

  test("品目が 1 件で店舗があれば、品目名かメモにする", () => {
    expect(itemsSummaryOf({ placeName: "スーパー", items: [{ name: "牛乳", memo: null }] })).toBe(
      "牛乳",
    );
    expect(itemsSummaryOf({ placeName: "スーパー", items: [{ name: "", memo: "メモ" }] })).toBe(
      "メモ",
    );
  });

  test("品目名もメモも空なら、空文字ではなく null にする", () => {
    expect(itemsSummaryOf({ placeName: "スーパー", items: [{ name: "", memo: " " }] })).toBeNull();
  });

  test("空文字の店舗は店舗がないものとして扱う", () => {
    expect(itemsSummaryOf({ placeName: "", items: [{ name: "牛乳", memo: null }] })).toBeNull();
  });

  test("品目が複数なら「最初の品目名 ほか N 件」にし、名前が空なら「品目」にする", () => {
    expect(
      itemsSummaryOf({
        placeName: null,
        items: [
          { name: "牛乳", memo: null },
          { name: "パン", memo: null },
        ],
      }),
    ).toBe("牛乳 ほか 1 件");
    expect(
      itemsSummaryOf({
        placeName: null,
        items: [
          { name: "", memo: null },
          { name: "パン", memo: null },
          { name: "卵", memo: null },
        ],
      }),
    ).toBe("品目 ほか 2 件");
  });
});

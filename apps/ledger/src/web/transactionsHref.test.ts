import { describe, expect, test } from "vite-plus/test";
import { isFiltered, transactionsHref } from "./transactionsHref.ts";

describe("transactionsHref", () => {
  test("月だけなら月だけをクエリに入れる", () => {
    expect(transactionsHref({ period: "2026-10" })).toBe("/transactions?month=2026-10");
  });

  test("年なら year をクエリに入れる", () => {
    expect(transactionsHref({ period: "2026", advance: "unreceived" })).toBe(
      "/transactions?year=2026&advance=unreceived",
    );
  });

  test("指定した条件をすべてクエリに入れる", () => {
    expect(
      transactionsHref({
        period: "2026-10",
        mode: "payment",
        accountId: 1,
        categoryId: 2,
        genreId: 3,
        placeId: 4,
      }),
    ).toBe("/transactions?month=2026-10&mode=payment&accountId=1&categoryId=2&genreId=3&placeId=4");
  });

  test("立替の絞り込みをクエリに入れる", () => {
    expect(transactionsHref({ period: "2026-10", advance: "unreceived" })).toBe(
      "/transactions?month=2026-10&advance=unreceived",
    );
  });

  test("チェーンの名前はクエリに合わせて符号化する", () => {
    expect(transactionsHref({ period: "2026-10", chain: "A&B" })).toBe(
      "/transactions?month=2026-10&chain=A%26B",
    );
  });

  test("サイドパネルで開く取引を最後に入れる", () => {
    expect(transactionsHref({ period: "2026-10", accountId: 1 }, 12)).toBe(
      "/transactions?month=2026-10&accountId=1&selected=12",
    );
  });
});

describe("isFiltered", () => {
  test("月だけなら false を返す", () => {
    expect(isFiltered({ period: "2026-10" })).toBe(false);
  });

  test("チェーンで絞り込んでいれば true を返す", () => {
    expect(isFiltered({ period: "2026-10", chain: "ローソン" })).toBe(true);
  });

  test.each([
    { mode: "payment" },
    { accountId: 1 },
    { categoryId: 2 },
    { genreId: 3 },
    { placeId: 4 },
  ] as const)("期間のほかに %o で絞り込んでいれば true を返す", (condition) => {
    expect(isFiltered({ period: "2026-10", ...condition })).toBe(true);
  });
});

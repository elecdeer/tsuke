import { describe, expect, test } from "vite-plus/test";
import { isActive, isNavigating, navHref, navPath } from "./nav.ts";

describe("isActive", () => {
  test("集計はトップのときだけ選ばれる", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/transactions", "/")).toBe(false);
  });

  test("項目の下のパスでも選ばれる", () => {
    expect(isActive("/transactions", "/transactions")).toBe(true);
    expect(isActive("/transactions/12", "/transactions")).toBe(true);
  });

  test("名前の先頭が同じだけの別のパスでは選ばれない", () => {
    expect(isActive("/transactionsx", "/transactions")).toBe(false);
  });
});

describe("navPath", () => {
  test("何もしていなければ今のパスを返す", () => {
    expect(navPath("/", { state: "idle", location: null, method: null })).toBe("/");
  });

  test("読み込み中なら移動先のパスを返す", () => {
    expect(
      navPath("/", {
        state: "loading",
        location: new URL("http://localhost/transactions?month=2026-10"),
        method: "GET",
      }),
    ).toBe("/transactions");
  });

  test("フォームの送信中は今のパスを返す", () => {
    expect(
      navPath("/transactions/12", {
        state: "submitting",
        location: new URL("http://localhost/transactions/12"),
        method: "POST",
      }),
    ).toBe("/transactions/12");
  });
});

describe("isNavigating", () => {
  test("読み込み中と送信中は true、何もしていなければ false を返す", () => {
    expect(isNavigating({ state: "idle", location: null, method: null })).toBe(false);
    expect(isNavigating({ state: "loading", location: null, method: "GET" })).toBe(true);
    expect(isNavigating({ state: "submitting", location: null, method: "POST" })).toBe(true);
  });
});

describe("navHref", () => {
  test("集計の月の表示から取引へ移るときは、その月の一覧にする", () => {
    expect(navHref("/transactions", "/", new URLSearchParams("month=2026-09"))).toBe(
      "/transactions?month=2026-09",
    );
  });

  test("取引の一覧から集計へ移るときは、その月の集計にして絞り込みは引き継がない", () => {
    expect(
      navHref("/", "/transactions", new URLSearchParams("month=2026-09&categoryId=3&selected=5")),
    ).toBe("/?month=2026-09");
  });

  test("年の集計から取引へ移るときは、その年の一覧にする", () => {
    expect(navHref("/transactions", "/", new URLSearchParams("year=2026"))).toBe(
      "/transactions?year=2026",
    );
  });

  test("年の取引の一覧から集計へ移るときは、その年の集計にする", () => {
    expect(navHref("/", "/transactions", new URLSearchParams("year=2026&advance=unreceived"))).toBe(
      "/?year=2026",
    );
  });

  test("形の正しくない年は引き継がない", () => {
    expect(navHref("/transactions", "/", new URLSearchParams("year=26"))).toBe("/transactions");
  });

  test("月を指定していない画面からは、項目の URL のまま移る", () => {
    expect(navHref("/", "/transactions", new URLSearchParams())).toBe("/");
  });

  test("形の正しくない月は引き継がない", () => {
    expect(navHref("/", "/transactions", new URLSearchParams("month=2026-13"))).toBe("/");
  });

  test("集計と取引のほかの項目には月を付けない", () => {
    expect(navHref("/accounts", "/", new URLSearchParams("month=2026-09"))).toBe("/accounts");
  });
});

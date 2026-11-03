import { describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import { listAccounts, listCategories, listChains, listPlaces } from "./masters.ts";

describe("listAccounts", () => {
  test("アーカイブしていない口座を sort、id の順で返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insert(sqlite, "INSERT INTO accounts (name, sort) VALUES ('銀行', 2)");
    insert(sqlite, "INSERT INTO accounts (name, sort) VALUES ('財布', 1)");
    insert(sqlite, "INSERT INTO accounts (name, sort, archived) VALUES ('解約した口座', 0, 1)");
    insert(sqlite, "INSERT INTO accounts (name, sort) VALUES ('カード', 2)");

    expect(await listAccounts(db)).toEqual([
      { id: 2, name: "財布" },
      { id: 1, name: "銀行" },
      { id: 4, name: "カード" },
    ]);
  });
});

describe("listCategories", () => {
  test("指定した種類のカテゴリに、アーカイブしていない内訳を並び順で付けて返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const food = insert(
      sqlite,
      "INSERT INTO categories (mode, name, sort) VALUES ('payment', '食費', 1)",
    );
    const daily = insert(
      sqlite,
      "INSERT INTO categories (mode, name, sort) VALUES ('payment', '日用品', 0)",
    );
    insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('income', '給与')");
    insert(
      sqlite,
      "INSERT INTO categories (mode, name, archived) VALUES ('payment', '使わない', 1)",
    );
    insert(sqlite, "INSERT INTO genres (category_id, name, sort) VALUES (?, 'カフェ', 1)", food);
    insert(sqlite, "INSERT INTO genres (category_id, name, sort) VALUES (?, '食料品', 0)", food);
    insert(sqlite, "INSERT INTO genres (category_id, name, archived) VALUES (?, '外食', 1)", food);

    expect(await listCategories(db, "payment")).toEqual([
      { id: daily, name: "日用品", genres: [] },
      {
        id: food,
        name: "食費",
        genres: [
          { id: 2, name: "食料品" },
          { id: 1, name: "カフェ" },
        ],
      },
    ]);
  });

  test("カテゴリがなければ空の配列を返す", async () => {
    const { db } = createTestLedgerDb();

    expect(await listCategories(db, "income")).toEqual([]);
  });
});

describe("listPlaces", () => {
  test("最後に使った日の新しい順に回数を付けて返し、使ったことのない店舗は後ろに名前順で並べる", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const supermarket = insert(sqlite, "INSERT INTO places (name) VALUES ('スーパー')");
    const pharmacy = insert(sqlite, "INSERT INTO places (name) VALUES ('薬局')");
    insert(sqlite, "INSERT INTO places (name) VALUES ('本屋')");
    insert(sqlite, "INSERT INTO places (name) VALUES ('カフェ')");
    insert(sqlite, "INSERT INTO places (name, archived) VALUES ('閉店した店', 1)");
    const addTransaction = (date: string, placeId: number) =>
      insert(
        sqlite,
        "INSERT INTO transactions (date, mode, place_id, source) VALUES (?, 'payment', ?, 'manual')",
        date,
        placeId,
      );
    addTransaction("2026-10-01", supermarket);
    addTransaction("2026-10-20", supermarket);
    addTransaction("2026-10-25", pharmacy);

    expect(await listPlaces(db)).toEqual([
      { id: pharmacy, name: "薬局", lastUsedOn: "2026-10-25", useCount: 1 },
      { id: supermarket, name: "スーパー", lastUsedOn: "2026-10-20", useCount: 2 },
      { id: 4, name: "カフェ", lastUsedOn: null, useCount: 0 },
      { id: 3, name: "本屋", lastUsedOn: null, useCount: 0 },
    ]);
  });
});

describe("listChains", () => {
  test("アーカイブしていない店舗のチェーンを、重複なく名前順で返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insert(sqlite, "INSERT INTO places (name, chain) VALUES ('ローソン新宿店', 'ローソン')");
    insert(sqlite, "INSERT INTO places (name, chain) VALUES ('ローソン渋谷店', 'ローソン')");
    insert(sqlite, "INSERT INTO places (name, chain) VALUES ('イオン幕張店', 'イオン')");
    insert(sqlite, "INSERT INTO places (name) VALUES ('喫茶店')");
    insert(
      sqlite,
      "INSERT INTO places (name, chain, archived) VALUES ('閉店', '閉じたチェーン', 1)",
    );

    expect(await listChains(db)).toEqual(["イオン", "ローソン"]);
  });
});

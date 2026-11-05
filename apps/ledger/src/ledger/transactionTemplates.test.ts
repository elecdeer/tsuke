import type { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import { updateTransaction } from "./transactionEdit.ts";
import {
  isTransactionFavorite,
  listTransactionTemplates,
  setTransactionFavorite,
} from "./transactionTemplates.ts";

/**
 * 品目を 2 件持つ支出を入れる。
 */
const insertPayment = (sqlite: DatabaseSync, date: string): number => {
  const id = insert(
    sqlite,
    "INSERT INTO transactions (date, mode, source) VALUES (?, 'payment', 'manual')",
    date,
  );
  insert(
    sqlite,
    "INSERT INTO transaction_items (transaction_id, name, amount, sort) VALUES (?, '後の品目', 200, 1)",
    id,
  );
  insert(
    sqlite,
    "INSERT INTO transaction_items (transaction_id, name, amount, sort) VALUES (?, '先の品目', 100, 0)",
    id,
  );
  return id;
};

describe("setTransactionFavorite", () => {
  test("印を付け外しできる", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insertPayment(sqlite, "2026-10-01");
    expect(await isTransactionFavorite(db, id)).toBe(false);

    expect(await setTransactionFavorite(db, id, true)).toEqual({ ok: true });
    expect(await isTransactionFavorite(db, id)).toBe(true);

    expect(await setTransactionFavorite(db, id, false)).toEqual({ ok: true });
    expect(await isTransactionFavorite(db, id)).toBe(false);
  });

  test("取引がなければ 404 を返す", async () => {
    const { db } = createTestLedgerDb();
    expect(await setTransactionFavorite(db, 999, true)).toEqual({
      ok: false,
      status: 404,
      error: "取引が見つかりません",
    });
    expect(await isTransactionFavorite(db, 999)).toBe(false);
  });

  test("取引を編集しても印は残る", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insertPayment(sqlite, "2026-10-01");
    await setTransactionFavorite(db, id, true);

    const result = await updateTransaction(db, id, {
      date: "2026-10-02",
      aggregation: "always",
      fromAccountId: null,
      toAccountId: null,
      placeName: null,
      items: [{ categoryId: null, genreId: null, name: null, memo: null, amount: 300 }],
    });

    expect(result).toEqual({ ok: true });
    expect(await isTransactionFavorite(db, id)).toBe(true);
  });
});

describe("listTransactionTemplates", () => {
  test("印のある取引だけを、日付の新しい順に品目付きで返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const older = insertPayment(sqlite, "2026-09-01");
    const unmarked = insertPayment(sqlite, "2026-09-15");
    const newer = insertPayment(sqlite, "2026-10-01");
    await setTransactionFavorite(db, older, true);
    await setTransactionFavorite(db, newer, true);

    const templates = await listTransactionTemplates(db);

    expect(templates.map((template) => template.id)).toEqual([newer, older]);
    expect(templates.map((template) => template.id)).not.toContain(unmarked);
    expect(templates[0]?.items.map((item) => item.name)).toEqual(["先の品目", "後の品目"]);
  });

  test("店舗とカテゴリの名前を含める", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const food = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
    const groceries = insert(
      sqlite,
      "INSERT INTO genres (category_id, name) VALUES (?, '食料品')",
      food,
    );
    const store = insert(sqlite, "INSERT INTO places (name) VALUES ('スーパー')");
    const id = insert(
      sqlite,
      "INSERT INTO transactions (date, mode, place_id, source) VALUES ('2026-10-01', 'payment', ?, 'manual')",
      store,
    );
    insert(
      sqlite,
      "INSERT INTO transaction_items (transaction_id, category_id, genre_id, amount) VALUES (?, ?, ?, 500)",
      id,
      food,
      groceries,
    );
    await setTransactionFavorite(db, id, true);

    expect(await listTransactionTemplates(db)).toEqual([
      {
        id,
        mode: "payment",
        aggregation: "always",
        fromAccountId: null,
        toAccountId: null,
        placeName: "スーパー",
        items: [
          {
            categoryId: food,
            genreId: groceries,
            categoryName: "食費",
            genreName: "食料品",
            name: null,
            memo: null,
            amount: 500,
          },
        ],
      },
    ]);
  });
});

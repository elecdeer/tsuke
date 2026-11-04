import type { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import { summarizeMonth } from "./summary.ts";

type Item = { categoryId: number | null; genreId: number | null; amount: number };

/**
 * 取引と品目を入れる。
 */
const insertTransaction = (
  sqlite: DatabaseSync,
  params: { date: string; mode: string; aggregation?: string; items: Item[] },
): number => {
  const id = insert(
    sqlite,
    "INSERT INTO transactions (date, mode, aggregation, source) VALUES (?, ?, ?, 'manual')",
    params.date,
    params.mode,
    params.aggregation ?? "always",
  );
  params.items.forEach((item, index) => {
    insert(
      sqlite,
      "INSERT INTO transaction_items (transaction_id, category_id, genre_id, amount, sort) VALUES (?, ?, ?, ?, ?)",
      id,
      item.categoryId,
      item.genreId,
      item.amount,
      index,
    );
  });
  return id;
};

/**
 * 食費（食料品・外食）、日用品、給与のマスタを入れる。
 */
const seedMasters = (sqlite: DatabaseSync) => {
  const food = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
  const daily = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '日用品')");
  const salary = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('income', '給与')");
  const groceries = insert(
    sqlite,
    "INSERT INTO genres (category_id, name) VALUES (?, '食料品')",
    food,
  );
  const eatingOut = insert(
    sqlite,
    "INSERT INTO genres (category_id, name) VALUES (?, '外食')",
    food,
  );
  const supplies = insert(
    sqlite,
    "INSERT INTO genres (category_id, name) VALUES (?, '消耗品')",
    daily,
  );
  return { food, daily, salary, groceries, eatingOut, supplies };
};

describe("summarizeMonth", () => {
  test("支出をカテゴリと内訳ごとに合計し、金額の多い順に並べる", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    insertTransaction(sqlite, {
      date: "2026-10-01",
      mode: "payment",
      items: [
        { categoryId: m.food, genreId: m.groceries, amount: 1200 },
        { categoryId: m.daily, genreId: m.supplies, amount: 300 },
      ],
    });
    insertTransaction(sqlite, {
      date: "2026-10-31",
      mode: "payment",
      items: [{ categoryId: m.food, genreId: m.eatingOut, amount: 2000 }],
    });
    insertTransaction(sqlite, {
      date: "2026-10-15",
      mode: "payment",
      items: [{ categoryId: m.food, genreId: m.groceries, amount: 500 }],
    });

    const summary = await summarizeMonth(db, "2026-10");

    expect(summary.payment).toEqual({
      total: 4000,
      categories: [
        {
          categoryId: m.food,
          name: "食費",
          amount: 3700,
          genres: [
            { genreId: m.eatingOut, name: "外食", amount: 2000 },
            { genreId: m.groceries, name: "食料品", amount: 1700 },
          ],
        },
        {
          categoryId: m.daily,
          name: "日用品",
          amount: 300,
          genres: [{ genreId: m.supplies, name: "消耗品", amount: 300 }],
        },
      ],
    });
  });

  test("値引きの品目は差し引いて合計する", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    insertTransaction(sqlite, {
      date: "2026-10-10",
      mode: "payment",
      items: [
        { categoryId: m.food, genreId: m.groceries, amount: 1000 },
        { categoryId: m.food, genreId: m.groceries, amount: -100 },
      ],
    });

    const summary = await summarizeMonth(db, "2026-10");

    expect(summary.payment.total).toBe(900);
  });

  test("収入は支出と分けて合計し、内訳のない品目は「内訳なし」にまとめる", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    insertTransaction(sqlite, {
      date: "2026-10-25",
      mode: "income",
      items: [{ categoryId: m.salary, genreId: null, amount: 300000 }],
    });

    const summary = await summarizeMonth(db, "2026-10");

    expect(summary.income).toEqual({
      total: 300000,
      categories: [
        {
          categoryId: m.salary,
          name: "給与",
          amount: 300000,
          genres: [{ genreId: null, name: "内訳なし", amount: 300000 }],
        },
      ],
    });
    expect(summary.payment).toEqual({ total: 0, categories: [] });
  });

  test("カテゴリのない品目は「未分類」にまとめる", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insertTransaction(sqlite, {
      date: "2026-10-03",
      mode: "payment",
      items: [{ categoryId: null, genreId: null, amount: 800 }],
    });

    const summary = await summarizeMonth(db, "2026-10");

    expect(summary.payment.categories).toEqual([
      {
        categoryId: null,
        name: "未分類",
        amount: 800,
        genres: [{ genreId: null, name: "内訳なし", amount: 800 }],
      },
    ]);
  });

  test("ほかの月、振替・残高調整、集計に含めない取引は入れない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const item = { categoryId: m.food, genreId: m.groceries, amount: 1000 };
    insertTransaction(sqlite, { date: "2026-09-30", mode: "payment", items: [item] });
    insertTransaction(sqlite, { date: "2026-11-01", mode: "payment", items: [item] });
    insertTransaction(sqlite, {
      date: "2026-10-10",
      mode: "payment",
      aggregation: "never",
      items: [item],
    });
    insertTransaction(sqlite, {
      date: "2026-10-10",
      mode: "payment",
      aggregation: "yearly_only",
      items: [item],
    });
    insertTransaction(sqlite, {
      date: "2026-10-10",
      mode: "transfer",
      items: [{ categoryId: null, genreId: null, amount: 5000 }],
    });
    insertTransaction(sqlite, {
      date: "2026-10-10",
      mode: "adjustment",
      items: [{ categoryId: null, genreId: null, amount: 5000 }],
    });

    const summary = await summarizeMonth(db, "2026-10");

    expect(summary).toEqual({
      payment: { total: 0, categories: [] },
      income: { total: 0, categories: [] },
    });
  });
});

describe("summarizeMonth の立替", () => {
  /** 立替額を書き込む */
  const setAdvance = (sqlite: DatabaseSync, id: number, amount: number) =>
    sqlite.prepare("UPDATE transactions SET advance_amount = ? WHERE id = ?").run(amount, id);

  test("品目の金額に比例して立替額を引く。値引きの品目からも引く", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertTransaction(sqlite, {
      date: "2026-10-01",
      mode: "payment",
      items: [
        { categoryId: m.food, genreId: m.eatingOut, amount: 3000 },
        { categoryId: m.food, genreId: m.groceries, amount: 1000 },
        { categoryId: m.daily, genreId: m.supplies, amount: -400 },
      ],
    });
    setAdvance(sqlite, id, 2400);

    const { payment } = await summarizeMonth(db, "2026-10");

    expect(payment.total).toBe(1200);
    const food = payment.categories.find((category) => category.categoryId === m.food);
    expect(food?.genres).toEqual([
      { genreId: m.eatingOut, name: "外食", amount: 1000 },
      { genreId: m.groceries, name: "食料品", amount: 333 },
    ]);
    expect(payment.categories.find((category) => category.categoryId === m.daily)?.amount).toBe(
      -133,
    );
  });

  test("印があれば印の付いた品目からだけ引き、負担額が 0 になった内訳とカテゴリは出さない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertTransaction(sqlite, {
      date: "2026-10-01",
      mode: "payment",
      items: [
        { categoryId: m.food, genreId: m.groceries, amount: 1000 },
        { categoryId: m.daily, genreId: m.supplies, amount: 2000 },
      ],
    });
    sqlite
      .prepare("UPDATE transaction_items SET is_advance_target = 1 WHERE genre_id = ?")
      .run(m.supplies);
    setAdvance(sqlite, id, 2000);

    const { payment } = await summarizeMonth(db, "2026-10");

    expect(payment.total).toBe(1000);
    expect(payment.categories.map((category) => category.categoryId)).toEqual([m.food]);
  });

  test("集計に含めない取引は立替額に関係なく入れない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertTransaction(sqlite, {
      date: "2026-10-01",
      mode: "payment",
      aggregation: "never",
      items: [{ categoryId: m.food, genreId: m.groceries, amount: 1000 }],
    });
    setAdvance(sqlite, id, 500);
    insertTransaction(sqlite, {
      date: "2026-10-02",
      mode: "payment",
      items: [{ categoryId: m.food, genreId: m.groceries, amount: 200 }],
    });

    expect((await summarizeMonth(db, "2026-10")).payment.total).toBe(200);
  });
});

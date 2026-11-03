import type { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import { listTransactions } from "./transactions.ts";

/**
 * 口座 2 つ、食費（食料品・外食）と日用品（消耗品）、店舗 1 つを入れる。
 */
const seedMasters = (sqlite: DatabaseSync) => {
  const wallet = insert(sqlite, "INSERT INTO accounts (name) VALUES ('財布')");
  const bank = insert(sqlite, "INSERT INTO accounts (name) VALUES ('銀行')");
  const food = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
  const daily = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '日用品')");
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
  const store = insert(sqlite, "INSERT INTO places (name) VALUES ('スーパー')");
  return { wallet, bank, food, daily, groceries, eatingOut, supplies, store };
};

/**
 * 取引を入れる。口座・店舗は省略できる。
 */
const insertTransaction = (
  sqlite: DatabaseSync,
  params: {
    date: string;
    mode: string;
    from?: number;
    to?: number;
    placeId?: number;
    aggregation?: string;
  },
): number =>
  insert(
    sqlite,
    "INSERT INTO transactions (date, mode, from_account_id, to_account_id, place_id, aggregation, source) VALUES (?, ?, ?, ?, ?, ?, 'manual')",
    params.date,
    params.mode,
    params.from ?? null,
    params.to ?? null,
    params.placeId ?? null,
    params.aggregation ?? "always",
  );

/**
 * 品目を入れる。
 */
const insertItem = (
  sqlite: DatabaseSync,
  transactionId: number,
  item: {
    categoryId?: number;
    genreId?: number;
    name?: string;
    memo?: string;
    amount: number;
    sort?: number;
  },
): number =>
  insert(
    sqlite,
    "INSERT INTO transaction_items (transaction_id, category_id, genre_id, name, memo, amount, sort) VALUES (?, ?, ?, ?, ?, ?, ?)",
    transactionId,
    item.categoryId ?? null,
    item.genreId ?? null,
    item.name ?? null,
    item.memo ?? null,
    item.amount,
    item.sort ?? 0,
  );

describe("listTransactions", () => {
  test("月の取引を日付と ID の新しい順に、品目と合計を付けて返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const early = insertTransaction(sqlite, {
      date: "2026-10-01",
      mode: "payment",
      from: m.wallet,
      placeId: m.store,
    });
    insertItem(sqlite, early, {
      categoryId: m.food,
      genreId: m.groceries,
      name: "値引き",
      amount: -50,
      sort: 1,
    });
    insertItem(sqlite, early, {
      categoryId: m.food,
      genreId: m.groceries,
      name: "牛乳",
      memo: "2 本",
      amount: 400,
      sort: 0,
    });
    const transfer = insertTransaction(sqlite, {
      date: "2026-10-20",
      mode: "transfer",
      from: m.bank,
      to: m.wallet,
    });
    insertItem(sqlite, transfer, { amount: 10000 });
    const sameDay = insertTransaction(sqlite, {
      date: "2026-10-20",
      mode: "payment",
      from: m.wallet,
      aggregation: "never",
    });
    insertItem(sqlite, sameDay, { categoryId: m.food, genreId: m.eatingOut, amount: 900 });

    expect(await listTransactions(db, { month: "2026-10" })).toEqual([
      {
        id: sameDay,
        date: "2026-10-20",
        mode: "payment",
        aggregation: "never",
        fromAccountName: "財布",
        toAccountName: null,
        placeId: null,
        placeName: null,
        items: [{ name: null, memo: null, categoryName: "食費", genreName: "外食", amount: 900 }],
        total: 900,
      },
      {
        id: transfer,
        date: "2026-10-20",
        mode: "transfer",
        aggregation: "always",
        fromAccountName: "銀行",
        toAccountName: "財布",
        placeId: null,
        placeName: null,
        items: [{ name: null, memo: null, categoryName: null, genreName: null, amount: 10000 }],
        total: 10000,
      },
      {
        id: early,
        date: "2026-10-01",
        mode: "payment",
        aggregation: "always",
        fromAccountName: "財布",
        toAccountName: null,
        placeId: m.store,
        placeName: "スーパー",
        items: [
          { name: "牛乳", memo: "2 本", categoryName: "食費", genreName: "食料品", amount: 400 },
          { name: "値引き", memo: null, categoryName: "食費", genreName: "食料品", amount: -50 },
        ],
        total: 350,
      },
    ]);
  });

  test("ほかの月の取引は返さない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insertItem(sqlite, insertTransaction(sqlite, { date: "2026-09-30", mode: "payment" }), {
      amount: 100,
    });
    insertItem(sqlite, insertTransaction(sqlite, { date: "2026-11-01", mode: "payment" }), {
      amount: 100,
    });

    expect(await listTransactions(db, { month: "2026-10" })).toEqual([]);
  });

  test("種類で絞り込む", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const payment = insertTransaction(sqlite, { date: "2026-10-01", mode: "payment" });
    insertItem(sqlite, payment, { amount: 100 });
    insertItem(sqlite, insertTransaction(sqlite, { date: "2026-10-01", mode: "income" }), {
      amount: 100,
    });

    const listed = await listTransactions(db, { month: "2026-10", mode: "payment" });

    expect(listed.map((transaction) => transaction.id)).toEqual([payment]);
  });

  test("口座で絞り込むと、支払元か入金先がその口座の取引を返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const paid = insertTransaction(sqlite, { date: "2026-10-01", mode: "payment", from: m.wallet });
    const received = insertTransaction(sqlite, {
      date: "2026-10-02",
      mode: "income",
      to: m.wallet,
    });
    const other = insertTransaction(sqlite, { date: "2026-10-03", mode: "payment", from: m.bank });
    for (const id of [paid, received, other]) insertItem(sqlite, id, { amount: 100 });

    const listed = await listTransactions(db, { month: "2026-10", accountId: m.wallet });

    expect(listed.map((transaction) => transaction.id)).toEqual([received, paid]);
  });

  test("店舗で絞り込む", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const atStore = insertTransaction(sqlite, {
      date: "2026-10-01",
      mode: "payment",
      placeId: m.store,
    });
    const elsewhere = insertTransaction(sqlite, { date: "2026-10-02", mode: "payment" });
    for (const id of [atStore, elsewhere]) insertItem(sqlite, id, { amount: 100 });

    const listed = await listTransactions(db, { month: "2026-10", placeId: m.store });

    expect(listed.map((transaction) => transaction.id)).toEqual([atStore]);
  });

  test("チェーンで絞り込むと、そのチェーンの支店の取引を返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const shinjuku = insert(
      sqlite,
      "INSERT INTO places (name, chain) VALUES ('新宿店', 'ローソン')",
    );
    const shibuya = insert(
      sqlite,
      "INSERT INTO places (name, chain) VALUES ('渋谷店', 'ローソン')",
    );
    const inChain = [shinjuku, shibuya].map((placeId, index) =>
      insertTransaction(sqlite, { date: `2026-10-0${index + 1}`, mode: "payment", placeId }),
    );
    const elsewhere = insertTransaction(sqlite, {
      date: "2026-10-03",
      mode: "payment",
      placeId: m.store,
    });
    for (const id of [...inChain, elsewhere]) insertItem(sqlite, id, { amount: 100 });

    const listed = await listTransactions(db, { month: "2026-10", chain: "ローソン" });

    expect(listed.map((transaction) => transaction.id).sort((a, b) => a - b)).toEqual(inChain);
  });

  test("内訳で絞り込むと、その内訳の品目を含む取引を、ほかの品目も付けて返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const mixed = insertTransaction(sqlite, { date: "2026-10-01", mode: "payment" });
    insertItem(sqlite, mixed, { categoryId: m.food, genreId: m.groceries, amount: 300, sort: 0 });
    insertItem(sqlite, mixed, { categoryId: m.daily, genreId: m.supplies, amount: 200, sort: 1 });
    const other = insertTransaction(sqlite, { date: "2026-10-02", mode: "payment" });
    insertItem(sqlite, other, { categoryId: m.food, genreId: m.eatingOut, amount: 900 });

    const listed = await listTransactions(db, { month: "2026-10", genreId: m.supplies });

    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(mixed);
    expect(listed[0]?.items.map((item) => item.genreName)).toEqual(["食料品", "消耗品"]);
    expect(listed[0]?.total).toBe(500);
  });

  test("カテゴリで絞り込むと、そのカテゴリの品目を含む取引を返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const groceries = insertTransaction(sqlite, { date: "2026-10-01", mode: "payment" });
    insertItem(sqlite, groceries, { categoryId: m.food, genreId: m.groceries, amount: 300 });
    const eatingOut = insertTransaction(sqlite, { date: "2026-10-02", mode: "payment" });
    insertItem(sqlite, eatingOut, { categoryId: m.food, genreId: m.eatingOut, amount: 900 });
    const daily = insertTransaction(sqlite, { date: "2026-10-03", mode: "payment" });
    insertItem(sqlite, daily, { categoryId: m.daily, genreId: m.supplies, amount: 200 });

    const listed = await listTransactions(db, { month: "2026-10", categoryId: m.food });

    expect(listed.map((transaction) => transaction.id)).toEqual([eatingOut, groceries]);
  });
});

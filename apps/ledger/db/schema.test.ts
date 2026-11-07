import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { applyMigrations, createDb, insert, migrationFiles } from "./testing.ts";

describe("台帳のスキーマ", () => {
  let db: DatabaseSync;
  let foodId: number;
  let groceryId: number;
  let salaryId: number;
  let walletId: number;

  beforeEach(() => {
    db = createDb();
    applyMigrations(db);
    foodId = insert(db, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
    groceryId = insert(db, "INSERT INTO genres (category_id, name) VALUES (?, '食料品')", foodId);
    salaryId = insert(db, "INSERT INTO categories (mode, name) VALUES ('income', '給与')");
    walletId = insert(db, "INSERT INTO accounts (name) VALUES ('財布')");
  });

  const insertPayment = (): number =>
    insert(
      db,
      "INSERT INTO transactions (date, mode, from_account_id, source) VALUES ('2026-10-27', 'payment', ?, 'manual')",
      walletId,
    );

  test("支出と収入には同じ名前のカテゴリを作れる", () => {
    expect(() =>
      insert(db, "INSERT INTO categories (mode, name) VALUES ('income', '食費')"),
    ).not.toThrow();
  });

  test("同じ種類に同じ名前のカテゴリは作れない", () => {
    expect(() =>
      insert(db, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')"),
    ).toThrow(/UNIQUE/);
  });

  test("品目は内訳とその親カテゴリを持てる", () => {
    const txId = insertPayment();

    expect(() =>
      insert(
        db,
        "INSERT INTO transaction_items (transaction_id, category_id, genre_id, amount) VALUES (?, ?, ?, 500)",
        txId,
        foodId,
        groceryId,
      ),
    ).not.toThrow();
  });

  test("品目の内訳と親カテゴリが食い違っていたら入れられない", () => {
    const txId = insertPayment();

    expect(() =>
      insert(
        db,
        "INSERT INTO transaction_items (transaction_id, category_id, genre_id, amount) VALUES (?, ?, ?, 500)",
        txId,
        salaryId,
        groceryId,
      ),
    ).toThrow(/FOREIGN KEY/);
  });

  test("内訳のない品目はカテゴリだけを持てる", () => {
    const txId = insert(
      db,
      "INSERT INTO transactions (date, mode, to_account_id, source) VALUES ('2026-10-25', 'income', ?, 'zaim_csv')",
      walletId,
    );

    expect(() =>
      insert(
        db,
        "INSERT INTO transaction_items (transaction_id, category_id, amount) VALUES (?, ?, 300000)",
        txId,
        salaryId,
      ),
    ).not.toThrow();
  });

  test("値引きは負の金額の品目として入れられる", () => {
    const txId = insertPayment();
    insert(db, "INSERT INTO transaction_items (transaction_id, amount) VALUES (?, 500)", txId);
    insert(db, "INSERT INTO transaction_items (transaction_id, amount) VALUES (?, -50)", txId);

    const { total } = db
      .prepare("SELECT SUM(amount) AS total FROM transaction_items WHERE transaction_id = ?")
      .get(txId) as { total: number };
    expect(total).toBe(450);
  });

  test("取引を消すと品目も消える", () => {
    const txId = insertPayment();
    insert(db, "INSERT INTO transaction_items (transaction_id, amount) VALUES (?, 500)", txId);

    db.prepare("DELETE FROM transactions WHERE id = ?").run(txId);

    const { count } = db.prepare("SELECT COUNT(*) AS count FROM transaction_items").get() as {
      count: number;
    };
    expect(count).toBe(0);
  });

  test("取引から参照されている口座は消せない", () => {
    insertPayment();

    expect(() => db.prepare("DELETE FROM accounts WHERE id = ?").run(walletId)).toThrow(
      /FOREIGN KEY/,
    );
  });

  test("取引から参照されている店舗は消せない", () => {
    const placeId = insert(db, "INSERT INTO places (name) VALUES ('スーパー')");
    insert(
      db,
      "INSERT INTO transactions (date, mode, place_id, source) VALUES ('2026-10-27', 'payment', ?, 'manual')",
      placeId,
    );

    expect(() => db.prepare("DELETE FROM places WHERE id = ?").run(placeId)).toThrow(/FOREIGN KEY/);
  });

  test("作成・更新日時は ISO 8601 の UTC で入る", () => {
    const row = db
      .prepare("SELECT created_at, updated_at FROM accounts WHERE id = ?")
      .get(walletId) as {
      created_at: string;
      updated_at: string;
    };

    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(row.updated_at).toBe(row.created_at);
  });
});

describe("マイグレーション", () => {
  test("既存の履歴 CSV の取り込みの口座を、支出・収入の取引から埋める", () => {
    const db = createDb();
    const files = migrationFiles();
    const target = files.findIndex((name) => name.endsWith("_flippant_menace.sql"));
    applyMigrations(db, files.slice(0, target));
    const bank = insert(db, "INSERT INTO accounts (name) VALUES ('A銀行')");
    const card = insert(db, "INSERT INTO accounts (name) VALUES ('Bカード')");
    const addBatch = (source: string) =>
      insert(
        db,
        "INSERT INTO import_batches (source, file_name, row_count) VALUES (?, 'a.csv', 1)",
        source,
      );
    const addTransaction = (batch: number, mode: string, from: number | null, to: number | null) =>
      insert(
        db,
        "INSERT INTO transactions (date, mode, from_account_id, to_account_id, source, import_batch_id) VALUES ('2026-05-01', ?, ?, ?, 'statement_csv', ?)",
        mode,
        from,
        to,
        batch,
      );
    const paymentBatch = addBatch("statement_csv");
    addTransaction(paymentBatch, "transfer", card, bank);
    addTransaction(paymentBatch, "payment", card, null);
    const incomeBatch = addBatch("statement_csv");
    addTransaction(incomeBatch, "income", null, bank);
    const transferOnlyBatch = addBatch("statement_csv");
    addTransaction(transferOnlyBatch, "transfer", bank, card);
    addBatch("zaim_csv");

    applyMigrations(db, files.slice(target));

    expect(db.prepare("SELECT account_id FROM import_batches ORDER BY id").all()).toEqual([
      { account_id: card },
      { account_id: bank },
      { account_id: null },
      { account_id: null },
    ]);
  });

  test("口座に日時の列を足しても既存の口座が残る", () => {
    const db = createDb();
    const [first, ...rest] = migrationFiles();
    applyMigrations(db, first === undefined ? [] : [first]);
    insert(db, "INSERT INTO accounts (name, sort) VALUES ('財布', 2)");

    applyMigrations(db, rest);

    expect(db.prepare("SELECT id, name, sort, archived FROM accounts").all()).toEqual([
      { id: 1, name: "財布", sort: 2, archived: 0 },
    ]);
  });
});

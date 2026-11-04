import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import type { LedgerDb } from "../db.ts";
import { registerStatementCsv, type StatementCsvRegisterInput } from "./statementCsv.ts";
import { findRegisteredTransactions } from "./statements.ts";

describe("履歴 CSV の登録", () => {
  let db: LedgerDb;
  let sqlite: DatabaseSync;
  let bank: number;
  let card: number;
  let genre: number;
  let paymentCategory: number;
  let incomeCategory: number;

  beforeEach(() => {
    ({ db, sqlite } = createTestLedgerDb());
    bank = insert(sqlite, "INSERT INTO accounts (name) VALUES ('A銀行')");
    card = insert(sqlite, "INSERT INTO accounts (name) VALUES ('Bカード')");
    paymentCategory = insert(
      sqlite,
      "INSERT INTO categories (mode, name) VALUES ('payment', '食費')",
    );
    genre = insert(
      sqlite,
      "INSERT INTO genres (category_id, name) VALUES (?, '食料品')",
      paymentCategory,
    );
    incomeCategory = insert(
      sqlite,
      "INSERT INTO categories (mode, name) VALUES ('income', '給与')",
    );
  });

  const register = (rows: StatementCsvRegisterInput["rows"]) =>
    registerStatementCsv(db, { fileName: "a.csv", accountId: bank, rows });

  const transactionRows = () =>
    sqlite
      .prepare(
        `SELECT t.date, t.mode, t.from_account_id AS fromId, t.to_account_id AS toId, t.source,
                p.name AS place, i.category_id AS categoryId, i.genre_id AS genreId, i.name, i.amount,
                b.source AS batchSource, b.file_name AS fileName
         FROM transactions t
         JOIN transaction_items i ON i.transaction_id = t.id
         JOIN import_batches b ON b.id = t.import_batch_id
         LEFT JOIN places p ON p.id = t.place_id
         ORDER BY t.id`,
      )
      .all();

  test("支出・返金・収入・振替を、種類ごとの口座の向きで登録する", async () => {
    const result = await register([
      {
        mode: "payment",
        date: "2026-05-10",
        amount: 1000,
        placeName: "スーパーA",
        name: null,
        genreId: genre,
      },
      {
        mode: "payment",
        date: "2026-05-11",
        amount: -300,
        placeName: null,
        name: "ﾍﾝﾋﾟﾝ",
        genreId: genre,
      },
      {
        mode: "income",
        date: "2026-05-25",
        amount: 200000,
        placeName: null,
        name: "ｷﾕｳﾖ",
        categoryId: incomeCategory,
      },
      {
        mode: "transfer",
        date: "2026-05-27",
        amount: 50000,
        name: "ｶ-ﾄﾞ",
        direction: "out",
        counterAccountId: card,
      },
      {
        mode: "transfer",
        date: "2026-05-28",
        amount: 1000,
        name: "ﾓﾄﾞｼ",
        direction: "in",
        counterAccountId: card,
      },
    ]);

    expect(result).toEqual({ ok: true, count: 5 });
    const common = { source: "statement_csv", batchSource: "statement_csv", fileName: "a.csv" };
    expect(transactionRows()).toMatchObject([
      {
        ...common,
        mode: "payment",
        fromId: bank,
        toId: null,
        place: "スーパーA",
        categoryId: paymentCategory,
        genreId: genre,
        amount: 1000,
      },
      { ...common, mode: "payment", fromId: bank, name: "ﾍﾝﾋﾟﾝ", amount: -300 },
      {
        ...common,
        mode: "income",
        fromId: null,
        toId: bank,
        categoryId: incomeCategory,
        genreId: null,
        amount: 200000,
      },
      { ...common, mode: "transfer", fromId: bank, toId: card, categoryId: null, amount: 50000 },
      { ...common, mode: "transfer", fromId: card, toId: bank, amount: 1000 },
    ]);
  });

  test("知らない内訳があれば何も登録しない", async () => {
    const result = await register([
      {
        mode: "payment",
        date: "2026-05-10",
        amount: 1000,
        placeName: "新しい店",
        name: null,
        genreId: genre + 999,
      },
    ]);

    expect(result).toMatchObject({ ok: false });
    expect(transactionRows()).toEqual([]);
    expect(sqlite.prepare("SELECT * FROM places").all()).toEqual([]);
  });

  test.each([
    ["取り込む口座自身", () => bank],
    ["知らない口座", () => 9999],
  ])("振替の相手が%sなら登録しない", async (_label, counter) => {
    const result = await register([
      {
        mode: "transfer",
        date: "2026-05-10",
        amount: 1000,
        name: null,
        direction: "out",
        counterAccountId: counter(),
      },
    ]);

    expect(result).toMatchObject({ ok: false });
    expect(transactionRows()).toEqual([]);
  });

  test("支出のカテゴリを収入として指定できない", async () => {
    expect(
      await register([
        {
          mode: "income",
          date: "2026-05-10",
          amount: 1000,
          placeName: null,
          name: null,
          categoryId: paymentCategory,
        },
      ]),
    ).toMatchObject({ ok: false });
  });

  test("同じ種類の登録済みの取引を割り当て、種類が違えば割り当てない", async () => {
    await register([
      {
        mode: "payment",
        date: "2026-05-10",
        amount: 1000,
        placeName: null,
        name: null,
        genreId: genre,
      },
      {
        mode: "transfer",
        date: "2026-05-27",
        amount: 50000,
        name: null,
        direction: "out",
        counterAccountId: card,
      },
    ]);

    const matches = await findRegisteredTransactions(db, [
      { date: "2026-05-11", mode: "payment", amount: 1000 },
      { date: "2026-05-27", mode: "transfer", amount: 50000 },
      { date: "2026-05-27", mode: "income", amount: 50000 },
    ]);

    expect(matches.map((match) => match?.amount ?? null)).toEqual([1000, 50000, null]);
  });
});

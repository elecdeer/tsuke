import type { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import { applyMigrations, createDb, insert } from "../../db/testing.ts";
import {
  buildImportSql,
  buildImportStatements,
  chunkStatements,
  groupIntoTransactions,
  parseZaimRecords,
  summarizeRows,
  SUMMARY_SQL,
  type ZaimCsvRecord,
  type ZaimRow,
} from "./zaimCsv.ts";

/**
 * 「なし」を `-` で埋めた CSV の 1 行を作る。
 */
const record = (overrides: Partial<ZaimCsvRecord>): ZaimCsvRecord => ({
  日付: "2026-10-01",
  方法: "payment",
  カテゴリ: "食費",
  カテゴリの内訳: "食料品",
  支払元: "財布",
  入金先: "-",
  品目: "-",
  メモ: "-",
  お店: "-",
  通貨: "JPY",
  収入: "0",
  支出: "0",
  振替: "0",
  残高調整: "0",
  通貨変換前の金額: "0",
  集計の設定: "常に集計に含める",
  ...overrides,
});

/** 検証に通るはずの行を正規化する */
const parseOk = (records: ZaimCsvRecord[]): ZaimRow[] => {
  const result = parseZaimRecords(records);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.rows;
};

/** 取り込みの SQL をマイグレーション済みの DB に流す */
const runImport = (db: DatabaseSync, records: ZaimCsvRecord[], fileName = "zaim.csv"): void => {
  db.exec(
    buildImportSql(groupIntoTransactions(parseOk(records)), { fileName, rowCount: records.length }),
  );
};

const createImportedDb = (records: ZaimCsvRecord[]): DatabaseSync => {
  const db = createDb();
  applyMigrations(db);
  runImport(db, records);
  return db;
};

describe("parseZaimRecords", () => {
  test("方法に応じた列の金額を取り出し、`-` を null にする", () => {
    const [row] = parseOk([record({ 支出: "500", お店: "スーパー", 品目: "牛乳" })]);

    expect(row).toEqual({
      line: 2,
      date: "2026-10-01",
      mode: "payment",
      category: { mode: "payment", name: "食費", genre: "食料品" },
      fromAccount: "財布",
      toAccount: null,
      itemName: "牛乳",
      memo: null,
      place: "スーパー",
      amount: 500,
      aggregation: "always",
    });
  });

  test("値引きの負の金額と、空の金額（0 円）を受け入れる", () => {
    const rows = parseOk([record({ 支出: "-50" }), record({ 支出: "" })]);

    expect(rows.map((row) => row.amount)).toEqual([-50, 0]);
  });

  test("収入はカテゴリだけを持ち、カテゴリがなくてもよい", () => {
    const rows = parseOk([
      record({
        方法: "income",
        カテゴリ: "給与",
        カテゴリの内訳: "-",
        支払元: "-",
        入金先: "銀行",
        収入: "300000",
      }),
      record({
        方法: "income",
        カテゴリ: "-",
        カテゴリの内訳: "-",
        支払元: "-",
        入金先: "銀行",
        収入: "100",
      }),
    ]);

    expect(rows.map((row) => row.category)).toEqual([
      { mode: "income", name: "給与", genre: null },
      null,
    ]);
  });

  test("振替のカテゴリは支出のカテゴリとして扱う", () => {
    const [row] = parseOk([
      record({ 方法: "transfer", 支払元: "銀行", 入金先: "財布", 振替: "10000" }),
    ]);

    expect(row?.category).toEqual({ mode: "payment", name: "食費", genre: "食料品" });
  });

  test("残高調整は増やすなら入金先、減らすなら支払元に口座が入る", () => {
    const rows = parseOk([
      record({
        方法: "balance",
        カテゴリ: "-",
        カテゴリの内訳: "-",
        支払元: "-",
        入金先: "財布",
        残高調整: "120",
      }),
      record({
        方法: "balance",
        カテゴリ: "-",
        カテゴリの内訳: "-",
        支払元: "財布",
        入金先: "-",
        残高調整: "30",
      }),
    ]);

    expect(rows.map((row) => [row.mode, row.fromAccount, row.toAccount, row.amount])).toEqual([
      ["adjustment", null, "財布", 120],
      ["adjustment", "財布", null, 30],
    ]);
  });

  test("集計の設定を 3 値に対応させる", () => {
    const rows = parseOk([
      record({ 集計の設定: "常に集計に含める" }),
      record({ 集計の設定: "集計に含めない" }),
      record({ 集計の設定: "年の集計にのみ含める" }),
    ]);

    expect(rows.map((row) => row.aggregation)).toEqual(["always", "never", "yearly_only"]);
  });

  test("マスタの名前は前後の空白を取り除き、品目とメモはそのまま残す", () => {
    const [row] = parseOk([
      record({ 支払元: " 財布 ", お店: "スーパー ", 品目: " 牛乳", メモ: "特売 " }),
    ]);

    expect([row?.fromAccount, row?.place, row?.itemName, row?.memo]).toEqual([
      "財布",
      "スーパー",
      " 牛乳",
      "特売 ",
    ]);
  });

  test("カテゴリが `-` で内訳だけある行は、内訳がただ 1 つのカテゴリにしか出てこなければそのカテゴリを補う", () => {
    const rows = parseOk([
      record({ カテゴリ: "交通", カテゴリの内訳: "ガソリン" }),
      record({ カテゴリ: "-", カテゴリの内訳: "ガソリン" }),
    ]);

    expect(rows[1]?.category).toEqual({ mode: "payment", name: "交通", genre: "ガソリン" });
  });

  test("内訳が複数のカテゴリに出てくるなら、親カテゴリを決められずエラーにする", () => {
    const result = parseZaimRecords([
      record({ カテゴリ: "食費", カテゴリの内訳: "その他" }),
      record({ カテゴリ: "日用品", カテゴリの内訳: "その他" }),
      record({ カテゴリ: "-", カテゴリの内訳: "その他" }),
    ]);

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          line: 4,
          message: "カテゴリのない行に内訳が入っていて、内訳から親カテゴリを決められません",
        },
      ],
    });
  });

  test("想定外の行は、行番号と理由を返して 1 行も取り込まない", () => {
    const result = parseZaimRecords([
      record({ 支出: "500" }),
      record({ 通貨: "USD" }),
      record({ 方法: "transfer", 入金先: "-", 振替: "100" }),
      record({ 支出: "500", 収入: "100" }),
      record({ 日付: "2026/10/01" }),
    ]);

    expect(result).toEqual({
      ok: false,
      errors: [
        { line: 3, message: "JPY 以外の通貨は取り込めません" },
        { line: 4, message: "振替の行に支払元か入金先がありません" },
        { line: 5, message: "payment の行に 支出 以外の金額が入っています" },
        { line: 6, message: "日付が YYYY-MM-DD ではありません" },
      ],
    });
  });
});

describe("groupIntoTransactions", () => {
  const receiptRow = (overrides: Partial<ZaimCsvRecord>): ZaimCsvRecord =>
    record({ お店: "スーパー", 支出: "100", ...overrides });

  test("連続する同じ日・同じ店・同じ支払元の支出を 1 つの取引にまとめる", () => {
    const transactions = groupIntoTransactions(
      parseOk([
        receiptRow({ 品目: "牛乳" }),
        receiptRow({ 品目: "パン" }),
        receiptRow({ 品目: "値引き", 支出: "-20" }),
      ]),
    );

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.items.map((item) => [item.name, item.amount])).toEqual([
      ["牛乳", 100],
      ["パン", 100],
      ["値引き", -20],
    ]);
  });

  test("間に別の行を挟んだら、同じ店でも別の取引にする", () => {
    const transactions = groupIntoTransactions(
      parseOk([receiptRow({}), receiptRow({ お店: "薬局" }), receiptRow({})]),
    );

    expect(transactions).toHaveLength(3);
  });

  test("日付・支払元・集計の設定のどれかが違えば別の取引にする", () => {
    const transactions = groupIntoTransactions(
      parseOk([
        receiptRow({}),
        receiptRow({ 日付: "2026-10-02" }),
        receiptRow({ 日付: "2026-10-02", 支払元: "カード" }),
        receiptRow({ 日付: "2026-10-02", 支払元: "カード", 集計の設定: "集計に含めない" }),
      ]),
    );

    expect(transactions).toHaveLength(4);
  });

  test("お店のない行や支出以外の行はまとめない", () => {
    const transactions = groupIntoTransactions(
      parseOk([
        record({ 支出: "100" }),
        record({ 支出: "100" }),
        record({
          方法: "income",
          カテゴリ: "給与",
          カテゴリの内訳: "-",
          支払元: "-",
          入金先: "財布",
          お店: "会社",
          収入: "1",
        }),
        record({
          方法: "income",
          カテゴリ: "給与",
          カテゴリの内訳: "-",
          支払元: "-",
          入金先: "財布",
          お店: "会社",
          収入: "1",
        }),
      ]),
    );

    expect(transactions).toHaveLength(4);
  });
});

describe("buildImportSql", () => {
  test("取引・品目・マスタを入れる", () => {
    const db = createImportedDb([
      record({ お店: "スーパー", 品目: "牛乳", 支出: "200" }),
      record({ お店: "スーパー", 品目: "パン", 支出: "150" }),
      record({
        方法: "income",
        カテゴリ: "給与",
        カテゴリの内訳: "-",
        支払元: "-",
        入金先: "銀行",
        お店: "会社",
        収入: "300000",
      }),
      record({
        方法: "transfer",
        カテゴリ: "-",
        カテゴリの内訳: "-",
        支払元: "銀行",
        入金先: "財布",
        振替: "10000",
      }),
    ]);

    expect(
      db
        .prepare(
          `SELECT t.mode, fa.name AS fromAccount, ta.name AS toAccount, p.name AS place, c.name AS category, g.name AS genre, i.name, i.amount, i.sort
           FROM transactions t
           JOIN transaction_items i ON i.transaction_id = t.id
           LEFT JOIN accounts fa ON fa.id = t.from_account_id
           LEFT JOIN accounts ta ON ta.id = t.to_account_id
           LEFT JOIN places p ON p.id = t.place_id
           LEFT JOIN genres g ON g.id = i.genre_id
           LEFT JOIN categories c ON c.id = coalesce(i.category_id, g.category_id)
           ORDER BY t.id, i.sort`,
        )
        .all(),
    ).toEqual([
      {
        mode: "payment",
        fromAccount: "財布",
        toAccount: null,
        place: "スーパー",
        category: "食費",
        genre: "食料品",
        name: "牛乳",
        amount: 200,
        sort: 0,
      },
      {
        mode: "payment",
        fromAccount: "財布",
        toAccount: null,
        place: "スーパー",
        category: "食費",
        genre: "食料品",
        name: "パン",
        amount: 150,
        sort: 1,
      },
      {
        mode: "income",
        fromAccount: null,
        toAccount: "銀行",
        place: "会社",
        category: "給与",
        genre: null,
        name: null,
        amount: 300000,
        sort: 0,
      },
      {
        mode: "transfer",
        fromAccount: "銀行",
        toAccount: "財布",
        place: null,
        category: null,
        genre: null,
        name: null,
        amount: 10000,
        sort: 0,
      },
    ]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM transactions").get()).toEqual({ count: 3 });
  });

  test("シングルクォートやセミコロンを含む値もそのまま入る", () => {
    const db = createImportedDb([
      record({ お店: "Joe's; Cafe", メモ: "'; DROP TABLE accounts; --", 支出: "1" }),
    ]);

    expect(db.prepare("SELECT name FROM places").get()).toEqual({ name: "Joe's; Cafe" });
    expect(db.prepare("SELECT memo FROM transaction_items").get()).toEqual({
      memo: "'; DROP TABLE accounts; --",
    });
  });

  test("再取り込みは前回の取り込みを入れ替え、手入力の取引とマスタの ID は残す", () => {
    const db = createImportedDb([record({ 支出: "100" })]);
    const { id: walletId } = db.prepare("SELECT id FROM accounts WHERE name = '財布'").get() as {
      id: number;
    };
    const manualId = insert(
      db,
      "INSERT INTO transactions (date, mode, from_account_id, source) VALUES ('2026-10-20', 'payment', ?, 'manual')",
      walletId,
    );

    runImport(db, [record({ 支出: "100" }), record({ 支出: "300" })], "zaim2.csv");

    expect(db.prepare("SELECT id, source FROM transactions WHERE source = 'manual'").all()).toEqual(
      [{ id: manualId, source: "manual" }],
    );
    expect(
      db
        .prepare(
          "SELECT i.amount FROM transactions t JOIN transaction_items i ON i.transaction_id = t.id WHERE t.source = 'zaim_csv' ORDER BY t.id",
        )
        .all(),
    ).toEqual([{ amount: 100 }, { amount: 300 }]);
    expect(db.prepare("SELECT id FROM accounts WHERE name = '財布'").get()).toEqual({
      id: walletId,
    });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  test("台帳の集計が CSV の集計と一致する", () => {
    const records = [
      record({ お店: "スーパー", 支出: "200" }),
      record({ お店: "スーパー", 支出: "-20" }),
      record({ 日付: "2026-11-03", 支出: "500" }),
      record({
        方法: "income",
        カテゴリ: "給与",
        カテゴリの内訳: "-",
        支払元: "-",
        入金先: "銀行",
        収入: "300000",
      }),
    ];
    const db = createImportedDb(records);

    expect(db.prepare(SUMMARY_SQL).all()).toEqual(summarizeRows(parseOk(records)));
  });
});

describe("chunkStatements", () => {
  test("文を順番どおりに指定した件数ずつ分け、最後のバッチには余りが入る", () => {
    expect(chunkStatements(["a", "b", "c", "d", "e"], 2)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });

  test("バッチに分けて順に流しても、1 つのファイルで流したときと同じ結果になる", () => {
    const records = [
      record({ お店: "スーパー", 品目: "牛乳", 支出: "200" }),
      record({ お店: "スーパー", 品目: "パン", 支出: "150" }),
      record({ 日付: "2026-10-02", 支出: "300" }),
    ];
    const transactions = groupIntoTransactions(parseOk(records));
    const batch = { fileName: "zaim.csv", rowCount: records.length };
    const dump = (db: DatabaseSync): unknown =>
      db
        .prepare(
          "SELECT t.id, t.date, i.amount, i.sort FROM transactions t JOIN transaction_items i ON i.transaction_id = t.id ORDER BY i.id",
        )
        .all();

    const single = createDb();
    applyMigrations(single);
    single.exec(buildImportSql(transactions, batch));
    const chunked = createDb();
    applyMigrations(chunked);
    for (const chunk of chunkStatements(buildImportStatements(transactions, batch), 3)) {
      for (const sql of chunk) chunked.exec(sql);
    }

    expect(dump(chunked)).toEqual(dump(single));
  });
});

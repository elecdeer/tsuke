import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import type { LedgerDb } from "../db.ts";
import { createPayment, findDuplicates, type PaymentInput } from "./payments.ts";

let db: LedgerDb;
let sqlite: DatabaseSync;
let foodId: number;
let groceryId: number;
let cafeId: number;
let salaryId: number;
let walletId: number;

beforeEach(() => {
  ({ db, sqlite } = createTestLedgerDb());
  foodId = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
  groceryId = insert(sqlite, "INSERT INTO genres (category_id, name) VALUES (?, '食料品')", foodId);
  cafeId = insert(sqlite, "INSERT INTO genres (category_id, name) VALUES (?, 'カフェ')", foodId);
  const incomeId = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('income', '収入')");
  salaryId = insert(sqlite, "INSERT INTO genres (category_id, name) VALUES (?, '給与')", incomeId);
  walletId = insert(sqlite, "INSERT INTO accounts (name) VALUES ('財布')");
});

const payment = (overrides: Partial<PaymentInput> = {}): PaymentInput => ({
  date: "2026-10-27",
  fromAccountId: walletId,
  placeName: "スーパー",
  items: [{ genreId: groceryId, name: "牛乳", memo: null, amount: 200 }],
  ...overrides,
});

/** 登録された取引と品目を、店舗名とカテゴリ名を引いて返す */
const dumpTransactions = (): unknown[] =>
  sqlite
    .prepare(
      `SELECT t.id, t.date, t.mode, t.from_account_id AS fromAccountId, p.name AS place, t.source, t.aggregation,
              i.category_id AS categoryId, i.genre_id AS genreId, i.name, i.memo, i.amount, i.sort
       FROM transactions t
       JOIN transaction_items i ON i.transaction_id = t.id
       LEFT JOIN places p ON p.id = t.place_id
       ORDER BY t.id, i.sort`,
    )
    .all();

/** 推測の記録を、入れた順に返す */
const dumpInferences = (): unknown[] =>
  sqlite
    .prepare(
      `SELECT transaction_id AS transactionId, source, model, place_name AS placeName, item_name AS itemName,
              amount, inferred_genre_id AS inferredGenreId, genre_id AS genreId
       FROM genre_inferences ORDER BY id`,
    )
    .all();

describe("createPayment", () => {
  test("AI が読み取った品目は、推測した内訳と確定した内訳を記録する", async () => {
    // 記録が別の取引に付かないことを確かめるため、先に 1 件入れておく
    await createPayment(db, payment());

    await createPayment(
      db,
      payment({
        aiRead: { source: "receipt", model: "test-model" },
        items: [
          {
            genreId: groceryId,
            name: "牛乳 1L",
            memo: null,
            amount: 200,
            aiGuess: { genreId: groceryId, name: "牛乳" },
          },
          {
            genreId: cafeId,
            name: "コーヒー",
            memo: null,
            amount: 150,
            aiGuess: { genreId: groceryId, name: "コーヒー" },
          },
          {
            genreId: groceryId,
            name: "読めなかった品目",
            memo: null,
            amount: 100,
            aiGuess: { genreId: null, name: "" },
          },
          { genreId: groceryId, name: "手で足した品目", memo: null, amount: 50 },
        ],
      }),
    );

    const base = {
      transactionId: 2,
      source: "receipt",
      model: "test-model",
      placeName: "スーパー",
    };
    expect(dumpInferences()).toEqual([
      { ...base, itemName: "牛乳", amount: 200, inferredGenreId: groceryId, genreId: groceryId },
      { ...base, itemName: "コーヒー", amount: 150, inferredGenreId: groceryId, genreId: cafeId },
      { ...base, itemName: null, amount: 100, inferredGenreId: null, genreId: groceryId },
    ]);
  });

  test("店舗のない登録でも推測を記録する", async () => {
    await createPayment(
      db,
      payment({
        placeName: null,
        aiRead: { source: "statement", model: "test-model" },
        items: [
          {
            genreId: cafeId,
            name: "ｶﾌｪ",
            memo: null,
            amount: 450,
            aiGuess: { genreId: 9999, name: "ｶﾌｪ" },
          },
        ],
      }),
    );

    expect(dumpInferences()).toEqual([
      {
        transactionId: 1,
        source: "statement",
        model: "test-model",
        placeName: null,
        itemName: "ｶﾌｪ",
        amount: 450,
        inferredGenreId: 9999,
        genreId: cafeId,
      },
    ]);
  });

  test("AI の読み取りからの登録でなければ推測を記録しない", async () => {
    await createPayment(db, payment());
    await createPayment(
      db,
      payment({
        items: [
          {
            genreId: groceryId,
            name: "牛乳",
            memo: null,
            amount: 200,
            aiGuess: { genreId: cafeId, name: "牛乳" },
          },
        ],
      }),
    );

    expect(dumpInferences()).toEqual([]);
  });

  test("取引を消すと推測の記録も消える", async () => {
    await createPayment(
      db,
      payment({
        aiRead: { source: "page", model: "test-model" },
        items: [
          {
            genreId: groceryId,
            name: "牛乳",
            memo: null,
            amount: 200,
            aiGuess: { genreId: cafeId, name: "牛乳" },
          },
        ],
      }),
    );

    sqlite.prepare("DELETE FROM transactions").run();

    expect(dumpInferences()).toEqual([]);
  });

  test("取引と品目をまとめて登録し、カテゴリは内訳の親から決める", async () => {
    const result = await createPayment(
      db,
      payment({
        items: [
          { genreId: groceryId, name: "牛乳", memo: "特売", amount: 200 },
          { genreId: cafeId, name: "コーヒー", memo: null, amount: 150 },
          { genreId: groceryId, name: "値引き", memo: null, amount: -20 },
        ],
      }),
    );

    expect(result).toEqual({ ok: true, id: 1 });
    const base = {
      id: 1,
      date: "2026-10-27",
      mode: "payment",
      fromAccountId: walletId,
      place: "スーパー",
      source: "manual",
      aggregation: "always",
      categoryId: foodId,
    };
    expect(dumpTransactions()).toEqual([
      { ...base, genreId: groceryId, name: "牛乳", memo: "特売", amount: 200, sort: 0 },
      { ...base, genreId: cafeId, name: "コーヒー", memo: null, amount: 150, sort: 1 },
      { ...base, genreId: groceryId, name: "値引き", memo: null, amount: -20, sort: 2 },
    ]);
  });

  test("新しい店舗にはチェーンと施設の情報を保存する", async () => {
    await createPayment(
      db,
      payment({
        placeName: "ローソン新宿店",
        placeDetail: {
          chain: "ローソン",
          poi: {
            address: "東京都新宿区",
            lng: 139.7,
            lat: 35.7,
            category: "convenience_store",
            licenses: ["Apache-2.0"],
            attributions: ["Overture"],
          },
        },
      }),
    );

    expect(
      sqlite
        .prepare(
          "SELECT name, chain, address, lng, lat, poi_category, poi_licenses, poi_attributions FROM places",
        )
        .all(),
    ).toEqual([
      {
        name: "ローソン新宿店",
        chain: "ローソン",
        address: "東京都新宿区",
        lng: 139.7,
        lat: 35.7,
        poi_category: "convenience_store",
        poi_licenses: '["Apache-2.0"]',
        poi_attributions: '["Overture"]',
      },
    ]);
  });

  test("既存の店舗の情報は、同じ名前で入れても書き換えない", async () => {
    insert(sqlite, "INSERT INTO places (name) VALUES ('セブンイレブン')");

    await createPayment(
      db,
      payment({
        placeName: "セブンイレブン",
        placeDetail: {
          chain: "セブンイレブン",
          poi: {
            address: "別の支店の住所",
            lng: 139,
            lat: 35,
            category: "",
            licenses: [],
            attributions: [],
          },
        },
      }),
    );

    expect(sqlite.prepare("SELECT chain, address FROM places").all()).toEqual([
      { chain: null, address: null },
    ]);
  });

  test("読み取った電話番号を、新しい店舗にも既存の店舗にも覚えさせる", async () => {
    insert(sqlite, "INSERT INTO places (name) VALUES ('スーパー')");

    await createPayment(db, payment({ placePhone: "0312345678" }));
    await createPayment(db, payment({ placeName: "薬局", placePhone: "0398765432" }));

    expect(sqlite.prepare("SELECT name, phone FROM places ORDER BY id").all()).toEqual([
      { name: "スーパー", phone: "0312345678" },
      { name: "薬局", phone: "0398765432" },
    ]);
  });

  test("読み間違えて覚えた電話番号は、次の登録で直る", async () => {
    await createPayment(db, payment({ placePhone: "0300000000" }));
    await createPayment(db, payment({ placePhone: "0312345678" }));

    expect(sqlite.prepare("SELECT phone FROM places").get()).toEqual({ phone: "0312345678" });
  });

  test("電話番号が読み取れなかった登録では、覚えた番号を消さない", async () => {
    await createPayment(db, payment({ placePhone: "0312345678" }));
    await createPayment(db, payment({ placePhone: null }));
    await createPayment(db, payment());

    expect(sqlite.prepare("SELECT phone FROM places").get()).toEqual({ phone: "0312345678" });
  });

  test("既存の店舗は名前で使い回し、なければ作る", async () => {
    insert(sqlite, "INSERT INTO places (name) VALUES ('スーパー')");

    await createPayment(db, payment());
    await createPayment(db, payment({ placeName: "薬局" }));

    // 既存の名前との衝突で INSERT が無視されても AUTOINCREMENT の番号は進むので、ID ではなく名前で確かめる
    expect(sqlite.prepare("SELECT name FROM places ORDER BY id").all()).toEqual([
      { name: "スーパー" },
      { name: "薬局" },
    ]);
    expect(
      sqlite
        .prepare(
          "SELECT p.name FROM transactions t JOIN places p ON p.id = t.place_id ORDER BY t.id",
        )
        .all(),
    ).toEqual([{ name: "スーパー" }, { name: "薬局" }]);
  });

  test("店舗・口座なしでも登録でき、空の品目名やメモは null にする", async () => {
    const result = await createPayment(
      db,
      payment({
        fromAccountId: null,
        placeName: "",
        items: [{ genreId: groceryId, name: "", memo: "", amount: 100 }],
      }),
    );

    expect(result).toEqual({ ok: true, id: 1 });
    expect(dumpTransactions()).toMatchObject([
      { fromAccountId: null, place: null, name: null, memo: null },
    ]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM places").get()).toEqual({ count: 0 });
  });

  test("2 回目の登録の品目は 2 回目の取引に付く", async () => {
    await createPayment(db, payment());
    const second = await createPayment(
      db,
      payment({ items: [{ genreId: cafeId, name: null, memo: null, amount: 500 }] }),
    );

    expect(second).toEqual({ ok: true, id: 2 });
    expect(
      sqlite
        .prepare(
          "SELECT transaction_id AS transactionId, amount FROM transaction_items ORDER BY id",
        )
        .all(),
    ).toEqual([
      { transactionId: 1, amount: 200 },
      { transactionId: 2, amount: 500 },
    ]);
  });

  test("支出の内訳でないものや存在しない内訳を含むと、何も登録しない", async () => {
    const result = await createPayment(
      db,
      payment({
        items: [
          { genreId: groceryId, name: null, memo: null, amount: 100 },
          { genreId: salaryId, name: null, memo: null, amount: 100 },
          { genreId: 999, name: null, memo: null, amount: 100 },
        ],
      }),
    );

    expect(result).toEqual({ ok: false, error: `支出の内訳が見つかりません: ${salaryId}, 999` });
    expect(dumpTransactions()).toEqual([]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM places").get()).toEqual({ count: 0 });
  });

  test("存在しない口座なら何も登録しない", async () => {
    const result = await createPayment(db, payment({ fromAccountId: 999 }));

    expect(result).toEqual({ ok: false, error: "口座が見つかりません" });
    expect(dumpTransactions()).toEqual([]);
  });
});

describe("findDuplicates", () => {
  test("日付が ±1 日で金額と内訳が一致する支出を、品目ごとに返す", async () => {
    await createPayment(db, payment({ date: "2026-10-26" }));
    await createPayment(db, payment({ date: "2026-10-28", placeName: null }));
    await createPayment(db, payment({ date: "2026-10-29" }));
    await createPayment(
      db,
      payment({ items: [{ genreId: groceryId, name: null, memo: null, amount: 300 }] }),
    );
    await createPayment(
      db,
      payment({ items: [{ genreId: cafeId, name: null, memo: null, amount: 200 }] }),
    );

    const duplicates = await findDuplicates(db, {
      date: "2026-10-27",
      items: [
        { genreId: groceryId, amount: 200 },
        { genreId: cafeId, amount: 999 },
      ],
    });

    expect(duplicates).toEqual([
      [
        { transactionId: 1, date: "2026-10-26", amount: 200, placeName: "スーパー" },
        { transactionId: 2, date: "2026-10-28", amount: 200, placeName: null },
      ],
      [],
    ]);
  });

  test("支出以外の取引は候補にしない", async () => {
    const txId = insert(
      sqlite,
      "INSERT INTO transactions (date, mode, source) VALUES ('2026-10-27', 'transfer', 'zaim_csv')",
    );
    insert(
      sqlite,
      "INSERT INTO transaction_items (transaction_id, category_id, genre_id, amount) VALUES (?, ?, ?, 200)",
      txId,
      foodId,
      groceryId,
    );

    expect(
      await findDuplicates(db, {
        date: "2026-10-27",
        items: [{ genreId: groceryId, amount: 200 }],
      }),
    ).toEqual([[]]);
  });
});

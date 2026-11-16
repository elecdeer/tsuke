import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import type { LedgerDb } from "../db.ts";
import { createPayment, findDuplicates, overwritePayment, type PaymentInput } from "./payments.ts";

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

  test("D1 の 1 文の変数の上限を超える数の品目でも、すべての品目と推測を記録する", async () => {
    // 先に 1 件入れて、分けて入れた品目と推測が別の取引に付かないことも確かめる
    await createPayment(db, payment());
    const items = Array.from({ length: 40 }, (_, index) => ({
      genreId: groceryId,
      name: `品目${index}`,
      memo: null,
      amount: index + 1,
      aiGuess: { genreId: groceryId, name: `品目${index}` },
    }));

    const result = await createPayment(
      db,
      payment({ aiRead: { source: "receipt", model: "test-model" }, items }),
    );

    expect(result).toEqual({ ok: true, id: 2 });
    const rows = sqlite
      .prepare(
        "SELECT name, amount, sort FROM transaction_items WHERE transaction_id = 2 ORDER BY sort",
      )
      .all();
    expect(rows).toEqual(
      items.map((item, index) => ({ name: item.name, amount: item.amount, sort: index })),
    );
    const inferences = dumpInferences();
    expect(inferences).toHaveLength(40);
    expect(inferences.every((row) => (row as { transactionId: number }).transactionId === 2)).toBe(
      true,
    );
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

describe("overwritePayment", () => {
  /** 明細の取り込みで入ったような、店舗と品名の分からない支出を入れる */
  const insertStatementPayment = (): number => {
    const batchId = insert(
      sqlite,
      "INSERT INTO import_batches (source, file_name, row_count) VALUES ('statement_csv', 'card.csv', 1)",
    );
    const id = insert(
      sqlite,
      `INSERT INTO transactions (date, mode, from_account_id, aggregation, source, import_batch_id, is_favorite)
       VALUES ('2026-10-28', 'payment', ?, 'yearly_only', 'statement_csv', ?, 1)`,
      walletId,
      batchId,
    );
    insert(
      sqlite,
      "INSERT INTO transaction_items (transaction_id, category_id, genre_id, name, amount) VALUES (?, ?, ?, 'ｽｰﾊﾟｰ', 350)",
      id,
      foodId,
      groceryId,
    );
    return id;
  };

  const detailed = (overrides: Partial<PaymentInput> = {}): PaymentInput =>
    payment({
      items: [
        { genreId: groceryId, name: "牛乳", memo: null, amount: 200 },
        { genreId: cafeId, name: "コーヒー", memo: "店内", amount: 150 },
      ],
      ...overrides,
    });

  test("日付・支払元・店舗・品目を置き換え、取り込み元や集計の扱いは残す", async () => {
    const id = insertStatementPayment();
    const cardId = insert(sqlite, "INSERT INTO accounts (name) VALUES ('カード')");

    const result = await overwritePayment(db, id, detailed({ fromAccountId: cardId }));

    expect(result).toEqual({ ok: true, id, replacedReceiptImageKey: null });
    expect(dumpTransactions()).toEqual([
      {
        id,
        date: "2026-10-27",
        mode: "payment",
        fromAccountId: cardId,
        place: "スーパー",
        source: "statement_csv",
        aggregation: "yearly_only",
        categoryId: foodId,
        genreId: groceryId,
        name: "牛乳",
        memo: null,
        amount: 200,
        sort: 0,
      },
      {
        id,
        date: "2026-10-27",
        mode: "payment",
        fromAccountId: cardId,
        place: "スーパー",
        source: "statement_csv",
        aggregation: "yearly_only",
        categoryId: foodId,
        genreId: cafeId,
        name: "コーヒー",
        memo: "店内",
        amount: 150,
        sort: 1,
      },
    ]);
    expect(
      sqlite
        .prepare("SELECT import_batch_id IS NOT NULL AS b, is_favorite AS f FROM transactions")
        .get(),
    ).toEqual({ b: 1, f: 1 });
  });

  test("写真のキーを渡せば差し替え、前のキーを返す。渡さなければ今の写真を残す", async () => {
    const created = await createPayment(db, payment(), "receipts/old.jpeg");
    if (!created.ok) throw new Error(created.error);
    const { id } = created;

    expect(await overwritePayment(db, id, payment())).toEqual({
      ok: true,
      id,
      replacedReceiptImageKey: null,
    });
    expect(await overwritePayment(db, id, payment(), "receipts/new.jpeg")).toEqual({
      ok: true,
      id,
      replacedReceiptImageKey: "receipts/old.jpeg",
    });
    expect(
      sqlite.prepare("SELECT receipt_image_key AS k FROM transactions WHERE id = ?").get(id),
    ).toEqual({ k: "receipts/new.jpeg" });
  });

  test("前の推測の記録は残し、新しい推測の記録を足す", async () => {
    const id = insertStatementPayment();
    insert(
      sqlite,
      `INSERT INTO genre_inferences (transaction_id, source, model, item_name, amount, inferred_genre_id, genre_id)
       VALUES (?, 'statement_csv', 'csv-model', 'ｽｰﾊﾟｰ', 350, ?, ?)`,
      id,
      groceryId,
      groceryId,
    );

    await overwritePayment(
      db,
      id,
      payment({
        aiRead: { source: "receipt", model: "receipt-model" },
        items: [
          {
            genreId: groceryId,
            name: "牛乳",
            memo: null,
            amount: 350,
            aiGuess: { genreId: groceryId, name: "牛乳" },
          },
        ],
      }),
    );

    expect(dumpInferences()).toEqual([
      {
        transactionId: id,
        source: "statement_csv",
        model: "csv-model",
        placeName: null,
        itemName: "ｽｰﾊﾟｰ",
        amount: 350,
        inferredGenreId: groceryId,
        genreId: groceryId,
      },
      {
        transactionId: id,
        source: "receipt",
        model: "receipt-model",
        placeName: "スーパー",
        itemName: "牛乳",
        amount: 350,
        inferredGenreId: groceryId,
        genreId: groceryId,
      },
    ]);
  });

  test("読み取った電話番号を店舗に覚えさせる", async () => {
    const id = insertStatementPayment();

    await overwritePayment(db, id, detailed({ placePhone: "0312345678" }));

    expect(sqlite.prepare("SELECT name, phone FROM places").all()).toEqual([
      { name: "スーパー", phone: "0312345678" },
    ]);
  });

  test("立替額が新しい品目の合計を超えるなら上書きしない", async () => {
    const id = insertStatementPayment();
    sqlite.prepare("UPDATE transactions SET advance_amount = 350 WHERE id = ?").run(id);
    const before = dumpTransactions();

    const result = await overwritePayment(db, id, payment());

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(dumpTransactions()).toEqual(before);
  });

  test("支出でない取引や、ない取引は上書きしない", async () => {
    const transferId = insert(
      sqlite,
      "INSERT INTO transactions (date, mode, source) VALUES ('2026-10-27', 'transfer', 'manual')",
    );

    expect(await overwritePayment(db, transferId, payment())).toEqual({
      ok: false,
      status: 400,
      error: "上書きできるのは支出だけです",
    });
    expect(await overwritePayment(db, 999, payment())).toEqual({
      ok: false,
      status: 404,
      error: "取引が見つかりません",
    });
  });

  test("存在しない内訳を含むと、何も書き換えない", async () => {
    const id = insertStatementPayment();
    const before = dumpTransactions();

    const result = await overwritePayment(
      db,
      id,
      payment({ items: [{ genreId: salaryId, name: null, memo: null, amount: 350 }] }),
    );

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(dumpTransactions()).toEqual(before);
  });
});

describe("findDuplicates", () => {
  test("日付が ±1 日で、品目の合計金額が一致する支出を返す", async () => {
    await createPayment(db, payment({ date: "2026-10-25" }));
    await createPayment(db, payment({ date: "2026-10-26" }));
    await createPayment(
      db,
      payment({
        date: "2026-10-28",
        items: [
          { genreId: groceryId, name: null, memo: null, amount: 150 },
          { genreId: cafeId, name: null, memo: null, amount: 50 },
        ],
      }),
    );
    await createPayment(db, payment({ date: "2026-10-29" }));
    await createPayment(
      db,
      payment({ items: [{ genreId: groceryId, name: null, memo: null, amount: 300 }] }),
    );

    const duplicates = await findDuplicates(db, {
      date: "2026-10-27",
      amount: 200,
      placeName: "スーパー",
    });

    expect(duplicates).toEqual([
      { transactionId: 2, date: "2026-10-26", amount: 200, placeName: "スーパー" },
      { transactionId: 3, date: "2026-10-28", amount: 200, placeName: "スーパー" },
    ]);
  });

  test("店舗名があれば、同じ店舗の支出と店舗のない支出を返す", async () => {
    await createPayment(db, payment({ placeName: "スーパー" }));
    await createPayment(db, payment({ placeName: "コンビニ" }));
    await createPayment(db, payment({ placeName: null }));

    const duplicates = await findDuplicates(db, {
      date: "2026-10-27",
      amount: 200,
      placeName: "スーパー",
    });

    expect(duplicates).toEqual([
      { transactionId: 1, date: "2026-10-27", amount: 200, placeName: "スーパー" },
      { transactionId: 3, date: "2026-10-27", amount: 200, placeName: null },
    ]);
  });

  test("店舗名が空なら店舗では絞らない", async () => {
    await createPayment(db, payment({ placeName: "スーパー" }));
    await createPayment(db, payment({ placeName: null }));

    const duplicates = await findDuplicates(db, {
      date: "2026-10-27",
      amount: 200,
      placeName: "",
    });

    expect(duplicates.map((candidate) => candidate.transactionId)).toEqual([1, 2]);
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

    expect(await findDuplicates(db, { date: "2026-10-27", amount: 200, placeName: null })).toEqual(
      [],
    );
  });
});

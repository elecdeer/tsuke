import type { DatabaseSync } from "node:sqlite";
import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import type { LedgerDb } from "../db.ts";
import {
  checkModeRules,
  deleteTransaction,
  getTransaction,
  TransactionUpdateSchema,
  updateTransaction,
  type TransactionUpdate,
} from "./transactionEdit.ts";

/**
 * 口座 2 つ、支出の食費（食料品）、収入の給与（内訳なし）、店舗 1 つを入れる。
 */
const seedMasters = (sqlite: DatabaseSync) => {
  const wallet = insert(sqlite, "INSERT INTO accounts (name) VALUES ('財布')");
  const bank = insert(sqlite, "INSERT INTO accounts (name) VALUES ('銀行')");
  const food = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
  const salary = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('income', '給与')");
  const groceries = insert(
    sqlite,
    "INSERT INTO genres (category_id, name) VALUES (?, '食料品')",
    food,
  );
  const store = insert(sqlite, "INSERT INTO places (name) VALUES ('スーパー')");
  return { wallet, bank, food, salary, groceries, store };
};

/**
 * 品目を 1 件持つ支出を入れる。
 */
const insertPayment = (
  sqlite: DatabaseSync,
  m: ReturnType<typeof seedMasters>,
  source = "manual",
): number => {
  const id = insert(
    sqlite,
    "INSERT INTO transactions (date, mode, from_account_id, place_id, source) VALUES ('2026-10-01', 'payment', ?, ?, ?)",
    m.wallet,
    m.store,
    source,
  );
  insert(
    sqlite,
    "INSERT INTO transaction_items (transaction_id, category_id, genre_id, name, amount) VALUES (?, ?, ?, '牛乳', 200)",
    id,
    m.food,
    m.groceries,
  );
  return id;
};

/** 支出の編集の入力。品目は 1 件 */
const paymentUpdate = (
  m: ReturnType<typeof seedMasters>,
  overrides: Partial<TransactionUpdate> = {},
): TransactionUpdate => ({
  date: "2026-10-02",
  aggregation: "always",
  fromAccountId: m.bank,
  toAccountId: null,
  placeName: "スーパー",
  items: [{ categoryId: null, genreId: m.groceries, name: "卵", memo: null, amount: 300 }],
  ...overrides,
});

describe("getTransaction", () => {
  test("レシートの写真があるかだけを返し、キーは渡さない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertPayment(sqlite, m);
    sqlite.prepare("UPDATE transactions SET receipt_image_key = 'receipts/a.jpeg'").run();

    const transaction = await getTransaction(db, id);

    expect(transaction?.hasReceiptImage).toBe(true);
    expect(transaction).not.toHaveProperty("receiptImageKey");
  });

  test("取引を店舗名と並び順の品目付きで返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertPayment(sqlite, m, "zaim_csv");
    insert(
      sqlite,
      "INSERT INTO transaction_items (transaction_id, name, memo, amount, sort) VALUES (?, '値引き', 'クーポン', -20, -1)",
      id,
    );

    expect(await getTransaction(db, id)).toEqual({
      id,
      date: "2026-10-01",
      mode: "payment",
      aggregation: "always",
      source: "zaim_csv",
      fromAccountId: m.wallet,
      toAccountId: null,
      placeName: "スーパー",
      hasReceiptImage: false,
      advanceAmount: 0,
      linkedIncomes: [],
      linkedPayments: [],
      items: [
        {
          categoryId: null,
          genreId: null,
          name: "値引き",
          memo: "クーポン",
          amount: -20,
          isAdvanceTarget: false,
        },
        {
          categoryId: m.food,
          genreId: m.groceries,
          name: "牛乳",
          memo: null,
          amount: 200,
          isAdvanceTarget: false,
        },
      ],
    });
  });

  test("ない取引には undefined を返す", async () => {
    const { db } = createTestLedgerDb();

    expect(await getTransaction(db, 1)).toBeUndefined();
  });
});

describe("updateTransaction", () => {
  test("取引の項目を書き換え、品目を入れ直す。空白だけの店舗名・品目名は空にする", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertPayment(sqlite, m, "zaim_csv");

    const result = await updateTransaction(
      db,
      id,
      // 画面のアクションと同じく、スキーマで前後の空白を取り除いてから渡す
      v.parse(
        TransactionUpdateSchema,
        paymentUpdate(m, {
          aggregation: "never",
          placeName: "  ",
          items: [
            { categoryId: null, genreId: m.groceries, name: "卵", memo: "10 個", amount: 300 },
            { categoryId: null, genreId: m.groceries, name: " ", memo: null, amount: -30 },
          ],
        }),
      ),
    );

    expect(result).toEqual({ ok: true });
    expect(await getTransaction(db, id)).toEqual({
      id,
      date: "2026-10-02",
      mode: "payment",
      aggregation: "never",
      source: "zaim_csv",
      fromAccountId: m.bank,
      toAccountId: null,
      placeName: null,
      hasReceiptImage: false,
      advanceAmount: 0,
      linkedIncomes: [],
      linkedPayments: [],
      items: [
        {
          categoryId: m.food,
          genreId: m.groceries,
          name: "卵",
          memo: "10 個",
          amount: 300,
          isAdvanceTarget: false,
        },
        {
          categoryId: m.food,
          genreId: m.groceries,
          name: null,
          memo: null,
          amount: -30,
          isAdvanceTarget: false,
        },
      ],
    });
  });

  test("新しい店舗名なら店舗を作って紐付ける", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertPayment(sqlite, m);

    await updateTransaction(db, id, paymentUpdate(m, { placeName: "八百屋" }));

    expect((await getTransaction(db, id))?.placeName).toBe("八百屋");
  });

  test("編集で入れた新しい店舗にチェーンを保存する", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertPayment(sqlite, m);

    await updateTransaction(
      db,
      id,
      paymentUpdate(m, { placeName: "八百屋 駅前店", placeDetail: { chain: "八百屋", poi: null } }),
    );

    expect(sqlite.prepare("SELECT chain FROM places WHERE name = '八百屋 駅前店'").get()).toEqual({
      chain: "八百屋",
    });
  });

  test("内訳のない品目は、入力のカテゴリをそのまま持つ", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertPayment(sqlite, m);

    await updateTransaction(
      db,
      id,
      paymentUpdate(m, {
        items: [{ categoryId: m.food, genreId: null, name: null, memo: null, amount: 100 }],
      }),
    );

    expect((await getTransaction(db, id))?.items).toEqual([
      {
        categoryId: m.food,
        genreId: null,
        name: null,
        memo: null,
        amount: 100,
        isAdvanceTarget: false,
      },
    ]);
  });

  test("ほかの種類の内訳を指定すると、書き換えずに理由を返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertPayment(sqlite, m);
    const salaryGenre = insert(
      sqlite,
      "INSERT INTO genres (category_id, name) VALUES (?, '本業')",
      m.salary,
    );

    const result = await updateTransaction(
      db,
      id,
      paymentUpdate(m, {
        items: [{ categoryId: null, genreId: salaryGenre, name: null, memo: null, amount: 100 }],
      }),
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: `内訳が見つかりません: ${salaryGenre}`,
    });
    expect((await getTransaction(db, id))?.items[0]?.name).toBe("牛乳");
  });

  test("ほかの種類のカテゴリを指定すると理由を返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertPayment(sqlite, m);

    const result = await updateTransaction(
      db,
      id,
      paymentUpdate(m, {
        items: [{ categoryId: m.salary, genreId: null, name: null, memo: null, amount: 100 }],
      }),
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: `カテゴリが見つかりません: ${m.salary}`,
    });
  });

  test("ない口座を指定すると理由を返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertPayment(sqlite, m);

    const result = await updateTransaction(db, id, paymentUpdate(m, { fromAccountId: 999 }));

    expect(result).toEqual({ ok: false, status: 400, error: "口座が見つかりません" });
  });

  test("ない取引には 404 を返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);

    const result = await updateTransaction(db, 999, paymentUpdate(m));

    expect(result).toEqual({ ok: false, status: 404, error: "取引が見つかりません" });
  });

  test("updated_at を書き換える", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertPayment(sqlite, m);
    sqlite.exec(`UPDATE transactions SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ${id}`);

    await updateTransaction(db, id, paymentUpdate(m));

    const row = sqlite.prepare("SELECT updated_at FROM transactions WHERE id = ?").get(id);
    expect(row?.["updated_at"]).not.toBe("2000-01-01T00:00:00.000Z");
  });
});

describe("checkModeRules", () => {
  const item = { categoryId: null, genreId: null, name: null, memo: null, amount: 1000 };
  const base: TransactionUpdate = {
    date: "2026-10-01",
    aggregation: "always",
    fromAccountId: null,
    toAccountId: null,
    placeName: null,
    items: [item],
  };

  test("支出に入金先があれば理由を返す", () => {
    expect(checkModeRules("payment", { ...base, fromAccountId: 1, toAccountId: 2 })).toBe(
      "支出には入金先を指定できません",
    );
  });

  test("支出は品目を複数持てる", () => {
    expect(
      checkModeRules("payment", { ...base, fromAccountId: 1, items: [item, item] }),
    ).toBeNull();
  });

  test("収入に支払元があれば理由を返す", () => {
    expect(checkModeRules("income", { ...base, fromAccountId: 1 })).toBe(
      "収入には支払元を指定できません",
    );
  });

  test("収入の品目が複数なら理由を返す", () => {
    expect(checkModeRules("income", { ...base, toAccountId: 1, items: [item, item] })).toBe(
      "収入の品目は 1 件にしてください",
    );
  });

  test("収入に内訳があれば理由を返す", () => {
    expect(
      checkModeRules("income", { ...base, toAccountId: 1, items: [{ ...item, genreId: 1 }] }),
    ).toBe("収入には内訳を指定できません");
  });

  test("振替は支払元と入金先が別の口座なら受け付ける", () => {
    expect(checkModeRules("transfer", { ...base, fromAccountId: 1, toAccountId: 2 })).toBeNull();
  });

  test("振替の口座が片方だけなら理由を返す", () => {
    expect(checkModeRules("transfer", { ...base, fromAccountId: 1 })).toBe(
      "振替には支払元と入金先の両方を指定してください",
    );
  });

  test("振替の口座が同じなら理由を返す", () => {
    expect(checkModeRules("transfer", { ...base, fromAccountId: 1, toAccountId: 1 })).toBe(
      "振替の支払元と入金先は別の口座にしてください",
    );
  });

  test("振替に店舗があれば理由を返す", () => {
    expect(
      checkModeRules("transfer", { ...base, fromAccountId: 1, toAccountId: 2, placeName: "店" }),
    ).toBe("振替・残高調整には店舗を指定できません");
  });

  test("振替にカテゴリがあれば理由を返す", () => {
    expect(
      checkModeRules("transfer", {
        ...base,
        fromAccountId: 1,
        toAccountId: 2,
        items: [{ ...item, categoryId: 1 }],
      }),
    ).toBe("振替・残高調整にはカテゴリを指定できません");
  });

  test("残高調整は口座が片方だけなら受け付ける", () => {
    expect(checkModeRules("adjustment", { ...base, toAccountId: 1 })).toBeNull();
  });

  test("残高調整の口座が両方なら理由を返す", () => {
    expect(checkModeRules("adjustment", { ...base, fromAccountId: 1, toAccountId: 2 })).toBe(
      "残高調整には支払元か入金先のどちらか一方を指定してください",
    );
  });

  test("残高調整の金額が 0 以下なら理由を返す", () => {
    expect(
      checkModeRules("adjustment", { ...base, toAccountId: 1, items: [{ ...item, amount: 0 }] }),
    ).toBe("振替・残高調整の金額は正にしてください");
  });
});

describe("deleteTransaction", () => {
  test("取引と品目を消す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertPayment(sqlite, m);

    expect(await deleteTransaction(db, id)).toEqual({ ok: true, receiptImageKey: null });
    expect(await getTransaction(db, id)).toBeUndefined();
    expect(sqlite.prepare("SELECT count(*) AS n FROM transaction_items").get()?.["n"]).toBe(0);
  });

  test("レシートの写真があれば、消す相手のキーを返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const m = seedMasters(sqlite);
    const id = insertPayment(sqlite, m);
    sqlite.prepare("UPDATE transactions SET receipt_image_key = 'receipts/a.jpeg'").run();

    expect(await deleteTransaction(db, id)).toEqual({
      ok: true,
      receiptImageKey: "receipts/a.jpeg",
    });
  });

  test("ない取引には 404 を返す", async () => {
    const { db } = createTestLedgerDb();

    expect(await deleteTransaction(db, 1)).toEqual({
      ok: false,
      status: 404,
      error: "取引が見つかりません",
    });
  });
});

describe("立替", () => {
  /**
   * 銀行に入る収入を入れる。
   */
  const insertIncome = (
    sqlite: DatabaseSync,
    m: ReturnType<typeof seedMasters>,
    amount: number,
  ) => {
    const id = insert(
      sqlite,
      "INSERT INTO transactions (date, mode, to_account_id, source) VALUES ('2026-10-20', 'income', ?, 'manual')",
      m.bank,
    );
    insert(
      sqlite,
      "INSERT INTO transaction_items (transaction_id, category_id, amount) VALUES (?, ?, ?)",
      id,
      m.salary,
      amount,
    );
    return id;
  };

  /**
   * 3,600 円の支出を入れる。advance は立替額。
   */
  const insertAdvancePayment = (
    sqlite: DatabaseSync,
    m: ReturnType<typeof seedMasters>,
    advance: number,
  ) => {
    const id = insert(
      sqlite,
      "INSERT INTO transactions (date, mode, from_account_id, source, advance_amount) VALUES ('2026-10-01', 'payment', ?, 'manual', ?)",
      m.wallet,
      advance,
    );
    insert(
      sqlite,
      "INSERT INTO transaction_items (transaction_id, category_id, genre_id, amount) VALUES (?, ?, ?, 3600)",
      id,
      m.food,
      m.groceries,
    );
    return id;
  };

  const incomeUpdate = (
    m: ReturnType<typeof seedMasters>,
    amount: number,
    reimbursements: TransactionUpdate["reimbursements"],
  ): TransactionUpdate => ({
    date: "2026-10-20",
    aggregation: "always",
    fromAccountId: null,
    toAccountId: m.bank,
    placeName: null,
    items: [{ categoryId: m.salary, genreId: null, name: null, memo: null, amount }],
    reimbursements,
  });

  const advanceOf = async (db: LedgerDb, id: number) =>
    (await getTransaction(db, id))?.advanceAmount;

  describe("支出の立替額", () => {
    test("立替額と対象の印を保存して返す", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const id = insertPayment(sqlite, m);

      const result = await updateTransaction(
        db,
        id,
        paymentUpdate(m, {
          advanceAmount: 250,
          items: [
            { categoryId: null, genreId: m.groceries, name: "卵", memo: null, amount: 100 },
            {
              categoryId: null,
              genreId: m.groceries,
              name: "牛乳",
              memo: null,
              amount: 300,
              isAdvanceTarget: true,
            },
          ],
        }),
      );

      expect(result).toEqual({ ok: true });
      const saved = await getTransaction(db, id);
      expect(saved?.advanceAmount).toBe(250);
      expect(saved?.items.map((item) => item.isAdvanceTarget)).toEqual([false, true]);
    });

    test("立替額を省くと今の値のままにする", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const id = insertAdvancePayment(sqlite, m, 100);

      await updateTransaction(db, id, paymentUpdate(m));

      expect(await advanceOf(db, id)).toBe(100);
    });

    test("対象の品目の合計を超える立替額は保存しない", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const id = insertPayment(sqlite, m);

      const result = await updateTransaction(
        db,
        id,
        paymentUpdate(m, {
          advanceAmount: 200,
          items: [
            {
              categoryId: null,
              genreId: m.groceries,
              name: "卵",
              memo: null,
              amount: 100,
              isAdvanceTarget: true,
            },
            { categoryId: null, genreId: m.groceries, name: "牛乳", memo: null, amount: 300 },
          ],
        }),
      );

      expect(result).toEqual({
        ok: false,
        status: 400,
        error: "立替額は対象の品目の合計以下にしてください",
      });
    });

    test("紐付けた額の合計より低い立替額は保存しない", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const payment = insertAdvancePayment(sqlite, m, 2400);
      const income = insertIncome(sqlite, m, 1200);
      await updateTransaction(
        db,
        income,
        incomeUpdate(m, 1200, [{ paymentId: payment, amount: 1200, expectMore: true }]),
      );

      const result = await updateTransaction(
        db,
        payment,
        paymentUpdate(m, {
          advanceAmount: 1000,
          items: [{ categoryId: null, genreId: m.groceries, name: null, memo: null, amount: 3600 }],
        }),
      );

      expect(result).toEqual({
        ok: false,
        status: 400,
        error: "立替額は紐付けた額の合計以上にしてください",
      });
    });

    test("支出以外には立替額を指定できない", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const income = insertIncome(sqlite, m, 1000);

      const result = await updateTransaction(db, income, {
        ...incomeUpdate(m, 1000, []),
        advanceAmount: 100,
      });

      expect(result).toEqual({
        ok: false,
        status: 400,
        error: "立替額を指定できるのは支出だけです",
      });
    });
  });

  describe("収入の紐付け", () => {
    test("紐付けると立替額を収入の金額で確定し、収入を集計に含めないようにする", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const payment = insertAdvancePayment(sqlite, m, 2400);
      const income = insertIncome(sqlite, m, 2000);

      const result = await updateTransaction(
        db,
        income,
        incomeUpdate(m, 2000, [{ paymentId: payment, amount: 2000, expectMore: false }]),
      );

      expect(result).toEqual({ ok: true });
      expect(await advanceOf(db, payment)).toBe(2000);
      const saved = await getTransaction(db, income);
      expect(saved?.aggregation).toBe("never");
      expect(saved?.linkedPayments).toMatchObject([{ paymentId: payment, amount: 2000 }]);
      expect((await getTransaction(db, payment))?.linkedIncomes).toMatchObject([
        { incomeId: income, amount: 2000, accountName: "銀行" },
      ]);
    });

    test("まだ入金があるなら立替額を変えず、次の入金で合計に確定する", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const payment = insertAdvancePayment(sqlite, m, 2400);
      const first = insertIncome(sqlite, m, 1200);
      const second = insertIncome(sqlite, m, 1000);

      await updateTransaction(
        db,
        first,
        incomeUpdate(m, 1200, [{ paymentId: payment, amount: 1200, expectMore: true }]),
      );
      expect(await advanceOf(db, payment)).toBe(2400);

      await updateTransaction(
        db,
        second,
        incomeUpdate(m, 1000, [{ paymentId: payment, amount: 1000, expectMore: false }]),
      );
      expect(await advanceOf(db, payment)).toBe(2200);
    });

    test("1 件の収入を複数の支出に配分して紐付ける", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const a = insertAdvancePayment(sqlite, m, 2000);
      const b = insertAdvancePayment(sqlite, m, 3500);
      const income = insertIncome(sqlite, m, 5000);

      const result = await updateTransaction(
        db,
        income,
        incomeUpdate(m, 5000, [
          { paymentId: a, amount: 1800, expectMore: false },
          { paymentId: b, amount: 3200, expectMore: false },
        ]),
      );

      expect(result).toEqual({ ok: true });
      expect(await advanceOf(db, a)).toBe(1800);
      expect(await advanceOf(db, b)).toBe(3200);
    });

    test("充てる額の和が収入の金額と合わなければ保存しない", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const payment = insertAdvancePayment(sqlite, m, 2400);
      const income = insertIncome(sqlite, m, 2000);

      const result = await updateTransaction(
        db,
        income,
        incomeUpdate(m, 2000, [{ paymentId: payment, amount: 1500, expectMore: false }]),
      );

      expect(result).toMatchObject({ ok: false, status: 400 });
      expect(await advanceOf(db, payment)).toBe(2400);
    });

    test("対象の品目の合計を超える収入は紐付けず、分けるよう案内する", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const payment = insertAdvancePayment(sqlite, m, 2400);
      const income = insertIncome(sqlite, m, 4000);

      const result = await updateTransaction(
        db,
        income,
        incomeUpdate(m, 4000, [{ paymentId: payment, amount: 4000, expectMore: false }]),
      );

      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining("収入を 2 件に分けて"),
      });
    });

    test("支出以外には紐付けない", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const other = insertIncome(sqlite, m, 1000);
      const income = insertIncome(sqlite, m, 1000);

      const result = await updateTransaction(
        db,
        income,
        incomeUpdate(m, 1000, [{ paymentId: other, amount: 1000, expectMore: false }]),
      );

      expect(result).toEqual({ ok: false, status: 400, error: "紐付ける支出が見つかりません" });
    });

    test("収入の金額を変えると、確定していた支出の立替額を上書きする", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const payment = insertAdvancePayment(sqlite, m, 2400);
      const income = insertIncome(sqlite, m, 2000);
      await updateTransaction(
        db,
        income,
        incomeUpdate(m, 2000, [{ paymentId: payment, amount: 2000, expectMore: false }]),
      );

      await updateTransaction(
        db,
        income,
        incomeUpdate(m, 1500, [{ paymentId: payment, amount: 1500, expectMore: false }]),
      );

      expect(await advanceOf(db, payment)).toBe(1500);
    });

    test("紐付けを省いて金額だけ変えると、和が合わないので保存しない", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const payment = insertAdvancePayment(sqlite, m, 2400);
      const income = insertIncome(sqlite, m, 2000);
      await updateTransaction(
        db,
        income,
        incomeUpdate(m, 2000, [{ paymentId: payment, amount: 2000, expectMore: false }]),
      );

      const result = await updateTransaction(db, income, incomeUpdate(m, 1500, undefined));

      expect(result).toMatchObject({ ok: false, status: 400 });
    });

    test("紐付けを外すと立替額はそのままで、集計の設定も変えない", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const payment = insertAdvancePayment(sqlite, m, 2400);
      const income = insertIncome(sqlite, m, 2000);
      await updateTransaction(
        db,
        income,
        incomeUpdate(m, 2000, [{ paymentId: payment, amount: 2000, expectMore: false }]),
      );

      await updateTransaction(db, income, {
        ...incomeUpdate(m, 2000, []),
        aggregation: "never",
      });

      expect(await advanceOf(db, payment)).toBe(2000);
      const saved = await getTransaction(db, income);
      expect(saved?.linkedPayments).toEqual([]);
      expect(saved?.aggregation).toBe("never");
    });
  });

  describe("削除", () => {
    test("収入を消すと紐付けが消え、支出の立替額はそのまま残る", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const payment = insertAdvancePayment(sqlite, m, 2400);
      const income = insertIncome(sqlite, m, 2000);
      await updateTransaction(
        db,
        income,
        incomeUpdate(m, 2000, [{ paymentId: payment, amount: 2000, expectMore: false }]),
      );

      expect(await deleteTransaction(db, income)).toMatchObject({ ok: true });

      const saved = await getTransaction(db, payment);
      expect(saved?.advanceAmount).toBe(2000);
      expect(saved?.linkedIncomes).toEqual([]);
    });

    test("収入が紐付いた支出は消さない", async () => {
      const { db, sqlite } = createTestLedgerDb();
      const m = seedMasters(sqlite);
      const payment = insertAdvancePayment(sqlite, m, 2400);
      const income = insertIncome(sqlite, m, 2000);
      await updateTransaction(
        db,
        income,
        incomeUpdate(m, 2000, [{ paymentId: payment, amount: 2000, expectMore: false }]),
      );

      expect(await deleteTransaction(db, payment)).toMatchObject({ ok: false, status: 400 });
      expect(await getTransaction(db, payment)).toBeDefined();
    });
  });
});

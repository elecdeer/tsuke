import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import type { LedgerDb } from "../db.ts";
import { createPayment } from "./payments.ts";
import {
  findRegisteredPayments,
  matchRegisteredPayments,
  type RegisteredPayment,
} from "./statements.ts";

const payment = (transactionId: number, date: string, amount: number): RegisteredPayment => ({
  transactionId,
  date,
  amount,
  placeName: null,
});

describe("matchRegisteredPayments", () => {
  test("金額が一致し、日付のずれが 2 日以内の支出を割り当てる", () => {
    const matches = matchRegisteredPayments(
      [
        { date: "2026-05-10", amount: 1000 },
        { date: "2026-05-10", amount: 2000 },
        { date: "2026-05-10", amount: 3000 },
      ],
      [
        payment(1, "2026-05-12", 1000),
        payment(2, "2026-05-13", 2000),
        payment(3, "2026-05-10", 3500),
      ],
    );

    expect(matches.map((match) => match?.transactionId ?? null)).toEqual([1, null, null]);
  });

  test("1 件の支出は 1 行にしか割り当てず、日付のずれが小さい行を優先する", () => {
    const matches = matchRegisteredPayments(
      [
        { date: "2026-05-08", amount: 500 },
        { date: "2026-05-10", amount: 500 },
      ],
      [payment(1, "2026-05-10", 500)],
    );

    expect(matches.map((match) => match?.transactionId ?? null)).toEqual([null, 1]);
  });

  test("同じ日に同額の利用が 2 回あれば、登録済みの支出の数だけ割り当てる", () => {
    const matches = matchRegisteredPayments(
      [
        { date: "2026-05-10", amount: 500 },
        { date: "2026-05-10", amount: 500 },
      ],
      [payment(1, "2026-05-10", 500)],
    );

    expect(matches.map((match) => match?.transactionId ?? null)).toEqual([1, null]);
  });
});

describe("findRegisteredPayments", () => {
  let db: LedgerDb;
  let sqlite: DatabaseSync;
  let groceryId: number;

  beforeEach(() => {
    ({ db, sqlite } = createTestLedgerDb());
    const foodId = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
    groceryId = insert(
      sqlite,
      "INSERT INTO genres (category_id, name) VALUES (?, '食料品')",
      foodId,
    );
  });

  test("取引の品目の合計を明細の金額と比べ、店舗名とともに返す", async () => {
    await createPayment(db, {
      date: "2026-05-10",
      fromAccountId: null,
      placeName: "スーパーA",
      items: [
        { genreId: groceryId, name: "牛乳", memo: null, amount: 1200 },
        { genreId: groceryId, name: "値引き", memo: null, amount: -200 },
      ],
    });

    const matches = await findRegisteredPayments(db, [
      { date: "2026-05-11", amount: 1000 },
      { date: "2026-05-11", amount: 1200 },
    ]);

    expect(matches).toEqual([
      { transactionId: 1, date: "2026-05-10", amount: 1000, placeName: "スーパーA" },
      null,
    ]);
  });

  test("支出以外の取引と、日付が 2 日より離れた取引は割り当てない", async () => {
    const transferId = insert(
      sqlite,
      "INSERT INTO transactions (date, mode, source) VALUES ('2026-05-10', 'transfer', 'zaim_csv')",
    );
    sqlite
      .prepare(
        "INSERT INTO transaction_items (transaction_id, genre_id, amount) VALUES (?, ?, 1000)",
      )
      .run(transferId, groceryId);
    await createPayment(db, {
      date: "2026-05-01",
      fromAccountId: null,
      placeName: null,
      items: [{ genreId: groceryId, name: null, memo: null, amount: 1000 }],
    });

    expect(await findRegisteredPayments(db, [{ date: "2026-05-10", amount: 1000 }])).toEqual([
      null,
    ]);
  });

  test("行がなければ DB を読まずに空を返す", async () => {
    expect(await findRegisteredPayments(db, [])).toEqual([]);
  });
});

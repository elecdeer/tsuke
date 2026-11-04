import type { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import { listReimbursementCandidates } from "./reimbursements.ts";

/**
 * 支出を入れる。advance は立替額。
 */
const insertPayment = (
  sqlite: DatabaseSync,
  params: { date: string; advance?: number; placeId?: number; itemName?: string },
): number => {
  const id = insert(
    sqlite,
    "INSERT INTO transactions (date, mode, place_id, source, advance_amount) VALUES (?, 'payment', ?, 'manual', ?)",
    params.date,
    params.placeId ?? null,
    params.advance ?? 0,
  );
  insert(
    sqlite,
    "INSERT INTO transaction_items (transaction_id, name, amount) VALUES (?, ?, 3000)",
    id,
    params.itemName ?? null,
  );
  return id;
};

/**
 * 収入を入れる。
 */
const insertIncome = (sqlite: DatabaseSync): number =>
  insert(
    sqlite,
    "INSERT INTO transactions (date, mode, source) VALUES ('2026-10-20', 'income', 'manual')",
  );

/**
 * 収入を支出に紐付ける。
 */
const link = (sqlite: DatabaseSync, payment: number, income: number, amount: number): number =>
  insert(
    sqlite,
    "INSERT INTO advance_reimbursements (payment_transaction_id, income_transaction_id, amount) VALUES (?, ?, ?)",
    payment,
    income,
    amount,
  );

describe("listReimbursementCandidates", () => {
  test("未入金の残りがある支出を新しい順に先に出し、他の支出を続ける", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const income = insertIncome(sqlite);
    const noAdvance = insertPayment(sqlite, { date: "2026-10-05" });
    const older = insertPayment(sqlite, { date: "2026-09-01", advance: 1000 });
    const newer = insertPayment(sqlite, { date: "2026-10-01", advance: 1000 });

    const candidates = await listReimbursementCandidates(db, income);

    expect(candidates.map((candidate) => candidate.paymentId)).toEqual([newer, older, noAdvance]);
  });

  test("支出以外の取引は出さない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const income = insertIncome(sqlite);

    expect(await listReimbursementCandidates(db, income)).toEqual([]);
  });

  test("金額の情報を返し、otherLinked にはこの収入の分を入れない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const income = insertIncome(sqlite);
    const other = insertIncome(sqlite);
    const payment = insertPayment(sqlite, { date: "2026-10-01", advance: 2000, itemName: "夕食" });
    link(sqlite, payment, income, 500);
    link(sqlite, payment, other, 300);

    expect(await listReimbursementCandidates(db, income)).toEqual([
      {
        paymentId: payment,
        date: "2026-10-01",
        title: "夕食",
        total: 3000,
        advanceAmount: 2000,
        advanceLimit: 3000,
        otherLinked: 300,
        searchText: "夕食",
      },
    ]);
  });

  test("店舗と品目の名前を探す文字列にまとめる", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const income = insertIncome(sqlite);
    const place = insert(sqlite, "INSERT INTO places (name) VALUES ('居酒屋')");
    insertPayment(sqlite, { date: "2026-10-01", placeId: place, itemName: "会費" });

    const [candidate] = await listReimbursementCandidates(db, income);

    expect(candidate?.title).toBe("居酒屋");
    expect(candidate?.searchText).toBe("居酒屋 会費");
  });
});

describe("advance_reimbursements", () => {
  test("取り込みの総入れ替えを止めず、消えた取引の紐付けも消える", () => {
    const { sqlite } = createTestLedgerDb();
    const income = insertIncome(sqlite);
    const payment = insertPayment(sqlite, { date: "2026-10-01", advance: 1000 });
    link(sqlite, payment, income, 500);
    sqlite.prepare("UPDATE transactions SET source = 'zaim_csv' WHERE id = ?").run(payment);

    sqlite.exec("DELETE FROM transactions WHERE source = 'zaim_csv'");

    expect(sqlite.prepare("SELECT count(*) AS count FROM advance_reimbursements").get()).toEqual({
      count: 0,
    });
  });
});

import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import { AccountUpdateSchema, updateAccount } from "./accounts.ts";
import { listAccounts, listAccountsWithHint } from "./masters.ts";

describe("updateAccount", () => {
  test("ヒントを保存する", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO accounts (name) VALUES ('楽天カード')");

    expect(await updateAccount(db, id, { aiHint: "VISA 1234 はこのカード" })).toEqual({ ok: true });

    expect(await listAccountsWithHint(db)).toEqual([
      { id, name: "楽天カード", aiHint: "VISA 1234 はこのカード" },
    ]);
  });

  test("空のヒントを保存すると消す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO accounts (name, ai_hint) VALUES ('財布', '現金のとき')");

    expect(await updateAccount(db, id, { aiHint: "" })).toEqual({ ok: true });

    expect(await listAccountsWithHint(db)).toEqual([{ id, name: "財布", aiHint: null }]);
  });

  test("口座がなければ 404 を返す", async () => {
    const { db } = createTestLedgerDb();

    expect(await updateAccount(db, 1, { aiHint: "ヒント" })).toEqual({
      ok: false,
      status: 404,
      error: "口座が見つかりません",
    });
  });
});

describe("AccountUpdateSchema", () => {
  test("ヒントの前後の空白を取り除く", () => {
    expect(v.parse(AccountUpdateSchema, { aiHint: "  ヒント \n" })).toEqual({ aiHint: "ヒント" });
  });

  test("500 文字を超えるヒントは受け付けない", () => {
    expect(v.safeParse(AccountUpdateSchema, { aiHint: "あ".repeat(500) }).success).toBe(true);
    expect(v.safeParse(AccountUpdateSchema, { aiHint: "あ".repeat(501) }).success).toBe(false);
  });
});

describe("listAccountsWithHint", () => {
  test("アーカイブしていない口座をヒントを付けて sort、id の順で返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insert(sqlite, "INSERT INTO accounts (name, sort) VALUES ('銀行', 2)");
    insert(sqlite, "INSERT INTO accounts (name, sort, ai_hint) VALUES ('財布', 1, '現金のとき')");
    insert(sqlite, "INSERT INTO accounts (name, sort, archived) VALUES ('解約した口座', 0, 1)");

    expect(await listAccountsWithHint(db)).toEqual([
      { id: 2, name: "財布", aiHint: "現金のとき" },
      { id: 1, name: "銀行", aiHint: null },
    ]);
  });

  test("listAccounts の結果にはヒントを含めない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO accounts (name, ai_hint) VALUES ('財布', '現金のとき')");

    expect(await listAccounts(db)).toEqual([{ id, name: "財布" }]);
  });
});

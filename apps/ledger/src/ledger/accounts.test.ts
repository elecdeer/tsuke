import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import {
  AccountUpdateSchema,
  createAccount,
  moveAccount,
  setAccountArchived,
  updateAccount,
} from "./accounts.ts";
import { listAccounts, listAccountsWithHint, listManagedAccounts } from "./masters.ts";

describe("updateAccount", () => {
  test("ヒントを保存する", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO accounts (name) VALUES ('楽天カード')");

    expect(
      await updateAccount(db, id, { name: "楽天カード", aiHint: "VISA 1234 はこのカード" }),
    ).toEqual({ ok: true });

    expect(await listAccountsWithHint(db)).toEqual([
      { id, name: "楽天カード", aiHint: "VISA 1234 はこのカード" },
    ]);
  });

  test("空のヒントを保存すると消す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO accounts (name, ai_hint) VALUES ('財布', '現金のとき')");

    expect(await updateAccount(db, id, { name: "財布", aiHint: "" })).toEqual({ ok: true });

    expect(await listAccountsWithHint(db)).toEqual([{ id, name: "財布", aiHint: null }]);
  });

  test("口座がなければ 404 を返す", async () => {
    const { db } = createTestLedgerDb();

    expect(await updateAccount(db, 1, { name: "財布", aiHint: "ヒント" })).toEqual({
      ok: false,
      status: 404,
      error: "口座が見つかりません",
    });
  });
});

describe("AccountUpdateSchema", () => {
  test("空の口座名は受け付けない", () => {
    expect(v.safeParse(AccountUpdateSchema, { name: "  ", aiHint: "" }).success).toBe(false);
  });

  test("ヒントの前後の空白を取り除く", () => {
    expect(v.parse(AccountUpdateSchema, { name: " 財布 ", aiHint: "  ヒント \n" })).toEqual({
      name: "財布",
      aiHint: "ヒント",
    });
  });

  test("500 文字を超えるヒントは受け付けない", () => {
    expect(
      v.safeParse(AccountUpdateSchema, { name: "財布", aiHint: "あ".repeat(500) }).success,
    ).toBe(true);
    expect(
      v.safeParse(AccountUpdateSchema, { name: "財布", aiHint: "あ".repeat(501) }).success,
    ).toBe(false);
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

describe("createAccount", () => {
  test("並びの最後に追加し、空のヒントは持たない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insert(sqlite, "INSERT INTO accounts (name, sort) VALUES ('財布', 3)");

    expect(await createAccount(db, { name: "新しいカード", aiHint: "" })).toEqual({ ok: true });

    expect(await listAccountsWithHint(db)).toEqual([
      expect.objectContaining({ name: "財布" }),
      expect.objectContaining({ name: "新しいカード", aiHint: null }),
    ]);
  });

  test("同じ名前の口座があれば 409 を返す", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insert(sqlite, "INSERT INTO accounts (name) VALUES ('財布')");

    expect(await createAccount(db, { name: "財布", aiHint: "" })).toEqual({
      ok: false,
      status: 409,
      error: "「財布」はすでにあります",
    });
  });

  test("同じ名前の口座がアーカイブ済みなら、元に戻すよう案内する", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insert(sqlite, "INSERT INTO accounts (name, archived) VALUES ('財布', 1)");

    expect(await createAccount(db, { name: "財布", aiHint: "" })).toEqual({
      ok: false,
      status: 409,
      error: "「財布」はアーカイブ済みです。元に戻して使ってください",
    });
  });
});

describe("updateAccount の名前の変更", () => {
  test("名前を変えられ、同じ名前のままでも保存できる", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO accounts (name) VALUES ('財布')");

    expect(await updateAccount(db, id, { name: "財布", aiHint: "" })).toEqual({ ok: true });
    expect(await updateAccount(db, id, { name: "現金", aiHint: "" })).toEqual({ ok: true });

    expect(await listAccounts(db)).toEqual([{ id, name: "現金" }]);
  });

  test("別の口座と同じ名前にはできない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insert(sqlite, "INSERT INTO accounts (name) VALUES ('財布')");
    const id = insert(sqlite, "INSERT INTO accounts (name) VALUES ('銀行')");

    expect(await updateAccount(db, id, { name: "財布", aiHint: "" })).toMatchObject({
      ok: false,
      status: 409,
    });
  });
});

describe("setAccountArchived", () => {
  const addIncome = (sqlite: ReturnType<typeof createTestLedgerDb>["sqlite"], to: number) => {
    const transactionId = insert(
      sqlite,
      "INSERT INTO transactions (date, mode, to_account_id, source) VALUES ('2026-01-01', 'income', ?, 'manual')",
      to,
    );
    insert(
      sqlite,
      "INSERT INTO transaction_items (transaction_id, amount) VALUES (?, 1500)",
      transactionId,
    );
  };

  test("残高が 0 の口座をアーカイブすると候補から外れ、元に戻すと候補に戻る", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO accounts (name) VALUES ('解約するカード')");

    expect(await setAccountArchived(db, id, true)).toEqual({ ok: true });
    expect(await listAccounts(db)).toEqual([]);
    expect(await listManagedAccounts(db)).toEqual([
      { id, name: "解約するカード", aiHint: null, archived: true },
    ]);

    expect(await setAccountArchived(db, id, false)).toEqual({ ok: true });
    expect(await listAccounts(db)).toEqual([{ id, name: "解約するカード" }]);
  });

  test("残高のある口座はアーカイブできない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO accounts (name) VALUES ('銀行')");
    addIncome(sqlite, id);

    expect(await setAccountArchived(db, id, true)).toEqual({
      ok: false,
      status: 409,
      error: "残高が 1,500 円あります。残高調整で 0 にしてからアーカイブしてください",
    });
    expect(await listAccounts(db)).toEqual([{ id, name: "銀行" }]);
  });

  test("残高があってアーカイブ済みの口座も元に戻せる", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO accounts (name, archived) VALUES ('銀行', 1)");
    addIncome(sqlite, id);

    expect(await setAccountArchived(db, id, false)).toEqual({ ok: true });
  });

  test("口座がなければ 404 を返す", async () => {
    const { db } = createTestLedgerDb();

    expect(await setAccountArchived(db, 1, true)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("moveAccount", () => {
  test("sort がすべて同じ口座でも順番を入れ替えられる", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const a = insert(sqlite, "INSERT INTO accounts (name) VALUES ('A')");
    const b = insert(sqlite, "INSERT INTO accounts (name) VALUES ('B')");
    const c = insert(sqlite, "INSERT INTO accounts (name) VALUES ('C')");

    expect(await moveAccount(db, c, -1)).toEqual({ ok: true });

    expect((await listAccounts(db)).map((account) => account.id)).toEqual([a, c, b]);
  });

  test("アーカイブ済みの口座は動かせない", async () => {
    const { db, sqlite } = createTestLedgerDb();
    const id = insert(sqlite, "INSERT INTO accounts (name, archived) VALUES ('A', 1)");

    expect(await moveAccount(db, id, 1)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("listManagedAccounts", () => {
  test("アーカイブ済みの口座を並びの後ろに含める", async () => {
    const { db, sqlite } = createTestLedgerDb();
    insert(sqlite, "INSERT INTO accounts (name, sort, archived) VALUES ('解約', 0, 1)");
    insert(sqlite, "INSERT INTO accounts (name, sort) VALUES ('銀行', 5)");

    expect((await listManagedAccounts(db)).map((account) => account.name)).toEqual([
      "銀行",
      "解約",
    ]);
  });
});

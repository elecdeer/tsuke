import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, type CallToolResult } from "@modelcontextprotocol/server";
import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import { listManagedAccounts } from "../ledger/masters.ts";
import { getTransaction } from "../ledger/transactionEdit.ts";
import { createLedgerMcpServer } from "./server.ts";

/**
 * テスト用の DB と、その DB を読み書きする MCP サーバーにつないだクライアントを作る。
 */
const setup = async () => {
  const { db, sqlite } = createTestLedgerDb();
  const deletedKeys: string[] = [];
  const storage = {
    delete: async (key: string) => {
      deletedKeys.push(key);
    },
  };
  const server = createLedgerMcpServer({ db, storage });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { db, sqlite, client, deletedKeys };
};

/**
 * tool の結果の最初のテキストを返す。
 */
const textOf = (result: CallToolResult): string => {
  const [first] = result.content;
  if (first?.type !== "text") throw new Error("text content expected");
  return first.text;
};

/**
 * tool の結果の最初のテキストを JSON として読む。
 */
const jsonOf = (result: CallToolResult): unknown => JSON.parse(textOf(result));

describe("tools/list", () => {
  test("参照・取引・マスタ編集の tool を JSON Schema 付きで返す", async () => {
    const { client } = await setup();

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [
        "list_accounts",
        "list_categories",
        "list_places",
        "list_transactions",
        "get_transaction",
        "get_summary",
        "get_balances",
        "create_transaction",
        "update_transaction",
        "delete_transaction",
        "create_account",
        "update_account",
        "set_account_archived",
        "move_account",
        "create_category",
        "rename_category",
        "set_category_archived",
        "move_category",
        "create_genre",
        "rename_genre",
        "set_genre_archived",
        "move_genre",
        "change_genre_category",
        "update_place",
        "merge_place",
        "delete_place",
      ].sort(),
    );
  });

  test("v.trim のような JSON Schema にできないアクションを含むスキーマも、入力の形を書き出す", async () => {
    const { client } = await setup();

    const { tools } = await client.listTools();
    const createTransaction = tools.find((tool) => tool.name === "create_transaction");

    expect(createTransaction?.inputSchema).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["date", "mode", "items"]),
      properties: {
        mode: { enum: ["payment", "income", "transfer", "adjustment"] },
        items: { type: "array", minItems: 1 },
      },
    });
  });

  test("参照の tool は readOnlyHint、削除の tool は destructiveHint を持つ", async () => {
    const { client } = await setup();

    const { tools } = await client.listTools();
    const annotationsOf = (name: string) => tools.find((tool) => tool.name === name)?.annotations;

    expect(annotationsOf("list_transactions")).toMatchObject({ readOnlyHint: true });
    expect(annotationsOf("delete_transaction")).toMatchObject({ destructiveHint: true });
    expect(annotationsOf("create_transaction")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
  });
});

describe("取引の tool", () => {
  test("登録した取引を一覧と詳細で読める", async () => {
    const { db, sqlite, client } = await setup();
    const wallet = insert(sqlite, "INSERT INTO accounts (name) VALUES ('財布')");
    const food = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");

    const created = await client.callTool({
      name: "create_transaction",
      arguments: {
        date: "2026-11-03",
        mode: "payment",
        aggregation: "always",
        fromAccountId: wallet,
        toAccountId: null,
        placeName: "スーパー",
        items: [{ categoryId: food, genreId: null, name: "  牛乳  ", memo: null, amount: 250 }],
      },
    });

    expect(created.isError).toBeFalsy();
    const { id } = v.parse(v.object({ id: v.number() }), jsonOf(created));
    expect(await getTransaction(db, id)).toMatchObject({
      date: "2026-11-03",
      placeName: "スーパー",
      // valibot の v.trim が tool の入力にも効く
      items: [{ name: "牛乳", amount: 250 }],
    });

    const listed = await client.callTool({
      name: "list_transactions",
      arguments: { period: "2026-11" },
    });
    expect(jsonOf(listed)).toMatchObject([{ id, total: 250, fromAccountName: "財布" }]);
  });

  test("種類の決まりに合わない登録は、理由をエラーの結果で返す", async () => {
    const { sqlite, client } = await setup();
    const wallet = insert(sqlite, "INSERT INTO accounts (name) VALUES ('財布')");

    const result = await client.callTool({
      name: "create_transaction",
      arguments: {
        date: "2026-11-03",
        mode: "transfer",
        aggregation: "always",
        fromAccountId: wallet,
        toAccountId: null,
        placeName: null,
        items: [{ categoryId: null, genreId: null, name: null, memo: null, amount: 1000 }],
      },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("振替には支払元と入金先の両方を指定してください");
  });

  test("スキーマに合わない入力は、検証のエラーを返す", async () => {
    const { client } = await setup();

    const result = await client.callTool({
      name: "get_summary",
      arguments: { period: "2026/11" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("期間は YYYY-MM か YYYY で指定してください");
  });

  test("取引を消すと、レシートの写真も消す", async () => {
    const { db, sqlite, client, deletedKeys } = await setup();
    const wallet = insert(sqlite, "INSERT INTO accounts (name) VALUES ('財布')");
    const id = insert(
      sqlite,
      "INSERT INTO transactions (date, mode, from_account_id, receipt_image_key, source) VALUES ('2026-11-03', 'payment', ?, 'receipts/1.webp', 'manual')",
      wallet,
    );

    const result = await client.callTool({ name: "delete_transaction", arguments: { id } });

    expect(jsonOf(result)).toEqual({ ok: true });
    expect(await getTransaction(db, id)).toBeUndefined();
    expect(deletedKeys).toEqual(["receipts/1.webp"]);
  });

  test("ない取引の詳細は、エラーの結果を返す", async () => {
    const { client } = await setup();

    const result = await client.callTool({ name: "get_transaction", arguments: { id: 1 } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("取引が見つかりません");
  });
});

describe("マスタの tool", () => {
  test("口座を追加して名前を変える", async () => {
    const { db, client } = await setup();

    await client.callTool({
      name: "create_account",
      arguments: { name: "楽天カード", aiHint: "", transferAsPayment: false },
    });
    const [account] = await listManagedAccounts(db);
    const result = await client.callTool({
      name: "update_account",
      arguments: {
        id: account?.id,
        name: "楽天カード（家族）",
        aiHint: "",
        transferAsPayment: false,
      },
    });

    expect(jsonOf(result)).toEqual({ ok: true });
    expect(await listManagedAccounts(db)).toMatchObject([{ name: "楽天カード（家族）" }]);
  });

  test("カテゴリと内訳を追加すると、一覧に出る", async () => {
    const { client } = await setup();

    await client.callTool({
      name: "create_category",
      arguments: { mode: "payment", name: "食費" },
    });
    const [category] = v.parse(
      v.array(v.object({ id: v.number() })),
      jsonOf(await client.callTool({ name: "list_categories", arguments: { mode: "payment" } })),
    );
    await client.callTool({
      name: "create_genre",
      arguments: { categoryId: category?.id, name: "外食" },
    });

    expect(
      jsonOf(await client.callTool({ name: "list_categories", arguments: { mode: "payment" } })),
    ).toMatchObject([
      { name: "食費", archived: false, genres: [{ name: "外食", archived: false }] },
    ]);
  });

  test("使われている店舗は消せない", async () => {
    const { sqlite, client } = await setup();
    const wallet = insert(sqlite, "INSERT INTO accounts (name) VALUES ('財布')");
    const store = insert(sqlite, "INSERT INTO places (name) VALUES ('スーパー')");
    insert(
      sqlite,
      "INSERT INTO transactions (date, mode, from_account_id, place_id, source) VALUES ('2026-11-03', 'payment', ?, ?, 'manual')",
      wallet,
      store,
    );

    const result = await client.callTool({ name: "delete_place", arguments: { id: store } });

    expect(result.isError).toBe(true);
  });
});

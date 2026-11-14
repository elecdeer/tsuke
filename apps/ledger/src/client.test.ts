import { describe, expect, test, vi } from "vite-plus/test";
import { createLedgerClient, LedgerFetchError } from "./client.ts";

/**
 * 呼び出された Request を記録し、指定したレスポンスを返す fetch を作る。
 */
const createFetchMock = (response: Response) => vi.fn<typeof fetch>(async () => response);

describe("createLedgerClient", () => {
  test("GET はベース URL にパスをつないで呼び、JSON を返す", async () => {
    const fetchMock = createFetchMock(Response.json({ accounts: [{ id: 1, name: "財布" }] }));
    const call = createLedgerClient("https://ledger.example.com", fetchMock);

    const result = await call("/api/accounts", "GET");

    expect(result).toEqual({ accounts: [{ id: 1, name: "財布" }] });
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://ledger.example.com/api/accounts"), {
      method: "GET",
    });
  });

  test("body を渡すと JSON として送る", async () => {
    const fetchMock = createFetchMock(Response.json({ duplicates: [] }));
    const call = createLedgerClient("https://ledger.example.com", fetchMock);
    const body = { date: "2026-10-27", amount: 200, placeName: "スーパー" };

    await call("/api/transactions/duplicates", "POST", { body });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://ledger.example.com/api/transactions/duplicates"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  });

  test("2xx 以外ならステータスと本文を持つ LedgerFetchError を投げる", async () => {
    const fetchMock = createFetchMock(Response.json({ error: "Unauthorized" }, { status: 401 }));
    const call = createLedgerClient("https://ledger.example.com", fetchMock);

    const error = await call("/me", "GET").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LedgerFetchError);
    expect(error).toMatchObject({ status: 401, data: { error: "Unauthorized" } });
  });

  test("本文のない 2xx は undefined を返す", async () => {
    const fetchMock = createFetchMock(new Response(null, { status: 204 }));
    const call = createLedgerClient("https://ledger.example.com", fetchMock);

    await expect(call("/me", "GET")).resolves.toBeUndefined();
  });
});

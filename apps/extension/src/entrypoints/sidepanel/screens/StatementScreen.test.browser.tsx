import type { LedgerInput } from "ledger/client";
import { http, HttpResponse } from "msw";
import { describe, expect } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import { test } from "../../../test-utils/browser-test.ts";
import { mockUrl, statementHandlers } from "../../../test-utils/ledgerMocks.ts";
import { Default } from "./StatementScreen.stories";

const commonHandlers = statementHandlers;

type PaymentBody = LedgerInput<"/api/transactions", "POST">["body"];

/** 登録リクエストの body を記録し、`failOnCall` 回目だけ 500 を返すハンドラー */
const recordPaymentHandler = (failOnCall?: number) => {
  const bodies: PaymentBody[] = [];
  const handler = http.post<never, PaymentBody>(
    mockUrl("/api/transactions"),
    async ({ request }) => {
      bodies.push(await request.json());
      if (bodies.length === failOnCall) {
        return HttpResponse.json({ error: "登録できませんでした" }, { status: 500 });
      }
      return HttpResponse.json({ id: 999 });
    },
  );
  return { handler, bodies };
};

/** 利用先名で行を特定し、その行の店舗欄を返す */
const storeOf = (place: string) =>
  page.getByRole("listitem").filter({ hasText: place }).getByRole("combobox", { name: "店舗" });

const extract = async () => {
  await page.getByRole("button", { name: "このページの明細を読み取る" }).click();
  await expect.element(page.getByText("JR東日本")).toBeVisible();
};

describe("StatementScreen", () => {
  test("読み取ると明細行を表示し、登録済みの行は選択を外す", async ({ worker }) => {
    worker.use(...commonHandlers);
    await render(<Default.Component />);

    await extract();

    await expect
      .element(page.getByRole("checkbox", { name: "ｽｰﾊﾟｰA（5/1）を登録する" }))
      .toBeChecked();
    await expect
      .element(page.getByRole("checkbox", { name: "JR東日本（5/2）を登録する" }))
      .not.toBeChecked();
    await expect.element(page.getByText("登録済み 5/2")).toBeVisible();
    // AI が推測した既存店舗が選ばれ、推測できなかった行は未選択
    await expect.element(storeOf("ｽｰﾊﾟｰA")).toHaveValue("スーパーA");
    await expect.element(storeOf("カフェC")).toHaveValue("");
    await expect
      .element(page.getByRole("status").filter({ hasText: "件読み取りました" }))
      .toHaveTextContent(
        "3件読み取りました（うち1件は登録済みのため選択を外しました）。日付・金額を読み取れなかった1件は除外しました",
      );
    await expect.element(page.getByRole("button", { name: "2件を登録" })).toBeEnabled();
  });

  test("選択した行だけを読み取った口座で登録し、店舗に紐付かない利用先は品名にする", async ({
    worker,
  }) => {
    const { handler, bodies } = recordPaymentHandler();
    worker.use(handler, ...commonHandlers);
    await render(<Default.Component />);
    await extract();

    await page.getByRole("button", { name: "2件を登録" }).click();

    await expect
      .element(page.getByRole("status").filter({ hasText: "2件登録しました" }))
      .toBeInTheDocument();
    expect(bodies).toEqual([
      {
        date: "2026-05-01",
        fromAccountId: 2,
        placeName: "スーパーA",
        items: [
          {
            genreId: 1001,
            name: null,
            memo: null,
            amount: 1200,
            aiGuess: { genreId: 1001, name: "ｽｰﾊﾟｰA" },
          },
        ],
        aiRead: { source: "statement", model: "test-model" },
      },
      {
        date: "2026-05-03",
        fromAccountId: 2,
        placeName: null,
        items: [
          {
            genreId: 1002,
            name: "カフェC",
            memo: null,
            amount: 450,
            aiGuess: { genreId: 1002, name: "カフェC" },
          },
        ],
        aiRead: { source: "statement", model: "test-model" },
      },
    ]);
    expect(page.getByText("登録しました", { exact: true }).all().length).toBe(2);
    await expect.element(page.getByRole("button", { name: "0件を登録" })).toBeDisabled();
  });

  test("登録済みと判定された行も選択し直せば登録できる", async ({ worker }) => {
    const { handler, bodies } = recordPaymentHandler();
    worker.use(handler, ...commonHandlers);
    await render(<Default.Component />);
    await extract();

    await page.getByRole("checkbox", { name: "JR東日本（5/2）を登録する" }).click();
    await page.getByRole("button", { name: "3件を登録" }).click();

    await expect
      .element(page.getByRole("status").filter({ hasText: "3件登録しました" }))
      .toBeInTheDocument();
    expect(bodies.map((body) => body.items[0]?.amount)).toEqual([1200, 300, 450]);
  });

  test("途中で登録に失敗するとエラーを表示し、登録できた行は選択から外れる", async ({ worker }) => {
    const { handler } = recordPaymentHandler(2);
    worker.use(handler, ...commonHandlers);
    await render(<Default.Component />);
    await extract();

    await page.getByRole("button", { name: "2件を登録" }).click();

    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("「カフェC」の登録に失敗しました（500）");
    await expect
      .element(page.getByRole("checkbox", { name: "ｽｰﾊﾟｰA（5/1）を登録する" }))
      .not.toBeChecked();
    await expect
      .element(page.getByRole("checkbox", { name: "カフェC（5/3）を登録する" }))
      .toBeChecked();
    await expect.element(page.getByRole("button", { name: "1件を登録" })).toBeEnabled();
  });

  test("行ごとに店舗を選び直して登録できる", async ({ worker }) => {
    const { handler, bodies } = recordPaymentHandler();
    worker.use(handler, ...commonHandlers);
    await render(<Default.Component />);
    await extract();

    await page
      .getByRole("listitem")
      .filter({ hasText: "ｽｰﾊﾟｰA" })
      .getByRole("button", { name: "クリア" })
      .click();
    await storeOf("カフェC").click();
    await page.getByRole("option", { name: "カフェC 駅前店" }).click();
    await page.getByRole("button", { name: "2件を登録" }).click();

    await expect
      .element(page.getByRole("status").filter({ hasText: "2件登録しました" }))
      .toBeInTheDocument();
    expect(bodies.map(({ placeName, items }) => ({ placeName, name: items[0]?.name }))).toEqual([
      { placeName: null, name: "ｽｰﾊﾟｰA" },
      { placeName: "カフェC 駅前店", name: null },
    ]);
  });
});

import type { LedgerInput, LedgerOutput } from "ledger/client";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import type { collectFromActiveTab } from "../../../page-collector/collectFromActiveTab.ts";
import { test } from "../../../test-utils/browser-test.ts";
import { masterHandlers, mockUrl, noDuplicatesHandler } from "../../../test-utils/ledgerMocks.ts";
import { Default } from "./MainScreen.stories";

vi.mock("../../../page-collector/collectFromActiveTab.ts", () => ({
  collectFromActiveTab: vi.fn<typeof collectFromActiveTab>(async () => ({
    ok: true,
    url: "https://shop.example.com/order/1",
    title: "ご注文ありがとうございます",
    ariaSnapshot: "heading: ご注文内容",
    ariaTree: { role: "heading", name: "ご注文内容", children: [] },
    collectedAt: "2024-01-10T12:00:00.000Z",
  })),
}));

type PaymentBody = LedgerInput<"/api/transactions", "POST">["body"];
type DuplicatesResponse = LedgerOutput<"/api/transactions/duplicates", "POST">;

const commonHandlers = masterHandlers;

/** 登録のリクエストの本文を記録し、登録できたことにする */
const recordPayment = (onBody: (body: PaymentBody) => void) =>
  http.post<never, PaymentBody>(mockUrl("/api/transactions"), async ({ request }) => {
    onBody(await request.json());
    return HttpResponse.json({ id: 999 });
  });

/** 1 品目目に重複の候補を返す */
const duplicateHandler = http.post(mockUrl("/api/transactions/duplicates"), () => {
  const response: DuplicatesResponse = {
    duplicates: [[{ transactionId: 1, date: "2024-01-09", amount: 1000, placeName: "スーパーA" }]],
  };
  return HttpResponse.json(response);
});

const withoutNoDuplicates = commonHandlers.filter((h) => h !== noDuplicatesHandler);

/** 編集モーダルを開いて 金額・カテゴリを入力し閉じる共通セットアップ（1行目） */
const fillMinimumForm = async () => {
  await page.getByRole("button", { name: "品名を編集" }).click();
  await page.getByRole("spinbutton", { name: "金額" }).fill("1000");
  await page.getByRole("combobox", { name: "カテゴリ" }).click();
  await page.getByRole("option", { name: "食料品" }).click();
  await page.getByRole("button", { name: "完了" }).click();
};

describe("MainScreen", () => {
  test("初期状態で登録ボタンが無効", async ({ worker }) => {
    worker.use(...commonHandlers);

    await render(<Default.Component />);

    await expect.element(page.getByRole("button", { name: "登録" })).toBeDisabled();
  });

  test("金額を入力すると合計が更新される", async ({ worker }) => {
    worker.use(...commonHandlers);

    await render(<Default.Component />);

    await page.getByRole("button", { name: "金額を編集" }).click();
    await page.getByRole("spinbutton", { name: "金額" }).fill("1000");
    await page.getByRole("button", { name: "完了" }).click();

    await expect.element(page.getByText("1,000").last()).toBeVisible();
  });

  test("品目を追加ボタンで入力行が増える", async ({ worker }) => {
    worker.use(...commonHandlers);

    await render(<Default.Component />);

    // 初期は 1 行
    await expect.element(page.getByRole("button", { name: "品目を削除" })).toBeVisible();
    expect(page.getByRole("button", { name: "品目を削除" }).all().length).toBe(1);

    await page.getByRole("button", { name: "品目を追加" }).click();

    expect(page.getByRole("button", { name: "品目を削除" }).all().length).toBe(2);
  });

  test("品目を削除すると行が減り合計がリセットされる", async ({ worker }) => {
    worker.use(...commonHandlers);

    await render(<Default.Component />);

    await page.getByRole("button", { name: "金額を編集" }).click();
    await page.getByRole("spinbutton", { name: "金額" }).fill("1000");
    await page.getByRole("button", { name: "完了" }).click();
    await expect.element(page.getByText("1,000").last()).toBeVisible();

    await page.getByRole("button", { name: "品目を削除" }).click();

    await expect.element(page.getByText("0円", { exact: true })).toBeVisible();
  });

  test("カテゴリと金額を入力すると登録ボタンが有効になる", async ({ worker }) => {
    worker.use(...commonHandlers);

    await render(<Default.Component />);

    await fillMinimumForm();

    await expect.element(page.getByRole("button", { name: "登録" })).toBeEnabled();
  });

  test("登録ボタン押下で取引の登録 API が 1 回呼ばれる", async ({ worker }) => {
    const postHandler = vi.fn<(body: PaymentBody) => void>();
    worker.use(...commonHandlers, recordPayment(postHandler));

    await render(<Default.Component />);

    await fillMinimumForm();
    await page.getByRole("button", { name: "登録" }).click();

    await vi.waitFor(() => {
      expect(postHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAccountId: null,
          placeName: null,
          items: [{ genreId: 1001, name: null, memo: null, amount: 1000 }],
        }),
      );
    });
    expect(postHandler).toHaveBeenCalledTimes(1);
  });

  test("選んだ店舗は店舗名で送る", async ({ worker }) => {
    const postHandler = vi.fn<(body: PaymentBody) => void>();
    worker.use(...commonHandlers, recordPayment(postHandler));

    await render(<Default.Component />);

    await page.getByRole("combobox", { name: "店舗" }).click();
    await page.getByRole("option", { name: "コンビニB" }).click();
    await fillMinimumForm();
    await page.getByRole("button", { name: "登録" }).click();

    await vi.waitFor(() => {
      expect(postHandler).toHaveBeenCalledWith(expect.objectContaining({ placeName: "コンビニB" }));
    });
  });

  test("登録成功時に成功メッセージが表示されフォームがリセットされる", async ({ worker }) => {
    worker.use(
      ...commonHandlers,
      http.post(mockUrl("/api/transactions"), () => HttpResponse.json({ id: 999 })),
    );

    await render(<Default.Component />);

    await fillMinimumForm();
    await page.getByRole("button", { name: "登録" }).click();

    await expect.element(page.getByRole("status")).toMatchTextContent("登録しました");

    // フォームがリセットされ登録ボタンが再び無効になる
    await expect.element(page.getByRole("button", { name: "登録" })).toBeDisabled();
  });

  test("重複検出時に警告と「重複があっても登録」ボタンが表示される", async ({ worker }) => {
    worker.use(...withoutNoDuplicates, duplicateHandler);

    await render(<Default.Component />);

    await fillMinimumForm();
    await page.getByRole("button", { name: "登録" }).click();

    await expect.element(page.getByRole("alert")).toMatchTextContent("直近で同額");
    await expect.element(page.getByRole("button", { name: "重複があっても登録" })).toBeVisible();
  });

  test("警告状態で再度ボタン押下するとPOSTが呼ばれる", async ({ worker }) => {
    const postHandler = vi.fn<(body: PaymentBody) => void>();
    worker.use(...withoutNoDuplicates, duplicateHandler, recordPayment(postHandler));

    await render(<Default.Component />);

    await fillMinimumForm();
    await page.getByRole("button", { name: "登録" }).click();
    await expect.element(page.getByRole("button", { name: "重複があっても登録" })).toBeVisible();

    await page.getByRole("button", { name: "重複があっても登録" }).click();

    await vi.waitFor(() => {
      expect(postHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [expect.objectContaining({ genreId: 1001, amount: 1000 })],
        }),
      );
    });
  });

  test("警告表示中に金額を変更すると警告がクリアされる", async ({ worker }) => {
    worker.use(...withoutNoDuplicates, duplicateHandler);

    await render(<Default.Component />);

    await fillMinimumForm();
    await page.getByRole("button", { name: "登録" }).click();
    await expect.element(page.getByRole("button", { name: "重複があっても登録" })).toBeVisible();

    await page.getByRole("button", { name: "金額を編集" }).click();
    await page.getByRole("spinbutton", { name: "金額" }).fill("2000");
    await page.getByRole("button", { name: "完了" }).click();

    await expect.element(page.getByRole("button", { name: "登録" })).toBeVisible();
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  });

  test("登録失敗時にエラーメッセージが表示される", async ({ worker }) => {
    worker.use(
      ...commonHandlers,
      http.post(mockUrl("/api/transactions"), () =>
        HttpResponse.json({ error: "登録できませんでした" }, { status: 502 }),
      ),
    );

    await render(<Default.Component />);

    await fillMinimumForm();
    await page.getByRole("button", { name: "登録" }).click();

    await expect.element(page.getByRole("alert")).toMatchTextContent("登録に失敗しました（502）");
  });

  test("品目編集モーダルはクリックした項目にフォーカスが当たって開く", async ({ worker }) => {
    worker.use(...commonHandlers);

    await render(<Default.Component />);

    await page.getByRole("button", { name: "金額を編集" }).click();
    await expect.element(page.getByRole("spinbutton", { name: "金額" })).toHaveFocus();

    // モーダルを閉じて別の項目を開く
    await page.getByRole("button", { name: "完了" }).click();
    await page.getByRole("button", { name: "メモを編集" }).click();
    await expect.element(page.getByRole("textbox", { name: "メモ" })).toHaveFocus();
  });

  test("品名・メモはモーダル経由で編集できる", async ({ worker }) => {
    worker.use(...commonHandlers);

    await render(<Default.Component />);

    await page.getByRole("button", { name: "品名を編集" }).click();
    await page.getByRole("textbox", { name: "品名" }).fill("りんご");
    await page.getByRole("textbox", { name: "メモ" }).fill("特売");
    await page.getByRole("button", { name: "完了" }).click();

    await expect
      .element(page.getByRole("button", { name: "品名を編集" }))
      .toMatchTextContent("りんご");
    await expect
      .element(page.getByRole("button", { name: "メモを編集" }))
      .toMatchTextContent("特売");
  });

  test("品目ごとに異なるカテゴリを選んで 1 回の登録にまとめる", async ({ worker }) => {
    const postHandler = vi.fn<(body: PaymentBody) => void>();
    worker.use(...commonHandlers, recordPayment(postHandler));

    await render(<Default.Component />);

    // 1 行目: カテゴリ=食料品, 金額=1000
    await page.getByRole("button", { name: "品名を編集" }).first().click();
    await page.getByRole("spinbutton", { name: "金額" }).fill("1000");
    await page.getByRole("combobox", { name: "カテゴリ" }).click();
    await page.getByRole("option", { name: "食料品" }).click();
    await page.getByRole("button", { name: "完了" }).click();

    // 2 行目を追加し、カテゴリ=電車・バス, 金額=500
    await page.getByRole("button", { name: "品目を追加" }).click();
    await page.getByRole("button", { name: "品名を編集" }).nth(1).click();
    await page.getByRole("spinbutton", { name: "金額" }).fill("500");
    await page.getByRole("combobox", { name: "カテゴリ" }).click();
    await page.getByRole("option", { name: "電車・バス" }).click();
    await page.getByRole("button", { name: "完了" }).click();

    await page.getByRole("button", { name: "登録" }).click();

    await vi.waitFor(() => {
      expect(postHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({ genreId: 1001, amount: 1000 }),
            expect.objectContaining({ genreId: 1003, amount: 500 }),
          ],
        }),
      );
    });
    expect(postHandler).toHaveBeenCalledTimes(1);
  });

  test("重複チェックは品目をまとめて 1 回で問い合わせる", async ({ worker }) => {
    const checked = vi.fn<(body: unknown) => void>();
    worker.use(
      ...withoutNoDuplicates,
      http.post(mockUrl("/api/transactions/duplicates"), async ({ request }) => {
        checked(await request.json());
        const response: DuplicatesResponse = { duplicates: [[], []] };
        return HttpResponse.json(response);
      }),
      http.post(mockUrl("/api/transactions"), () => HttpResponse.json({ id: 999 })),
    );

    await render(<Default.Component />);

    await fillMinimumForm();
    await page.getByRole("button", { name: "品目を追加" }).click();
    await page.getByRole("button", { name: "品名を編集" }).nth(1).click();
    await page.getByRole("spinbutton", { name: "金額" }).fill("500");
    await page.getByRole("button", { name: "完了" }).click();
    await page.getByRole("button", { name: "登録" }).click();

    await expect.element(page.getByRole("status")).toMatchTextContent("登録しました");
    expect(checked).toHaveBeenCalledTimes(1);
    expect(checked).toHaveBeenCalledWith({
      date: expect.any(String),
      items: [
        { genreId: 1001, amount: 1000 },
        { genreId: 1001, amount: 500 },
      ],
    });
  });

  test("自動入力はページの内容を速さ優先で送り、返ってきた内容をフォームに入れる", async ({
    worker,
  }) => {
    const extractBody = vi.fn<(body: unknown) => void>();
    const extracted: LedgerOutput<"/api/transactions/extract", "POST"> = {
      model: "test-model",
      date: "2024-01-10",
      paymentMethod: "VISA ****1234",
      accountId: 2,
      accountMatch: "explicit",
      placeName: "はじめての店",
      items: [
        { name: "おにぎり", amount: 160, memo: "鮭", genreId: 1001 },
        { name: "電車代", amount: 200, memo: null, genreId: 1003 },
      ],
      total: 360,
      confidence: "high",
      reasoning: "レシートの明細から読み取った",
    };
    worker.use(
      ...commonHandlers,
      http.post(mockUrl("/api/transactions/extract"), async ({ request }) => {
        extractBody(await request.json());
        return HttpResponse.json(extracted);
      }),
    );

    await render(<Default.Component />);

    await page.getByRole("button", { name: "このページから自動入力" }).click();

    await expect
      .element(page.getByRole("button", { name: "品名を編集" }).first())
      .toMatchTextContent("おにぎり");
    expect(extractBody).toHaveBeenCalledWith({
      pageContent: {
        url: "https://shop.example.com/order/1",
        title: "ご注文ありがとうございます",
        ariaSnapshot: "heading: ご注文内容",
        collectedAt: "2024-01-10T12:00:00.000Z",
      },
      quality: "fast",
    });
    await expect
      .element(page.getByRole("combobox", { name: "口座" }))
      .toMatchTextContent("クレジットカード");
    await expect.element(page.getByRole("combobox", { name: "店舗" })).toHaveValue("はじめての店");
    await expect
      .element(page.getByRole("combobox", { name: "カテゴリ" }).nth(1))
      .toMatchTextContent("交通費 / 電車・バス");
    await expect.element(page.getByText("360")).toBeVisible();
    await expect.element(page.getByText("からの推測です")).not.toBeInTheDocument();
  });

  test("自動入力で口座を推測で選んだら、読み取った支払い方法の表記とともに口座の下に知らせる", async ({
    worker,
  }) => {
    const extracted: LedgerOutput<"/api/transactions/extract", "POST"> = {
      model: "test-model",
      date: "2024-01-10",
      paymentMethod: "クレジット",
      accountId: 2,
      accountMatch: "inferred",
      placeName: "スーパーA",
      items: [{ name: "牛乳", amount: 250, memo: null, genreId: 1001 }],
      total: 250,
      confidence: "high",
      reasoning: "",
    };
    worker.use(
      ...commonHandlers,
      http.post(mockUrl("/api/transactions/extract"), () => HttpResponse.json(extracted)),
    );

    await render(<Default.Component />);

    await page.getByRole("button", { name: "このページから自動入力" }).click();

    await expect
      .element(page.getByRole("combobox", { name: "口座" }))
      .toMatchTextContent("クレジットカード");
    await expect
      .element(page.getByText("支払い方法の表記「クレジット」からの推測です"))
      .toBeVisible();
  });

  test("自動入力に失敗したら状態コード付きのエラーを表示する", async ({ worker }) => {
    worker.use(
      ...commonHandlers,
      http.post(mockUrl("/api/transactions/extract"), () =>
        HttpResponse.json({ error: "LLM failed" }, { status: 502 }),
      ),
    );

    await render(<Default.Component />);

    await page.getByRole("button", { name: "このページから自動入力" }).click();

    await expect
      .element(page.getByRole("alert"))
      .toMatchTextContent("自動入力に失敗しました（502）");
  });

  test("自動入力の後は、もう一度読み取ると正確さ優先で読み直してフォームを置き換える", async ({
    worker,
  }) => {
    const qualities: unknown[] = [];
    worker.use(
      ...commonHandlers,
      http.post(mockUrl("/api/transactions/extract"), async ({ request }) => {
        const body = await request.json();
        const quality =
          typeof body === "object" && body !== null && "quality" in body ? body.quality : null;
        qualities.push(quality);
        const extracted: LedgerOutput<"/api/transactions/extract", "POST"> = {
          model: "test-model",
          date: "2024-01-10",
          paymentMethod: null,
          accountId: null,
          accountMatch: null,
          placeName: null,
          items: [
            {
              name: quality === "accurate" ? "正しい品名" : "誤った品名",
              amount: 100,
              memo: null,
              genreId: 1001,
            },
          ],
          total: 100,
          confidence: "high",
          reasoning: "",
        };
        return HttpResponse.json(extracted);
      }),
    );

    await render(<Default.Component />);

    const reread = page.getByRole("button", { name: "もう一度読み取る" });
    await expect.element(reread).not.toBeInTheDocument();

    await page.getByRole("button", { name: "このページから自動入力" }).click();
    const itemName = page.getByRole("button", { name: "品名を編集" }).first();
    await expect.element(itemName).toMatchTextContent("誤った品名");

    await reread.click();

    await expect.element(itemName).toMatchTextContent("正しい品名");
    expect(qualities).toEqual(["fast", "accurate"]);
  });

  test("読み直しに失敗しても、前の結果を残して読み直せる", async ({ worker }) => {
    worker.use(
      ...commonHandlers,
      http.post(mockUrl("/api/transactions/extract"), async ({ request }) => {
        const body = await request.json();
        if (
          typeof body === "object" &&
          body !== null &&
          "quality" in body &&
          body.quality === "accurate"
        ) {
          return HttpResponse.json({ error: "LLM failed" }, { status: 502 });
        }
        const extracted: LedgerOutput<"/api/transactions/extract", "POST"> = {
          model: "test-model",
          date: "2024-01-10",
          paymentMethod: null,
          accountId: null,
          accountMatch: null,
          placeName: null,
          items: [{ name: "前の品名", amount: 100, memo: null, genreId: 1001 }],
          total: 100,
          confidence: "high",
          reasoning: "",
        };
        return HttpResponse.json(extracted);
      }),
    );

    await render(<Default.Component />);

    await page.getByRole("button", { name: "このページから自動入力" }).click();
    const itemName = page.getByRole("button", { name: "品名を編集" }).first();
    await expect.element(itemName).toMatchTextContent("前の品名");

    await page.getByRole("button", { name: "もう一度読み取る" }).click();

    await expect
      .element(page.getByRole("alert"))
      .toMatchTextContent("自動入力に失敗しました（502）");
    await expect.element(itemName).toMatchTextContent("前の品名");
    await expect.element(page.getByRole("button", { name: "もう一度読み取る" })).toBeEnabled();
  });

  /** 指定した店舗名を返す自動入力ハンドラー。品目は 1 件（食料品・250 円）。合計は品目と合わせて 250 円 */
  const extractPaymentHandler = (placeName: string, total: number | null = 250) =>
    http.post(mockUrl("/api/transactions/extract"), () => {
      const extracted: LedgerOutput<"/api/transactions/extract", "POST"> = {
        model: "test-model",
        date: "2026-06-13",
        paymentMethod: "VISA ****1234",
        accountId: 2,
        accountMatch: "explicit",
        placeName,
        items: [{ name: "牛乳", amount: 250, memo: null, genreId: 1001 }],
        total,
        confidence: "high",
        reasoning: "",
      };
      return HttpResponse.json(extracted);
    });

  test("自動入力で読み取った合計が品目の合計と合わなければ知らせる", async ({ worker }) => {
    worker.use(...commonHandlers, extractPaymentHandler("スーパーA", 270));

    await render(<Default.Component />);

    await page.getByRole("button", { name: "このページから自動入力" }).click();
    await expect.element(page.getByText("牛乳")).toBeVisible();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("読み取った合計 270円と合いません");
  });

  test("自動入力で読み取った合計が品目の合計と合えば何も知らせない", async ({ worker }) => {
    worker.use(...commonHandlers, extractPaymentHandler("スーパーA"));

    await render(<Default.Component />);

    await page.getByRole("button", { name: "このページから自動入力" }).click();
    await expect.element(page.getByText("牛乳")).toBeVisible();
    await expect.element(page.getByText("読み取った合計")).not.toBeInTheDocument();
  });

  test("自動入力の店舗が一覧にあれば選択し、店舗名で登録する", async ({ worker }) => {
    const postHandler = vi.fn<(body: PaymentBody) => void>();
    worker.use(...commonHandlers, extractPaymentHandler("スーパーA"), recordPayment(postHandler));

    await render(<Default.Component />);

    await page.getByRole("button", { name: "このページから自動入力" }).click();
    await expect.element(page.getByRole("combobox", { name: "店舗" })).toHaveValue("スーパーA");
    await page.getByRole("button", { name: "登録" }).click();

    await vi.waitFor(() => {
      expect(postHandler).toHaveBeenCalledWith(expect.objectContaining({ placeName: "スーパーA" }));
    });
  });

  test("自動入力から登録すると、AI が読み取ったままの内訳と品名も送る", async ({ worker }) => {
    const postHandler = vi.fn<(body: PaymentBody) => void>();
    worker.use(...commonHandlers, extractPaymentHandler("スーパーA"), recordPayment(postHandler));

    await render(<Default.Component />);

    await page.getByRole("button", { name: "このページから自動入力" }).click();
    await expect.element(page.getByText("牛乳")).toBeVisible();
    await page.getByRole("button", { name: "登録" }).click();

    await vi.waitFor(() => {
      expect(postHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          aiRead: { source: "page", model: "test-model" },
          items: [
            {
              genreId: 1001,
              name: "牛乳",
              memo: null,
              amount: 250,
              aiGuess: { genreId: 1001, name: "牛乳" },
            },
          ],
        }),
      );
    });
  });

  test("自動入力の店舗が一覧になくても、その店舗名で登録する", async ({ worker }) => {
    const postHandler = vi.fn<(body: PaymentBody) => void>();
    worker.use(...commonHandlers, extractPaymentHandler("初めての店"), recordPayment(postHandler));

    await render(<Default.Component />);

    await page.getByRole("button", { name: "このページから自動入力" }).click();
    await expect.element(page.getByText("牛乳")).toBeVisible();
    await page.getByRole("button", { name: "登録" }).click();

    await vi.waitFor(() => {
      expect(postHandler).toHaveBeenCalledWith(
        expect.objectContaining({ placeName: "初めての店" }),
      );
    });
  });
});

describe("MainScreen visual regression", () => {
  // 日付欄の初期値は今日の日付なので、撮った日で画像が変わらないよう固定する。
  // Temporal.Now は Date のモックを見ないため "Temporal" も偽装する。
  // 他のタイマーまで偽装すると描画や MSW の待機が進まなくなるので対象を絞る
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "Temporal"] });
    vi.setSystemTime(new Date(2024, 0, 10, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** 口座・店舗・カテゴリの選択欄が読み込まれるまで待つ（読み込み中や失敗の表示を撮らないため） */
  const waitForMasters = async () => {
    await expect.element(page.getByRole("combobox", { name: "口座" })).toBeVisible();
    await expect.element(page.getByRole("combobox", { name: "店舗" })).toBeVisible();
    await expect.element(page.getByRole("combobox", { name: "カテゴリ" }).first()).toBeVisible();
  };

  test("初期状態", async ({ worker }) => {
    worker.use(...commonHandlers);
    await render(<Default.Component />);
    await waitForMasters();
    // 固定が効いていないと基準画像が日付で揺れるので、先に値で確かめる
    await expect.element(page.getByRole("textbox", { name: "日付" })).toHaveValue("2024-01-10");
    await expect(page.elementLocator(document.body)).toMatchScreenshot("main-screen-initial");
  });

  test("品目追加後", async ({ worker }) => {
    worker.use(...commonHandlers);
    const screen = await render(<Default.Component />);
    await waitForMasters();
    await userEvent.click(screen.getByRole("button", { name: "品目を追加" }));
    await expect(page.elementLocator(document.body)).toMatchScreenshot("main-screen-two-items");
  });

  test("金額入力後", async ({ worker }) => {
    worker.use(...commonHandlers);
    const screen = await render(<Default.Component />);
    await waitForMasters();
    await userEvent.click(screen.getByRole("button", { name: "金額を編集" }));
    await userEvent.fill(screen.getByRole("spinbutton", { name: "金額" }), "1000");
    await userEvent.click(screen.getByRole("button", { name: "完了" }));
    await expect(page.elementLocator(document.body)).toMatchScreenshot("main-screen-with-amount");
  });
});

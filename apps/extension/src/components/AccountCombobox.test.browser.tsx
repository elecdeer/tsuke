import { delay, http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import { test } from "../test-utils/browser-test.ts";
import {
  accountsHandler,
  MOCK_SERVER_URL,
  mockAccounts,
  mockUrl,
} from "../test-utils/ledgerMocks.ts";
import { AccountCombobox } from "./AccountCombobox.tsx";

const ControlledAccountCombobox = ({ onChange }: { onChange?: (v: number | null) => void }) => {
  const [value, setValue] = useState<number | null>(null);
  return (
    <AccountCombobox
      serverUrl={MOCK_SERVER_URL}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
};

describe("AccountCombobox", () => {
  test("ローディング中はスケルトンが表示される", async ({ worker }) => {
    let requestReceived = false;
    worker.use(
      http.get(mockUrl("/api/accounts"), async () => {
        requestReceived = true;
        await delay("infinite");
        return HttpResponse.json(mockAccounts);
      }),
    );

    await render(<ControlledAccountCombobox />);

    await expect.element(page.getByRole("status", { name: "口座を読み込み中" })).toBeVisible();
    // スケルトンは描画直後に出るので、リクエストが MSW に届く前にテストが終わることがある。
    // 届き損ねたリクエストは次のテストが登録したハンドラーで処理され、そのテストのリクエスト数が狂うため、
    // このテストのハンドラーが受け取るまで待ってから終える
    await expect.poll(() => requestReceived).toBe(true);
  });

  test("台帳の口座が一覧に表示される", async ({ worker }) => {
    worker.use(accountsHandler);

    await render(<ControlledAccountCombobox />);

    await page.getByRole("combobox", { name: "口座" }).click();

    await expect.element(page.getByRole("option", { name: "現金" })).toBeVisible();
    await expect.element(page.getByRole("option", { name: "クレジットカード" })).toBeVisible();
    await expect.element(page.getByRole("option", { name: "Suica" })).toBeVisible();
  });

  test("口座を選択するとonChangeがidで呼ばれる", async ({ worker }) => {
    worker.use(accountsHandler);

    const onChange = vi.fn<(value: number | null) => void>();
    await render(<ControlledAccountCombobox onChange={onChange} />);

    await page.getByRole("combobox", { name: "口座" }).click();
    await page.getByRole("option", { name: "現金" }).click();

    expect(onChange).toHaveBeenCalledWith(1);
  });

  test("クリアするとonChangeがnullで呼ばれる", async ({ worker }) => {
    worker.use(accountsHandler);

    const onChange = vi.fn<(value: number | null) => void>();
    await render(<ControlledAccountCombobox onChange={onChange} />);

    // まず口座を選択
    await page.getByRole("combobox", { name: "口座" }).click();
    await page.getByRole("option", { name: "現金" }).click();

    // クリアボタンで解除
    await page.getByRole("button", { name: "クリア" }).click();

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test("口座取得エラー時にエラーメッセージが表示される", async ({ worker }) => {
    worker.use(http.get(mockUrl("/api/accounts"), () => new HttpResponse(null, { status: 500 })));

    await render(<AccountCombobox serverUrl={MOCK_SERVER_URL} value={null} onChange={() => {}} />);

    await expect.element(page.getByText("口座の取得に失敗しました")).toBeVisible();
  });
});

import { delay, http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import { test } from "../test-utils/browser-test.ts";
import { MOCK_SERVER_URL, mockPlaces, mockUrl, placesHandler } from "../test-utils/ledgerMocks.ts";
import { StoreCombobox } from "./StoreCombobox.tsx";

const ControlledStoreCombobox = ({
  initialValue = null,
  onChange,
}: {
  initialValue?: string | null;
  onChange?: (v: string | null) => void;
}) => {
  const [value, setValue] = useState<string | null>(initialValue);
  return (
    <StoreCombobox
      serverUrl={MOCK_SERVER_URL}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
};

describe("StoreCombobox", () => {
  test("ローディング中はスケルトンが表示される", async ({ worker }) => {
    let requestReceived = false;
    worker.use(
      http.get(mockUrl("/api/places"), async () => {
        requestReceived = true;
        await delay("infinite");
        return HttpResponse.json(mockPlaces);
      }),
    );

    await render(<ControlledStoreCombobox />);

    await expect.element(page.getByRole("status", { name: "店舗を読み込み中" })).toBeVisible();
    // スケルトンは描画直後に出るので、リクエストが MSW に届く前にテストが終わることがある。
    // 届き損ねたリクエストは次のテストが登録したハンドラーで処理され、そのテストのリクエスト数が狂うため、
    // このテストのハンドラーが受け取るまで待ってから終える
    await expect.poll(() => requestReceived).toBe(true);
  });

  test("台帳の店舗一覧が表示される", async ({ worker }) => {
    worker.use(placesHandler);

    await render(<ControlledStoreCombobox />);

    await page.getByRole("combobox", { name: "店舗" }).click();

    await expect.element(page.getByRole("option", { name: "スーパーA" })).toBeVisible();
    await expect.element(page.getByRole("option", { name: "コンビニB" })).toBeVisible();
    await expect.element(page.getByRole("option", { name: "カフェC" })).toBeVisible();
  });

  test("候補があるときは「見つかりません」の領域が場所を取らない", async ({ worker }) => {
    worker.use(placesHandler);

    await render(<ControlledStoreCombobox />);
    await page.getByRole("combobox", { name: "店舗" }).click();
    await expect.element(page.getByRole("option", { name: "スーパーA" })).toBeVisible();

    // Base UI の Combobox.Empty は候補があっても空の要素を描画し続ける
    const empty = document.querySelector('[data-slot="combobox-empty"]');
    expect(empty?.getBoundingClientRect().height).toBe(0);
  });

  test("検索に一致する店舗がなければ、追加の候補だけを出す", async ({ worker }) => {
    worker.use(placesHandler);

    await render(<ControlledStoreCombobox />);
    await page.getByRole("combobox", { name: "店舗" }).click();
    await page.getByPlaceholder("店舗を検索・追加").fill("存在しない店舗");

    await expect
      .element(page.getByRole("option", { name: "「存在しない店舗」を追加" }))
      .toBeVisible();
    await expect.element(page.getByRole("option", { name: "スーパーA" })).not.toBeInTheDocument();
  });

  test("台帳に店舗がなく入力も空なら「見つかりません」を表示する", async ({ worker }) => {
    worker.use(http.get(mockUrl("/api/places"), () => HttpResponse.json({ places: [] })));

    await render(<ControlledStoreCombobox />);
    await page.getByRole("combobox", { name: "店舗" }).click();

    await expect.element(page.getByText("店舗が見つかりません")).toBeVisible();
  });

  test("店舗を選択すると店舗名でonChangeが呼ばれる", async ({ worker }) => {
    worker.use(placesHandler);

    const onChange = vi.fn<(value: string | null) => void>();
    await render(<ControlledStoreCombobox onChange={onChange} />);

    await page.getByRole("combobox", { name: "店舗" }).click();
    await page.getByRole("option", { name: "スーパーA" }).click();

    expect(onChange).toHaveBeenCalledWith("スーパーA");
  });

  test("一覧にない名前を入れると、その名前を追加してonChangeが呼ばれる", async ({ worker }) => {
    worker.use(placesHandler);

    const onChange = vi.fn<(value: string | null) => void>();
    await render(<ControlledStoreCombobox onChange={onChange} />);

    await page.getByRole("combobox", { name: "店舗" }).click();
    await page.getByPlaceholder("店舗を検索・追加").fill("はじめての店");
    await page.getByRole("option", { name: "「はじめての店」を追加" }).click();

    expect(onChange).toHaveBeenCalledWith("はじめての店");
    await expect
      .element(page.getByRole("combobox", { name: "店舗" }))
      .toMatchTextContent("はじめての店");
  });

  test("一覧にある名前を入れたときは追加の候補を出さない", async ({ worker }) => {
    worker.use(placesHandler);

    await render(<ControlledStoreCombobox />);
    await page.getByRole("combobox", { name: "店舗" }).click();
    await page.getByPlaceholder("店舗を検索・追加").fill("スーパーA");

    await expect.element(page.getByRole("option", { name: "スーパーA" })).toBeVisible();
    await expect.element(page.getByRole("option", { name: /を追加$/ })).not.toBeInTheDocument();
  });

  test("一覧にない店舗名もそのまま表示する", async ({ worker }) => {
    worker.use(placesHandler);

    await render(<ControlledStoreCombobox initialValue="はじめての店" />);

    await expect
      .element(page.getByRole("combobox", { name: "店舗" }))
      .toMatchTextContent("はじめての店");
  });

  test("クリアするとonChangeがnullで呼ばれる", async ({ worker }) => {
    worker.use(placesHandler);

    const onChange = vi.fn<(value: string | null) => void>();
    await render(<ControlledStoreCombobox onChange={onChange} />);

    await page.getByRole("combobox", { name: "店舗" }).click();
    await page.getByRole("option", { name: "スーパーA" }).click();

    await page.getByRole("button", { name: "クリア" }).click();

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test("店舗取得エラー時にエラーメッセージが表示される", async ({ worker }) => {
    worker.use(http.get(mockUrl("/api/places"), () => new HttpResponse(null, { status: 500 })));

    await render(<StoreCombobox serverUrl={MOCK_SERVER_URL} value={null} onChange={() => {}} />);

    await expect.element(page.getByText("店舗の取得に失敗しました")).toBeVisible();
  });
});

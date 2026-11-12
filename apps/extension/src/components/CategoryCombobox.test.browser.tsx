import { delay, http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import { test } from "../test-utils/browser-test.ts";
import {
  categoriesHandler,
  MOCK_SERVER_URL,
  mockCategories,
  mockUrl,
} from "../test-utils/ledgerMocks.ts";
import { CategoryCombobox, type CategorySelection } from "./CategoryCombobox.tsx";

const ControlledCategoryCombobox = ({
  onChange,
}: {
  onChange?: (v: CategorySelection | null) => void;
}) => {
  const [value, setValue] = useState<CategorySelection | null>(null);
  return (
    <CategoryCombobox
      serverUrl={MOCK_SERVER_URL}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
};

describe("CategoryCombobox", () => {
  test("ローディング中はスケルトンが表示される", async ({ worker }) => {
    let requestReceived = false;
    worker.use(
      http.get(mockUrl("/api/categories"), async () => {
        requestReceived = true;
        await delay("infinite");
        return HttpResponse.json(mockCategories);
      }),
    );

    await render(<ControlledCategoryCombobox />);

    await expect.element(page.getByRole("status", { name: "カテゴリを読み込み中" })).toBeVisible();
    // スケルトンは描画直後に出るので、リクエストが MSW に届く前にテストが終わることがある。
    // 届き損ねたリクエストは次のテストが登録したハンドラーで処理され、そのテストのリクエスト数が狂うため、
    // このテストのハンドラーが受け取るまで待ってから終える
    await expect.poll(() => requestReceived).toBe(true);
  });

  test("支出のカテゴリを取得し、内訳をカテゴリごとにグループ化して表示する", async ({ worker }) => {
    const requestedModes: (string | null)[] = [];
    worker.use(
      http.get(mockUrl("/api/categories"), ({ request }) => {
        requestedModes.push(new URL(request.url).searchParams.get("mode"));
        return HttpResponse.json(mockCategories);
      }),
    );

    await render(<ControlledCategoryCombobox />);

    await page.getByRole("combobox", { name: "カテゴリ" }).click();

    await expect.element(page.getByRole("option", { name: "食料品" })).toBeVisible();
    await expect.element(page.getByRole("option", { name: "外食" })).toBeVisible();
    await expect.element(page.getByRole("option", { name: "電車・バス" })).toBeVisible();

    // カテゴリ名はグループラベルとして表示される
    await expect.element(page.getByText("食費")).toBeVisible();
    await expect.element(page.getByText("交通費")).toBeVisible();

    expect(requestedModes).toEqual(["payment"]);
  });

  test("内訳を選択するとonChangeがcategoryIdとgenreIdで呼ばれる", async ({ worker }) => {
    worker.use(categoriesHandler);

    const onChange = vi.fn<(value: CategorySelection | null) => void>();
    await render(<ControlledCategoryCombobox onChange={onChange} />);

    await page.getByRole("combobox", { name: "カテゴリ" }).click();
    await page.getByRole("option", { name: "外食" }).click();

    expect(onChange).toHaveBeenCalledWith({ categoryId: 101, genreId: 1002 });
  });

  test("カテゴリ取得エラー時にエラーメッセージが表示される", async ({ worker }) => {
    worker.use(http.get(mockUrl("/api/categories"), () => new HttpResponse(null, { status: 500 })));

    await render(<CategoryCombobox serverUrl={MOCK_SERVER_URL} value={null} onChange={() => {}} />);

    await expect.element(page.getByText("カテゴリの取得に失敗しました")).toBeVisible();
  });
});

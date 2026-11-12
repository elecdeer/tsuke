import { delay, http, HttpResponse } from "msw";
import { useState } from "react";
import preview from "#storybook/preview";
import {
  categoriesHandler,
  MOCK_SERVER_URL,
  mockCategories,
  mockUrl,
} from "../test-utils/ledgerMocks.ts";
import { CategoryCombobox, type CategorySelection } from "./CategoryCombobox.tsx";

const ControlledWrapper = ({ serverUrl }: { serverUrl: string }) => {
  const [value, setValue] = useState<CategorySelection | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <CategoryCombobox serverUrl={serverUrl} value={value} onChange={setValue} />
      <p className="text-xs text-muted-foreground">
        選択中: {value ? `categoryId=${value.categoryId}, genreId=${value.genreId}` : "なし"}
      </p>
    </div>
  );
};

const meta = preview.meta({
  title: "Components/CategoryCombobox",
  component: CategoryCombobox,
  args: {
    serverUrl: MOCK_SERVER_URL,
    value: null,
    onChange: () => {},
  },
  decorators: [
    () => (
      <div className="p-4">
        <ControlledWrapper serverUrl={MOCK_SERVER_URL} />
      </div>
    ),
  ],
});

export default meta;

export const Default = meta.story({
  name: "カテゴリ選択",
  parameters: {
    msw: {
      handlers: [categoriesHandler],
    },
  },
});

export const Loading = meta.story({
  name: "読み込み中",
  parameters: {
    msw: {
      handlers: [
        http.get(mockUrl("/api/categories"), async () => {
          await delay("infinite");
          return HttpResponse.json(mockCategories);
        }),
      ],
    },
  },
});

export const Error = meta.story({
  name: "エラー状態",
  parameters: {
    msw: {
      handlers: [
        http.get(mockUrl("/api/categories"), () => new HttpResponse(null, { status: 500 })),
      ],
    },
  },
});

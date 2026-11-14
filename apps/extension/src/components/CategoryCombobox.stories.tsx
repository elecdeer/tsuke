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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <CategoryCombobox serverUrl={serverUrl} value={value} onChange={setValue} />
      <p style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>
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
      <div style={{ padding: "1rem" }}>
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

import { delay, http, HttpResponse } from "msw";
import { useState } from "react";
import preview from "#storybook/preview";
import {
  accountsHandler,
  MOCK_SERVER_URL,
  mockAccounts,
  mockUrl,
} from "../test-utils/ledgerMocks.ts";
import { AccountCombobox } from "./AccountCombobox.tsx";

const ControlledWrapper = ({ serverUrl }: { serverUrl: string }) => {
  const [value, setValue] = useState<number | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <AccountCombobox serverUrl={serverUrl} value={value} onChange={setValue} />
      <p style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>
        選択中: {value !== null ? `accountId=${value}` : "なし"}
      </p>
    </div>
  );
};

const meta = preview.meta({
  title: "Components/AccountCombobox",
  component: AccountCombobox,
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
  name: "口座選択",
  parameters: {
    msw: {
      handlers: [accountsHandler],
    },
  },
});

export const Loading = meta.story({
  name: "読み込み中",
  parameters: {
    msw: {
      handlers: [
        http.get(mockUrl("/api/accounts"), async () => {
          await delay("infinite");
          return HttpResponse.json(mockAccounts);
        }),
      ],
    },
  },
});

export const Error = meta.story({
  name: "エラー状態",
  parameters: {
    msw: {
      handlers: [http.get(mockUrl("/api/accounts"), () => new HttpResponse(null, { status: 500 }))],
    },
  },
});

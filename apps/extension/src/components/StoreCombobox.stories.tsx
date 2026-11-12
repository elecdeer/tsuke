import { http, HttpResponse } from "msw";
import { useState } from "react";
import preview from "#storybook/preview";
import { MOCK_SERVER_URL, mockUrl, placesHandler } from "../test-utils/ledgerMocks.ts";
import { StoreCombobox } from "./StoreCombobox.tsx";

const ControlledWrapper = ({ serverUrl }: { serverUrl: string }) => {
  const [value, setValue] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <StoreCombobox serverUrl={serverUrl} value={value} onChange={setValue} />
      <p className="text-xs text-muted-foreground">選択中: {value ?? "なし"}</p>
    </div>
  );
};

const meta = preview.meta({
  title: "Components/StoreCombobox",
  component: StoreCombobox,
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
  name: "店舗選択（履歴あり）",
  parameters: {
    msw: {
      handlers: [placesHandler],
    },
  },
});

export const NoHistory = meta.story({
  name: "履歴なし",
  parameters: {
    msw: {
      handlers: [http.get(mockUrl("/api/places"), () => HttpResponse.json({ places: [] }))],
    },
  },
});

export const Error = meta.story({
  name: "取得エラー",
  parameters: {
    msw: {
      handlers: [http.get(mockUrl("/api/places"), () => new HttpResponse(null, { status: 500 }))],
    },
  },
});

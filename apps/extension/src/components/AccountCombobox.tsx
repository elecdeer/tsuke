import { XIcon } from "lucide-react";
import { Suspense, useId } from "react";
import { Button } from "@tsuke/ui/components/button";
import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@tsuke/ui/components/combobox";
import { selectTriggerClassName } from "@tsuke/ui/components/select";
import { ErrorBoundary } from "@/lib/ErrorBoundary";
import { useSuspenseQuery } from "@/lib/query";
import { cn } from "@tsuke/ui/lib/utils";
import { accountsQuery, type AccountsResponse } from "../queries";
import { FormField } from "@tsuke/ui/patterns/FormField";

type Account = AccountsResponse["accounts"][number];

interface Props {
  serverUrl: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

const LABEL = "口座";

/**
 * 口座選択の combobox コンポーネント。
 * 台帳が返す順（アーカイブしていない口座を並び順で）に表示する。
 */
export const AccountCombobox = ({ serverUrl, value, onChange }: Props) => {
  const id = useId();
  if (!serverUrl) return null;

  return (
    <FormField label={LABEL} htmlFor={id}>
      <ErrorBoundary
        fallback={<p className="py-1.5 text-sm text-destructive">口座の取得に失敗しました</p>}
      >
        <Suspense
          fallback={
            <output
              className="block h-8 animate-pulse border-b border-foreground/40 bg-muted"
              aria-label="口座を読み込み中"
            />
          }
        >
          <AccountComboboxContent id={id} serverUrl={serverUrl} value={value} onChange={onChange} />
        </Suspense>
      </ErrorBoundary>
    </FormField>
  );
};

const AccountComboboxContent = ({
  id,
  serverUrl,
  value,
  onChange,
}: { id: string; serverUrl: string } & Pick<Props, "value" | "onChange">) => {
  const { data } = useSuspenseQuery(accountsQuery, serverUrl);

  const accounts = data.accounts;
  const selectedAccount = accounts.find((a) => a.id === value) ?? null;

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <Combobox
        items={accounts}
        value={selectedAccount}
        onValueChange={(next: Account | null) =>
          onChange(next && next.id === value ? null : (next?.id ?? null))
        }
        isItemEqualToValue={(a: Account | null, b: Account | null) => a?.id === b?.id}
        itemToStringLabel={(a: Account | null) => a?.name ?? ""}
      >
        <ComboboxTrigger
          id={id}
          render={
            // 名前はラベルからも付くが、lint はラベルとの結び付きを読めないので、同じ名前を直接付ける
            <button
              type="button"
              aria-label={LABEL}
              data-size="default"
              className={cn(selectTriggerClassName, "w-full flex-1")}
            />
          }
        >
          <ComboboxValue>
            {(v: Account | null) => (
              <span className={cn("truncate", !v && "text-muted-foreground")}>
                {v?.name ?? "なし"}
              </span>
            )}
          </ComboboxValue>
        </ComboboxTrigger>
        <ComboboxClear
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label="クリア" />}
        >
          <XIcon />
        </ComboboxClear>
        <ComboboxContent>
          <ComboboxInput showTrigger={false} placeholder="口座を検索" />
          <ComboboxEmpty>口座が見つかりません</ComboboxEmpty>
          <ComboboxList>
            {(item: Account) => (
              <ComboboxItem key={item.id} value={item}>
                {item.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
};

import { PencilSimpleIcon } from "@phosphor-icons/react";
import type { LedgerOutput } from "ledger/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AccountCombobox } from "../../../components/AccountCombobox.tsx";
import { CategoryCombobox, type CategorySelection } from "../../../components/CategoryCombobox.tsx";
import { DateField } from "../../../components/DateField.tsx";
import { ItemEditDialog, type ItemEditField } from "../../../components/ItemEditDialog.tsx";
import { StoreCombobox } from "../../../components/StoreCombobox.tsx";
import { useToastManager } from "@/components/ui/toast";
import { useMutation } from "../../../lib/useMutation.ts";
import { collectPageContent, findCategorySelectionByGenreId } from "../../../lib/extraction.ts";
import { createServerClient, withErrorMessage } from "../../../lib/serverClient";
import { categoriesQuery, placesQuery } from "../../../queries.ts";

interface Item {
  id: string;
  name: string;
  amount: string;
  memo: string;
  category: CategorySelection | null;
}

interface Props {
  serverUrl: string;
}

type DuplicateInfo = LedgerOutput<
  "/api/transactions/duplicates",
  "POST"
>["duplicates"][number][number];
type DuplicateState = "unchecked" | "checking" | "warned";

const newItem = (category: CategorySelection | null = null): Item => ({
  id: crypto.randomUUID(),
  name: "",
  amount: "",
  memo: "",
  category,
});

const localDateString = () => Temporal.Now.plainDateISO().toString();

const isItemReady = (item: Item): boolean =>
  parseInt(item.amount, 10) > 0 && item.category !== null && item.category.genreId > 0;

interface ItemRowProps {
  item: Item;
  serverUrl: string;
  onEdit: (field: ItemEditField) => void;
  onCategoryChange: (category: CategorySelection | null) => void;
  onRemove: () => void;
}

const ItemRow = ({ item, serverUrl, onEdit, onCategoryChange, onRemove }: ItemRowProps) => {
  const amountNum = parseInt(item.amount, 10);
  const amountLabel =
    Number.isInteger(amountNum) && amountNum > 0 ? amountNum.toLocaleString("ja-JP") : "0";

  return (
    <div className="flex flex-col gap-1 rounded-md border bg-card py-2 pl-2 pr-2">
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          type="button"
          className="min-w-0 flex-1 justify-start text-left font-normal"
          onClick={() => onEdit("name")}
          aria-label="品名を編集"
        >
          <span
            className={`min-w-0 truncate text-base ${item.name ? "text-foreground" : "text-muted-foreground"}`}
          >
            {item.name || "品名"}
          </span>
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onRemove} aria-label="品目を削除">
          ×
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          type="button"
          className="min-w-0 flex-1 justify-start text-left font-normal"
          onClick={() => onEdit("memo")}
          aria-label="メモを編集"
        >
          <PencilSimpleIcon
            size={12}
            className="shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span
            className={`min-w-0 truncate text-[11px] ${item.memo ? "text-foreground" : "text-muted-foreground"}`}
          >
            {item.memo || "メモ"}
          </span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          className="font-normal tabular-nums"
          onClick={() => onEdit("amount")}
          aria-label="金額を編集"
        >
          <span
            className={`text-base ${item.amount ? "text-foreground" : "text-muted-foreground"}`}
          >
            ¥{amountLabel}
          </span>
        </Button>
      </div>
      <CategoryCombobox
        serverUrl={serverUrl}
        value={item.category}
        onChange={onCategoryChange}
        size="sm"
        label={null}
      />
    </div>
  );
};

export default function MainScreen({ serverUrl }: Props) {
  const toastManager = useToastManager();
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [date, setDate] = useState(localDateString);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [duplicateState, setDuplicateState] = useState<DuplicateState>("unchecked");
  const [duplicatesByItemId, setDuplicatesByItemId] = useState<Record<string, DuplicateInfo[]>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editFocus, setEditFocus] = useState<ItemEditField>("name");
  const editingItem = items.find((item) => item.id === editingItemId) ?? null;

  const openItemEditor = (id: string, field: ItemEditField) => {
    setEditFocus(field);
    setEditingItemId(id);
  };

  const total = items.reduce((sum, item) => {
    const n = parseInt(item.amount, 10);
    return sum + (Number.isInteger(n) && n > 0 ? n : 0);
  }, 0);

  const updateItem = (id: string, patch: Partial<Omit<Item, "id">>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const itemsSignature = items
    .map((i) => `${i.id}:${i.amount}:${i.category?.genreId ?? ""}`)
    .join(",");
  useEffect(() => {
    setDuplicateState("unchecked");
    setDuplicatesByItemId({});
  }, [date, itemsSignature]);

  // 読み直しに失敗しても前の結果はフォームに残るので、読み直せるようボタンを出し続ける
  const [autofilled, setAutofilled] = useState(false);

  const extractMutation = useMutation({
    mutationFn: async (quality: "fast" | "accurate") => {
      const pageContent = await collectPageContent();
      // 内訳から親カテゴリを引くためにカテゴリの一覧も使う。カテゴリの選択欄が読み込み済みならキャッシュを使う
      const [extracted, { categories }] = await Promise.all([
        withErrorMessage(
          "自動入力",
          createServerClient(serverUrl)("/api/transactions/extract", "POST", {
            body: { pageContent, quality },
          }),
        ),
        withErrorMessage("カテゴリの取得", categoriesQuery.prefetch(serverUrl)),
      ]);
      return { extracted, categories };
    },
    onSuccess: ({ extracted, categories }) => {
      setAutofilled(true);
      if (extracted.date !== null) setDate(extracted.date);
      if (extracted.accountId !== null) setAccountId(extracted.accountId);
      if (extracted.placeName !== null) setPlaceName(extracted.placeName);
      if (extracted.items.length > 0) {
        setItems(
          extracted.items.map((item) => ({
            id: crypto.randomUUID(),
            name: item.name ?? "",
            amount: item.amount !== null ? String(item.amount) : "",
            memo: item.memo ?? "",
            category:
              item.genreId !== null
                ? findCategorySelectionByGenreId(categories, item.genreId)
                : null,
          })),
        );
      }
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const paymentItems = items.map((item) => {
        if (!item.category) throw new Error("カテゴリが選択されていません");
        return {
          genreId: item.category.genreId,
          name: item.name || null,
          memo: item.memo || null,
          amount: parseInt(item.amount, 10),
        };
      });
      await withErrorMessage(
        "登録",
        createServerClient(serverUrl)("/api/transactions", "POST", {
          body: { date, fromAccountId: accountId, placeName, items: paymentItems },
        }),
      );
    },
    onSuccess: () => {
      setAutofilled(false);
      setItems([newItem()]);
      setDate(localDateString());
      setAccountId(null);
      setPlaceName(null);
      setDuplicateState("unchecked");
      setDuplicatesByItemId({});
      toastManager.add({ description: "登録しました" });
      // 新しい店舗が増えたり並び順が変わったりするので取り直す。失敗しても今の一覧を使い続ける
      placesQuery.refetch(serverUrl).catch(() => {});
    },
  });

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!items.every(isItemReady)) return;

    if (duplicateState === "warned") {
      mutation.mutate();
      return;
    }

    setDuplicateState("checking");

    try {
      const checkedItems = items.map((item) => {
        if (!item.category) throw new Error("カテゴリが選択されていません");
        return { genreId: item.category.genreId, amount: parseInt(item.amount, 10) };
      });
      const { duplicates } = await createServerClient(serverUrl)(
        "/api/transactions/duplicates",
        "POST",
        { body: { date, items: checkedItems } },
      );

      // duplicates は送った items と同じ順に並ぶ
      const map = Object.fromEntries(
        items.map((item, index) => [item.id, duplicates[index] ?? []]),
      );
      setDuplicatesByItemId(map);
      const hasDup = duplicates.some((candidates) => candidates.length > 0);
      if (hasDup) {
        setDuplicateState("warned");
      } else {
        setDuplicateState("unchecked");
        mutation.mutate();
      }
    } catch {
      setDuplicateState("unchecked");
      setDuplicatesByItemId({});
    }
  };

  const canSubmit = items.length > 0 && items.every(isItemReady) && date !== "";

  const buttonLabel =
    duplicateState === "checking"
      ? "確認中…"
      : mutation.isPending
        ? "登録中…"
        : duplicateState === "warned"
          ? "重複があっても登録"
          : "登録";

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="secondary"
          disabled={extractMutation.isPending || mutation.isPending}
          onClick={() => extractMutation.mutate("fast")}
        >
          {extractMutation.isPending ? "自動入力中…" : "このページから自動入力"}
        </Button>
        {autofilled && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={extractMutation.isPending || mutation.isPending}
              onClick={() => extractMutation.mutate("accurate")}
            >
              もう一度読み取る
            </Button>
            <span className="text-xs text-muted-foreground">
              少し時間はかかりますが、より正確に読み取ります
            </span>
          </div>
        )}
        {extractMutation.isError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {extractMutation.error instanceof Error
              ? extractMutation.error.message
              : "自動入力に失敗しました"}
          </p>
        )}
      </div>
      <DateField value={date} onChange={setDate} required />
      <AccountCombobox serverUrl={serverUrl} value={accountId} onChange={setAccountId} />
      <StoreCombobox serverUrl={serverUrl} value={placeName} onChange={setPlaceName} />
      <section className="flex flex-col gap-3">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            serverUrl={serverUrl}
            onEdit={(field) => openItemEditor(item.id, field)}
            onCategoryChange={(category) => updateItem(item.id, { category })}
            onRemove={() => removeItem(item.id)}
          />
        ))}

        <Button
          className="self-start"
          size="sm"
          variant="ghost"
          type="button"
          onClick={() => setItems((prev) => [...prev, newItem(prev.at(-1)?.category ?? null)])}
        >
          + 品目を追加
        </Button>

        <div className="flex items-center justify-between border-t pt-2 pr-2">
          <span className="text-sm font-semibold text-foreground">合計</span>
          <span className="text-lg font-bold text-foreground">
            ¥{total.toLocaleString("ja-JP")}
          </span>
        </div>
      </section>

      {duplicateState === "warned" && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900"
        >
          <p className="font-medium">直近で同額の支払いが登録されている可能性があります：</p>
          <ul className="ml-4 list-disc">
            {items.flatMap((item) => {
              const dups = duplicatesByItemId[item.id] ?? [];
              if (dups.length === 0) return [];
              const amountNum = parseInt(item.amount, 10);
              return [
                <li key={item.id}>
                  {item.name || "(品目名なし)"} ¥{amountNum.toLocaleString("ja-JP")}（
                  {dups[0]?.date} に登録済み）
                </li>,
              ];
            })}
          </ul>
        </div>
      )}

      <Button
        type="submit"
        variant={duplicateState === "warned" ? "destructive" : "default"}
        disabled={!canSubmit || mutation.isPending || duplicateState === "checking"}
      >
        {buttonLabel}
      </Button>

      {mutation.isError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {mutation.error instanceof Error ? mutation.error.message : "登録に失敗しました"}
        </p>
      )}

      {editingItem && (
        <ItemEditDialog
          open={editingItemId !== null}
          onOpenChange={(open) => {
            if (!open) setEditingItemId(null);
          }}
          serverUrl={serverUrl}
          item={editingItem}
          initialFocus={editFocus}
          onChange={(patch) => updateItem(editingItem.id, patch)}
        />
      )}
    </form>
  );
}

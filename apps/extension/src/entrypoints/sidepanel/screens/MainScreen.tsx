import type { LedgerOutput } from "ledger/client";
import { PlusIcon, RotateCwIcon, ScanTextIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { comboboxTriggerClassName } from "@/components/ui/combobox";
import { AccountCombobox } from "../../../components/AccountCombobox.tsx";
import { CategoryCombobox, type CategorySelection } from "../../../components/CategoryCombobox.tsx";
import { DateField } from "../../../components/DateField.tsx";
import { ErrorMessage } from "../../../components/ErrorMessage.tsx";
import { YenUnit } from "../../../components/FormField.tsx";
import { ItemEditDialog, type ItemEditField } from "../../../components/ItemEditDialog.tsx";
import { StoreCombobox } from "../../../components/StoreCombobox.tsx";
import { useToastManager } from "@/components/ui/toast";
import { formatAmount, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  /** AI が読み取ったままの内訳と品名。自動入力した品目だけが持ち、フォームで直しても変えない */
  aiGuess?: { genreId: number | null; name: string | null };
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

/**
 * 品目 1 件の行。台帳の狭い画面の品目の行（apps/ledger/src/web/components/TransactionFields.tsx）にそろえ、
 * 内訳を小さく上に添え、その下に品目名と金額を並べ、メモはさらに下に置く。
 * 行の境目は欄の下線より濃い罫線にして、行の区切りと欄の下線を取り違えないようにする。
 */
const ItemRow = ({ item, serverUrl, onEdit, onCategoryChange, onRemove }: ItemRowProps) => {
  const amountNum = parseInt(item.amount, 10);
  const hasAmount = Number.isInteger(amountNum) && amountNum > 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7rem_1.75rem] items-end gap-x-4 border-b border-foreground/60 py-2">
      <div className="col-span-full">
        <CategoryCombobox
          serverUrl={serverUrl}
          value={item.category}
          onChange={onCategoryChange}
          variant="inline"
          hideLabel
        />
      </div>
      <button
        type="button"
        className={comboboxTriggerClassName}
        onClick={() => onEdit("name")}
        aria-label="品名を編集"
        title={item.name || undefined}
      >
        <span className={cn("min-w-0 flex-1 truncate", !item.name && "text-muted-foreground")}>
          {item.name || "品名"}
        </span>
      </button>
      <button
        type="button"
        className={cn(comboboxTriggerClassName, "justify-end gap-0.5 tabular-nums")}
        onClick={() => onEdit("amount")}
        aria-label="金額を編集"
      >
        <span className={cn("truncate", !hasAmount && "text-muted-foreground")}>
          {hasAmount ? formatAmount(amountNum) : "0"}
        </span>
        <YenUnit />
      </button>
      {/* ボタン（h-7）は欄（h-8）より低いので、欄と同じ高さの中で縦の中央に置く */}
      <div className="flex h-8 items-center justify-end">
        <Button
          size="icon-sm"
          variant="ghost"
          type="button"
          onClick={onRemove}
          aria-label="品目を削除"
        >
          <XIcon />
        </Button>
      </div>
      <button
        type="button"
        className={cn(comboboxTriggerClassName, "col-span-2 mt-1")}
        onClick={() => onEdit("memo")}
        aria-label="メモを編集"
        title={item.memo || undefined}
      >
        <span className={cn("min-w-0 flex-1 truncate", !item.memo && "text-muted-foreground")}>
          {item.memo || "メモ"}
        </span>
      </button>
    </div>
  );
};

/**
 * 品目の合計。一番大事な数字なので大きく出し、単位は小さく添えて数字を読む邪魔をしない。
 */
const ItemsTotal = ({ total, className }: { total: number; className?: string }) => (
  <div className={cn("flex items-baseline justify-between gap-3", className)}>
    <span className="text-xs text-muted-foreground">合計</span>
    <span className="text-2xl font-semibold tracking-tight tabular-nums">
      {formatAmount(total)}
      <YenUnit className="ml-0.5" />
    </span>
  </div>
);

export default function MainScreen({ serverUrl }: Props) {
  const toastManager = useToastManager();
  const itemsHeadingId = useId();
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
  // 自動入力で読み取ったモデル。登録のときに推測の記録へ残す
  const [readModel, setReadModel] = useState<string | null>(null);

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
      setReadModel(extracted.model);
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
            aiGuess: { genreId: item.genreId, name: item.name },
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
          aiGuess: item.aiGuess,
        };
      });
      await withErrorMessage(
        "登録",
        createServerClient(serverUrl)("/api/transactions", "POST", {
          body: {
            date,
            fromAccountId: accountId,
            placeName,
            items: paymentItems,
            ...(readModel !== null && { aiRead: { source: "page" as const, model: readModel } }),
          },
        }),
      );
    },
    onSuccess: () => {
      setAutofilled(false);
      setReadModel(null);
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
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={extractMutation.isPending || mutation.isPending}
          onClick={() => extractMutation.mutate("fast")}
        >
          <ScanTextIcon />
          {extractMutation.isPending ? "自動入力中…" : "このページから自動入力"}
        </Button>
        {autofilled && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={extractMutation.isPending || mutation.isPending}
              onClick={() => extractMutation.mutate("accurate")}
            >
              <RotateCwIcon />
              もう一度読み取る
            </Button>
            <span className="text-xs text-muted-foreground">
              少し時間はかかりますが、より正確に読み取ります
            </span>
          </div>
        )}
        {extractMutation.isError && (
          <ErrorMessage
            message={
              extractMutation.error instanceof Error
                ? extractMutation.error.message
                : "自動入力に失敗しました"
            }
          />
        )}
      </div>

      <div className="grid gap-y-4 border-t border-foreground pt-3">
        <DateField value={date} onChange={setDate} required />
        <AccountCombobox serverUrl={serverUrl} value={accountId} onChange={setAccountId} />
        <StoreCombobox serverUrl={serverUrl} value={placeName} onChange={setPlaceName} />
      </div>

      <section aria-labelledby={itemsHeadingId} className="flex flex-col">
        <h2 id={itemsHeadingId} className="pb-2 text-base font-semibold">
          品目
        </h2>
        <div className="border-t border-foreground">
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
        </div>
        <Button
          className="mt-1 -ml-2.5 self-start text-muted-foreground"
          variant="ghost"
          type="button"
          onClick={() => setItems((prev) => [...prev, newItem(prev.at(-1)?.category ?? null)])}
        >
          <PlusIcon />
          品目を追加
        </Button>
      </section>

      {/* 登録のボタンと合計は、品目が多くてスクロールしても見えるよう下の帯に置く（台帳のレシートの登録と同じ） */}
      <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-foreground bg-background py-2">
        {duplicateState === "warned" && (
          <div role="alert" className="flex gap-1.5 text-sm text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p>直近で同額の支払いが登録されている可能性があります：</p>
              <ul className="flex flex-col gap-0.5 text-foreground">
                {items.flatMap((item) => {
                  const dups = duplicatesByItemId[item.id] ?? [];
                  if (dups.length === 0) return [];
                  return [
                    <li key={item.id}>
                      {item.name || "(品目名なし)"} {formatYen(parseInt(item.amount, 10))}（
                      {dups[0]?.date} に登録済み）
                    </li>,
                  ];
                })}
              </ul>
            </div>
          </div>
        )}

        {mutation.isError && (
          <ErrorMessage
            message={
              mutation.error instanceof Error ? mutation.error.message : "登録に失敗しました"
            }
          />
        )}

        <div className="flex items-center justify-between gap-4">
          <ItemsTotal total={total} className="min-w-0 flex-1" />
          <Button
            type="submit"
            size="lg"
            className="shrink-0 px-8"
            variant={duplicateState === "warned" ? "destructive" : "default"}
            disabled={!canSubmit || mutation.isPending || duplicateState === "checking"}
          >
            {buttonLabel}
          </Button>
        </div>
      </div>

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

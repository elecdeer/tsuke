import type { LedgerOutput } from "ledger/client";
import { PlusIcon, RotateCwIcon, ScanTextIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@tsuke/ui/components/button";
import { SelectTriggerText, selectTriggerStyleProps } from "@tsuke/ui/components/select";
import { AccountCombobox } from "../../../components/AccountCombobox.tsx";
import { CategoryCombobox, type CategorySelection } from "../../../components/CategoryCombobox.tsx";
import { DateField } from "../../../components/DateField.tsx";
import { ErrorMessage } from "@tsuke/ui/patterns/ErrorMessage";
import { TotalAmount } from "@tsuke/ui/patterns/TotalAmount";
import { YenUnit } from "@tsuke/ui/patterns/YenUnit";
import { ItemEditDialog, type ItemEditField } from "../../../components/ItemEditDialog.tsx";
import { StoreCombobox } from "../../../components/StoreCombobox.tsx";
import { useToastManager } from "@tsuke/ui/components/toast";
import { formatAmount, formatYen } from "@tsuke/ui/lib/format";
import { cn } from "@tsuke/ui/lib/utils";
import { useMutation } from "../../../lib/useMutation.ts";
import { collectPageContent, findCategorySelectionByGenreId } from "../../../lib/extraction.ts";
import { createServerClient, withErrorMessage } from "../../../lib/serverClient";
import { categoriesQuery, placesQuery } from "../../../queries.ts";
import styles from "./MainScreen.module.css";

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

/**
 * 押すとモーダルを開く品目の欄。台帳の品目名・メモの欄と同じく、選択欄の見た目（下線）にする。
 */
const fieldTriggerProps = selectTriggerStyleProps({ width: "full" });

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
    <div className={styles.ItemRow}>
      <div className={styles.category}>
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
        {...fieldTriggerProps}
        onClick={() => onEdit("name")}
        aria-label="品名を編集"
        title={item.name || undefined}
      >
        <SelectTriggerText placeholder={!item.name}>{item.name || "品名"}</SelectTriggerText>
      </button>
      <button
        type="button"
        {...selectTriggerStyleProps({ width: "full", align: "end" })}
        onClick={() => onEdit("amount")}
        aria-label="金額を編集"
      >
        <SelectTriggerText placeholder={!hasAmount} align="end">
          {hasAmount ? formatAmount(amountNum) : "0"}
        </SelectTriggerText>
        <YenUnit />
      </button>
      <div className={styles.remove}>
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
        {...fieldTriggerProps}
        className={cn(fieldTriggerProps.className, styles.memo)}
        onClick={() => onEdit("memo")}
        aria-label="メモを編集"
        title={item.memo || undefined}
      >
        <SelectTriggerText placeholder={!item.memo}>{item.memo || "メモ"}</SelectTriggerText>
      </button>
    </div>
  );
};

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
    <form className={styles.MainScreen} onSubmit={handleSubmit}>
      <div className={styles.Autofill}>
        <Button
          type="button"
          variant="outline"
          className={styles.autofillButton}
          disabled={extractMutation.isPending || mutation.isPending}
          onClick={() => extractMutation.mutate("fast")}
        >
          <ScanTextIcon />
          {extractMutation.isPending ? "自動入力中…" : "このページから自動入力"}
        </Button>
        {autofilled && (
          <div className={styles.reread}>
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
            <span className={styles.rereadNote}>
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

      <div className={styles.Fields}>
        <DateField value={date} onChange={setDate} required />
        <AccountCombobox serverUrl={serverUrl} value={accountId} onChange={setAccountId} />
        <StoreCombobox serverUrl={serverUrl} value={placeName} onChange={setPlaceName} />
      </div>

      <section aria-labelledby={itemsHeadingId} className={styles.Items}>
        <h2 id={itemsHeadingId} className={styles.itemsTitle}>
          品目
        </h2>
        <div className={styles.itemList}>
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
          className={styles.addItem}
          variant="ghost"
          tone="muted"
          flush
          type="button"
          onClick={() => setItems((prev) => [...prev, newItem(prev.at(-1)?.category ?? null)])}
        >
          <PlusIcon />
          品目を追加
        </Button>
      </section>

      <div className={styles.Footer}>
        {duplicateState === "warned" && (
          <div role="alert" className={styles.duplicates}>
            <TriangleAlertIcon className={styles.duplicatesIcon} aria-hidden="true" />
            <div className={styles.duplicatesBody}>
              <p>直近で同額の支払いが登録されている可能性があります：</p>
              <ul className={styles.duplicatesList}>
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

        <div className={styles.footerRow}>
          <TotalAmount amount={total} className={styles.total} />
          <Button
            type="submit"
            size="lg"
            className={styles.submit}
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

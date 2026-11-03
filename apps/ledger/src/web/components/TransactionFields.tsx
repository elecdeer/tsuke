/**
 * 取引の入力欄の部品。取引の編集画面とレシートの登録画面で共有する。
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  selectTriggerClassName,
  SelectValue,
} from "@/components/ui/select";
import type { CategoryWithGenres } from "@/ledger/masters";
import type { TransactionMode } from "@/ledger/transactions";
import { categoryLabels, categoryValueOf } from "@/web/categoryValue";
import { CategoryOptions } from "@/web/components/CategoryOptions";
import { PlaceCandidates } from "@/web/components/PlaceCandidates";
import { PlaceMapDialog } from "@/web/components/PlaceMapDialog";
import { formatAmount } from "@/web/format";
import type { PlaceDetail } from "@/ledger/placeDetail";
import { placeDetailFor } from "@/web/placeMatching";
import { placeOptions, type PlaceOption } from "@/web/placeOptions";
import { emptyItem, moveItem, type ItemDraft } from "@/web/transactionDraft";
import { cn } from "@/lib/utils";

export type AccountOption = { id: number; name: string };

/**
 * 品目の列。広いところでは品目を 1 行に並べ、列の名前は表の見出しに 1 度だけ出す。
 * 取引の一覧のサイドパネルのような狭い場所にも置くので、画面の幅ではなく Section の幅（コンテナクエリ）で切り替える。
 * 支出は並べ替え・削除のボタンの列を持ち、振替・残高調整はカテゴリの列を持たない。
 */
const ITEM_COLUMNS: Record<TransactionMode, string> = {
  payment: "@xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_5.5rem]",
  income: "@xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_7rem]",
  transfer: "@xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]",
  adjustment: "@xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]",
};

/**
 * ラベル付きの入力欄。labelClassName でラベルを隠す（見出しのある表の中など）こともできる。
 */
export const FormField = ({
  label,
  children,
  htmlFor,
  labelClassName,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  labelClassName?: string;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <Label
      htmlFor={htmlFor}
      className={cn("text-xs font-normal text-muted-foreground", labelClassName)}
    >
      {label}
    </Label>
    {children}
  </div>
);

/**
 * 口座の選択。選んでいる口座が一覧にない（アーカイブした）ときも、その値を選択肢に残す。
 */
export const AccountSelect = ({
  id,
  value,
  accounts,
  allowEmpty,
  onChange,
}: {
  id: string;
  value: string;
  accounts: AccountOption[];
  allowEmpty: boolean;
  onChange: (value: string) => void;
}) => {
  const unknown = value !== "" && !accounts.some((account) => String(account.id) === value);
  const items: Record<string, string> = {
    "": allowEmpty ? "なし" : "選んでください",
    ...(unknown ? { [value]: `一覧にない口座（#${value}）` } : {}),
    ...Object.fromEntries(accounts.map((account) => [String(account.id), account.name])),
  };
  return (
    <Select items={items} value={value} onValueChange={(next) => onChange(next ?? "")}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="">なし</SelectItem>}
        {unknown && <SelectItem value={value}>{items[value]}</SelectItem>}
        {accounts.map((account) => (
          <SelectItem key={account.id} value={String(account.id)}>
            {account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/**
 * 店舗（取引先）の入力欄。過去の店舗から選ぶか、一覧にない名前を打ち込んで追加する。
 * 地図から近くの店舗を選んで、その名前を入れることもできる。
 */
export const PlaceInput = ({
  id,
  value,
  detail,
  placeNames,
  chainNames,
  onChange,
}: {
  id: string;
  value: string;
  detail: PlaceDetail | null;
  placeNames: string[];
  chainNames: string[];
  onChange: (value: string, detail: PlaceDetail | null) => void;
}) => {
  const [query, setQuery] = useState("");
  const { contains } = ComboboxPrimitive.useFilter();
  const selected: PlaceOption | null = value === "" ? null : { name: value, isNew: false };
  const masters = { placeNames, chainNames };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Combobox
        items={placeOptions(placeNames, query)}
        value={selected}
        onValueChange={(next: PlaceOption | null) => {
          const name = next?.name ?? "";
          onChange(name, placeDetailFor(name, masters));
        }}
        inputValue={query}
        onInputValueChange={setQuery}
        isItemEqualToValue={(a: PlaceOption, b: PlaceOption) => a.name === b.name}
        itemToStringLabel={(option: PlaceOption) => option.name}
        // 追加の候補は入力した名前そのものなので、絞り込みに関わらず常に出す
        filter={(option: PlaceOption, q: string) => option.isNew || contains(option.name, q)}
      >
        <div className="flex min-w-0 items-center gap-0.5">
          <ComboboxTrigger
            id={id}
            data-size="default"
            className={cn(selectTriggerClassName, "w-full font-normal")}
          >
            <span
              className={cn(
                "line-clamp-1 flex-1 text-left",
                value === "" && "text-muted-foreground",
              )}
            >
              {value === "" ? "なし" : value}
            </span>
          </ComboboxTrigger>
          {value !== "" && (
            <ComboboxClear
              render={<Button variant="ghost" size="icon-sm" aria-label="店舗を消す" />}
            />
          )}
          <PlaceMapDialog
            onSelect={(poi) => onChange(poi.name, placeDetailFor(poi.name, masters, poi))}
          />
        </div>
        <ComboboxContent>
          <ComboboxInput placeholder="検索・追加" showTrigger={false} />
          <ComboboxEmpty>過去の店舗はありません</ComboboxEmpty>
          <ComboboxList>
            {(option: PlaceOption) => (
              <ComboboxItem key={`${option.isNew}:${option.name}`} value={option}>
                {option.isNew ? (
                  <>
                    <Plus aria-hidden="true" />「{option.name}」を追加
                  </>
                ) : (
                  option.name
                )}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {detail !== null && (
        <PlaceCandidates name={value} detail={detail} masters={masters} onChange={onChange} />
      )}
    </div>
  );
};

/**
 * 品目 1 件の入力欄。支出と収入ではカテゴリも選ぶ。
 */
const ItemFields = ({
  mode,
  item,
  index,
  count,
  categories,
  onChange,
  onMove,
  onRemove,
}: {
  mode: TransactionMode;
  item: ItemDraft;
  index: number;
  count: number;
  categories: CategoryWithGenres[];
  onChange: (patch: Partial<ItemDraft>) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
}) => {
  const ids = { category: useId(), name: useId(), memo: useId(), amount: useId() };
  const hasCategory = mode === "payment" || mode === "income";
  const known =
    item.category === "" ||
    categories.some(
      (category) =>
        item.category === categoryValueOf(category.id, null) ||
        category.genres.some((genre) => item.category === categoryValueOf(category.id, genre.id)),
    );

  return (
    <div
      className={cn(
        // 広い画面では入力欄の下線が行の区切りを兼ねるので、行の罫線は狭い画面（欄を積むとき）だけに引く
        "grid grid-cols-2 gap-x-4 gap-y-2 border-b py-3 @xl:items-end @xl:border-b-0 @xl:py-2",
        ITEM_COLUMNS[mode],
      )}
    >
      {hasCategory && (
        <FormField
          label={mode === "payment" ? "内訳" : "カテゴリ"}
          htmlFor={ids.category}
          labelClassName="@xl:sr-only"
        >
          <Select
            items={{
              "": "未分類",
              ...(known ? {} : { [item.category]: "一覧にないカテゴリ" }),
              ...categoryLabels(categories),
            }}
            value={item.category}
            onValueChange={(value) => onChange({ category: value ?? "" })}
          >
            <SelectTrigger id={ids.category} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">未分類</SelectItem>
              {!known && <SelectItem value={item.category}>一覧にないカテゴリ</SelectItem>}
              {mode === "income" ? (
                // 収入は内訳を持たないので、カテゴリだけを並べる
                categories.map((category) => (
                  <SelectItem key={category.id} value={categoryValueOf(category.id, null)}>
                    {category.name}
                  </SelectItem>
                ))
              ) : (
                <CategoryOptions label="支出" categories={categories} />
              )}
            </SelectContent>
          </Select>
        </FormField>
      )}
      <FormField label="品目名" htmlFor={ids.name} labelClassName="@xl:sr-only">
        <Input
          id={ids.name}
          value={item.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </FormField>
      <FormField label="メモ" htmlFor={ids.memo} labelClassName="@xl:sr-only">
        <Input
          id={ids.memo}
          value={item.memo}
          onChange={(event) => onChange({ memo: event.target.value })}
        />
      </FormField>
      <FormField label="金額" htmlFor={ids.amount} labelClassName="@xl:sr-only">
        <Input
          id={ids.amount}
          inputMode="numeric"
          className="text-right tabular-nums"
          value={item.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
        />
      </FormField>
      {mode === "payment" && (
        <div className="col-span-2 flex justify-end gap-0.5 @xl:col-span-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="上へ"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="下へ"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="品目を消す"
            disabled={count === 1}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  );
};

/**
 * 品目の表と合計。支出では品目を足す・並べ替える・消すこともできる。
 *
 * `categories` は取引の種類に合うもの（支出なら支出の、収入なら収入のカテゴリ）を渡す。
 */
export const ItemsFields = ({
  mode,
  items,
  categories,
  onChange,
}: {
  mode: TransactionMode;
  items: ItemDraft[];
  categories: CategoryWithGenres[];
  onChange: (items: ItemDraft[]) => void;
}) => {
  const total = items.reduce(
    (sum, item) => sum + (Number(item.amount.replaceAll(",", "")) || 0),
    0,
  );
  const updateItem = (index: number, patch: Partial<ItemDraft>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          "hidden gap-x-4 border-b border-foreground pb-1.5 text-xs text-muted-foreground @xl:grid",
          ITEM_COLUMNS[mode],
        )}
      >
        {(mode === "payment" || mode === "income") && (
          <span>{mode === "payment" ? "内訳" : "カテゴリ"}</span>
        )}
        <span>品目名</span>
        <span>メモ</span>
        <span className="text-right">金額</span>
      </div>
      {/* 狭い画面では見出しを出さないので、表の始まりの線をここで引く */}
      <div className="border-t border-foreground @xl:border-t-0">
        {items.map((item, index) => (
          <ItemFields
            key={item.key}
            mode={mode}
            item={item}
            index={index}
            count={items.length}
            categories={categories}
            onChange={(patch) => updateItem(index, patch)}
            onMove={(offset) => onChange(moveItem(items, index, offset))}
            onRemove={() => onChange(items.filter((_, i) => i !== index))}
          />
        ))}
      </div>
      {mode === "payment" && (
        <Button
          variant="ghost"
          className="mt-1 -ml-2.5 text-muted-foreground"
          onClick={() =>
            onChange([...items, emptyItem(Math.max(-1, ...items.map((item) => item.key)) + 1)])
          }
        >
          <Plus />
          品目を足す
        </Button>
      )}
      <div className="mt-3 flex items-baseline justify-between border-t border-foreground pt-2">
        <span className="text-xs text-muted-foreground">合計</span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {formatAmount(total)}
        </span>
      </div>
    </>
  );
};

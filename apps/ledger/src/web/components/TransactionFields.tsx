/**
 * 取引の入力欄の部品。取引の編集・手入力の登録・レシートの登録の画面で共有する。
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import {
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import type { CategoryWithGenres } from "@/ledger/masters";
import type { TransactionMode } from "@/ledger/transactions";
import { categoryLabels, categoryValueOf } from "@/web/categoryValue";
import { CategoryOptions } from "@/web/components/CategoryOptions";
import { PlaceCandidates } from "@/web/components/PlaceCandidates";
import { PlaceMapDialog } from "@/web/components/PlaceMapDialog";
import { Section } from "@/web/components/Section";
import { formatAmount } from "@/web/format";
import { AGGREGATION_LABELS } from "@/web/labels";
import type { PlaceDetail } from "@/ledger/placeDetail";
import { placeDetailFor } from "@/web/placeMatching";
import { placeOptions, type PlaceOption } from "@/web/placeOptions";
import {
  emptyItem,
  moveItem,
  toSingleLine,
  type ItemDraft,
  type TransactionDraft,
} from "@/web/transactionDraft";
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
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  labelClassName?: string;
  className?: string;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
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

/** モーダルで編集する品目の欄 */
type ItemTextField = "name" | "memo";

/**
 * 品目名・メモの欄。長い文字列は省略して出し、押すとモーダルを開く。全文はホバーでも読める。
 */
const ItemTextButton = ({
  id,
  value,
  onClick,
}: {
  id: string;
  value: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    id={id}
    data-size="default"
    title={value === "" ? undefined : value}
    className={cn(selectTriggerClassName, "w-full")}
    onClick={onClick}
  >
    <span className="min-w-0 flex-1 truncate text-left">{value}</span>
  </button>
);

/**
 * 品目名・メモを編集するモーダル。入力はそのまま品目に反映し、`initialFocus` の欄にフォーカスを当てて開く。
 *
 * 1 行の値だが、長くても全文を読めるよう折り返して出す。改行は入らないようにする。
 */
const ItemTextDialog = ({
  open,
  initialFocus,
  item,
  onOpenChange,
  onChange,
}: {
  open: boolean;
  initialFocus: ItemTextField;
  item: ItemDraft;
  onOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<ItemDraft>) => void;
}) => {
  const ids = { name: useId(), memo: useId() };
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const memoRef = useRef<HTMLTextAreaElement>(null);
  // 開いた直後のカーソルが先頭に来ると、続きを打つときに動かす手間がかかる
  const moveCaretToEnd = (event: FocusEvent<HTMLTextAreaElement>) => {
    const { length } = event.target.value;
    event.target.setSelectionRange(length, length);
  };
  const closeOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 変換を確定する Enter では閉じない
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={initialFocus === "name" ? nameRef : memoRef}
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>品目を編集</DialogTitle>
        </DialogHeader>
        <FormField label="品目名" htmlFor={ids.name}>
          <Textarea
            ref={nameRef}
            id={ids.name}
            enterKeyHint="done"
            value={item.name}
            onChange={(event) => onChange({ name: toSingleLine(event.target.value) })}
            onFocus={moveCaretToEnd}
            onKeyDown={closeOnEnter}
          />
        </FormField>
        <FormField label="メモ" htmlFor={ids.memo}>
          <Textarea
            ref={memoRef}
            id={ids.memo}
            enterKeyHint="done"
            value={item.memo}
            onChange={(event) => onChange({ memo: toSingleLine(event.target.value) })}
            onFocus={moveCaretToEnd}
            onKeyDown={closeOnEnter}
          />
        </FormField>
        <DialogFooter>
          <DialogClose render={<Button />}>完了</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * 品目 1 件の入力欄。支出と収入ではカテゴリも選ぶ。
 *
 * 狭いところでは内訳と金額を横に並べ、品目名とメモに両列を使う。
 * 内訳のない種類では金額の隣が空くので、メモと金額を横に並べる。
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
  const [editing, setEditing] = useState<ItemTextField | null>(null);
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
          className="order-first @xl:order-none"
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
      <FormField
        label="品目名"
        htmlFor={ids.name}
        labelClassName="@xl:sr-only"
        className="col-span-2 @xl:col-span-1"
      >
        <ItemTextButton id={ids.name} value={item.name} onClick={() => setEditing("name")} />
      </FormField>
      <FormField
        label="メモ"
        htmlFor={ids.memo}
        labelClassName="@xl:sr-only"
        className={cn(hasCategory && "col-span-2 @xl:col-span-1")}
      >
        <ItemTextButton id={ids.memo} value={item.memo} onClick={() => setEditing("memo")} />
      </FormField>
      <FormField
        label="金額"
        htmlFor={ids.amount}
        labelClassName="@xl:sr-only"
        className={cn(hasCategory && "order-first @xl:order-none")}
      >
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
      <ItemTextDialog
        open={editing !== null}
        initialFocus={editing ?? "name"}
        item={item}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onChange={onChange}
      />
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

/** 残高調整の向きの選択肢の名前 */
const DIRECTION_LABELS = { increase: "残高を増やす", decrease: "残高を減らす" } as const;

/**
 * 残高調整の口座の入力欄。「増やす / 減らす」と口座で入れ、増やすなら入金先、減らすなら支払元に入れる。
 *
 * 向きは口座を選ぶ前にも選べるよう、入力中の値とは別に持つ（口座が空だと入力中の値からは向きが分からない）。
 */
const AdjustmentFields = ({
  draft,
  accounts,
  update,
}: {
  draft: TransactionDraft;
  accounts: AccountOption[];
  update: (patch: Partial<TransactionDraft>) => void;
}) => {
  const directionId = useId();
  const accountId = useId();
  const [increases, setIncreases] = useState(draft.toAccountId !== "");
  const account = increases ? draft.toAccountId : draft.fromAccountId;
  const setAdjustment = (nextIncreases: boolean, nextAccount: string) => {
    setIncreases(nextIncreases);
    update(
      nextIncreases
        ? { toAccountId: nextAccount, fromAccountId: "" }
        : { fromAccountId: nextAccount, toAccountId: "" },
    );
  };
  return (
    <>
      <FormField label="向き" htmlFor={directionId}>
        <Select
          items={DIRECTION_LABELS}
          value={increases ? "increase" : "decrease"}
          onValueChange={(value) => setAdjustment(value === "increase", account)}
        >
          <SelectTrigger id={directionId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="increase">{DIRECTION_LABELS.increase}</SelectItem>
            <SelectItem value="decrease">{DIRECTION_LABELS.decrease}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="口座" htmlFor={accountId}>
        <AccountSelect
          id={accountId}
          value={account}
          accounts={accounts}
          allowEmpty={false}
          onChange={(value) => setAdjustment(increases, value)}
        />
      </FormField>
    </>
  );
};

/**
 * 種類ごとの口座の入力欄。
 */
const AccountFields = ({
  mode,
  draft,
  accounts,
  update,
}: {
  mode: TransactionMode;
  draft: TransactionDraft;
  accounts: AccountOption[];
  update: (patch: Partial<TransactionDraft>) => void;
}) => {
  const fromId = useId();
  const toId = useId();

  if (mode === "adjustment") {
    return <AdjustmentFields draft={draft} accounts={accounts} update={update} />;
  }

  return (
    <>
      {(mode === "payment" || mode === "transfer") && (
        <FormField label="支払元" htmlFor={fromId}>
          <AccountSelect
            id={fromId}
            value={draft.fromAccountId}
            accounts={accounts}
            allowEmpty={mode === "payment"}
            onChange={(value) => update({ fromAccountId: value })}
          />
        </FormField>
      )}
      {(mode === "income" || mode === "transfer") && (
        <FormField label="入金先" htmlFor={toId}>
          <AccountSelect
            id={toId}
            value={draft.toAccountId}
            accounts={accounts}
            allowEmpty={mode === "income"}
            onChange={(value) => update({ toAccountId: value })}
          />
        </FormField>
      )}
    </>
  );
};

/**
 * 取引の入力欄ひとそろい（日付・集計の設定・口座・店舗と品目）。編集と手入力の登録で使う。
 */
export const TransactionDraftFields = ({
  mode,
  heading,
  draft,
  accounts,
  categories,
  placeNames,
  chainNames,
  update,
}: {
  mode: TransactionMode;
  heading: ReactNode;
  draft: TransactionDraft;
  accounts: AccountOption[];
  categories: { payment: CategoryWithGenres[]; income: CategoryWithGenres[] };
  placeNames: string[];
  chainNames: string[];
  update: (patch: Partial<TransactionDraft>) => void;
}) => {
  const ids = { date: useId(), place: useId(), aggregation: useId() };
  return (
    <>
      <Section label={heading}>
        <div className="grid gap-x-6 gap-y-4 border-t border-foreground pt-3 @md:grid-cols-2">
          <FormField label="日付" htmlFor={ids.date}>
            <Input
              id={ids.date}
              type="date"
              required
              value={draft.date}
              onChange={(event) => update({ date: event.target.value })}
            />
          </FormField>
          <FormField label="集計の設定" htmlFor={ids.aggregation}>
            <Select
              items={AGGREGATION_LABELS}
              value={draft.aggregation}
              onValueChange={(next) => {
                const aggregation = (["always", "never", "yearly_only"] as const).find(
                  (value) => value === next,
                );
                if (aggregation !== undefined) update({ aggregation });
              }}
            >
              <SelectTrigger id={ids.aggregation} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["always", "never", "yearly_only"] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {AGGREGATION_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <AccountFields mode={mode} draft={draft} accounts={accounts} update={update} />
          {(mode === "payment" || mode === "income") && (
            <FormField label={mode === "payment" ? "店舗" : "取引先"} htmlFor={ids.place}>
              <PlaceInput
                id={ids.place}
                value={draft.placeName}
                detail={draft.placeDetail}
                placeNames={placeNames}
                chainNames={chainNames}
                onChange={(placeName, placeDetail) => update({ placeName, placeDetail })}
              />
            </FormField>
          )}
        </div>
      </Section>

      <Section label="品目">
        <ItemsFields
          mode={mode}
          items={draft.items}
          categories={mode === "income" ? categories.income : categories.payment}
          onChange={(items) => update({ items })}
        />
      </Section>
    </>
  );
};

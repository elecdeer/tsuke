/**
 * 取引の入力欄の部品。取引の編集・手入力の登録・レシートの登録の画面で共有する。
 */
import { ArrowDown, ArrowUp, Ellipsis, MessageSquarePlus, Plus, Trash2 } from "lucide-react";
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
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  itemsTotal,
  moveItem,
  toSingleLine,
  type ItemDraft,
  type TransactionDraft,
} from "@/web/transactionDraft";
import { cn } from "@/lib/utils";

export type AccountOption = { id: number; name: string };

/**
 * 品目の列。列の名前は表の見出しに 1 度だけ出す。
 *
 * 狭いところでは内訳を小さく上に添え、その下に品目名と金額を並べ、メモはさらに下に置く。
 * 広いところでは品目を 1 行に並べる。
 * 取引の一覧のサイドパネルのような狭い場所にも置くので、画面の幅ではなく Section の幅（コンテナクエリ）で切り替える。
 * 支出は並べ替え・削除のメニューの列を持ち、振替・残高調整はカテゴリの列を持たない。
 */
const ITEM_COLUMNS: Record<TransactionMode, string> = {
  payment:
    "grid-cols-[minmax(0,1fr)_7rem_1.75rem] @xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_1.75rem]",
  income:
    "grid-cols-[minmax(0,1fr)_7rem] @xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_7rem]",
  transfer: "grid-cols-[minmax(0,1fr)_7rem] @xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]",
  adjustment: "grid-cols-[minmax(0,1fr)_7rem] @xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]",
};

/**
 * 金額に添える単位。順序は文字の大きさと太さで付ける（docs/design.md）ので、数字より小さく細く出す。
 */
const YenUnit = ({ className }: { className?: string }) => (
  <span className={cn("text-xs font-normal tracking-normal text-muted-foreground", className)}>
    円
  </span>
);

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
 * 店舗（取引先）の入力欄。欄にそのまま打ち込み、過去の店舗から選ぶか、一覧にない名前を追加する。
 * 地図から近くの店舗を選んで、その名前を入れることもできる。
 *
 * 押すと検索の欄を別に開く形は、打ち始めるまでに 2 回押す必要があり、影と角丸の箱がほかの欄（下線だけ）から浮くので、
 * 店舗の欄そのものを入力にし、候補は欄の下に罫線で区切って並べる。
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
  // 欄に出す文字。打ち込んだだけでは店舗を変えず、候補を選んだときに変える
  const [query, setQuery] = useState(value);
  // 読み取りや地図から店舗が変わったら、欄の文字もその名前にする
  const [shownValue, setShownValue] = useState(value);
  if (shownValue !== value) {
    setShownValue(value);
    setQuery(value);
  }
  const anchor = useComboboxAnchor();
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
        onOpenChange={(open) => {
          // 選ばずに閉じたら、打ちかけの文字を捨てて選んでいる店舗に戻す。選んで閉じたときは、
          // 上で新しい店舗の名前に合わせ直す
          if (!open) setQuery(value);
        }}
        isItemEqualToValue={(a: PlaceOption, b: PlaceOption) => a.name === b.name}
        itemToStringLabel={(option: PlaceOption) => option.name}
        // 欄はフォームの中にあるので、候補が選ばれていないと Enter でフォームを送ってしまう。
        // 打ち込んだら先頭の候補を選んだ状態にして、Enter でその候補に決まるようにする
        autoHighlight
        // 追加の候補は入力した名前そのものなので、絞り込みに関わらず常に出す
        filter={(option: PlaceOption, q: string) => option.isNew || contains(option.name, q)}
      >
        <div ref={anchor} className="flex min-w-0 items-center gap-0.5">
          <ComboboxPrimitive.Input id={id} placeholder="なし" render={<Input />} />
          {value !== "" && (
            <ComboboxClear
              render={<Button variant="ghost" size="icon-sm" aria-label="店舗を消す" />}
            />
          )}
          <PlaceMapDialog
            onSelect={(poi) => onChange(poi.name, placeDetailFor(poi.name, masters, poi))}
          />
        </div>
        <ComboboxContent
          // 欄の右のボタンまで含めた幅で、欄のすぐ下に出す
          anchor={anchor}
          sideOffset={0}
          // 箱ではなく欄の続きに見せたいので、影・角丸・枠をやめ、下の端だけ黒の線で閉じる（docs/design.md）
          className="rounded-none border-b border-foreground bg-background shadow-none ring-0"
        >
          <ComboboxEmpty className="justify-start py-2 text-left">
            過去の店舗はありません
          </ComboboxEmpty>
          <ComboboxList className="p-0">
            {(option: PlaceOption) => (
              <ComboboxItem
                key={`${option.isNew}:${option.name}`}
                value={option}
                className="rounded-none border-b py-2 pl-0 last:border-b-0 data-highlighted:bg-muted"
              >
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
  placeholder,
  onClick,
}: {
  id: string;
  value: string;
  /** 空のときに薄く出す文字。列の見出しを出さない狭い場所で、何の欄かを示す */
  placeholder?: string;
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
    {value === "" && placeholder !== undefined ? (
      <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">{placeholder}</span>
    ) : (
      <span className="min-w-0 flex-1 truncate text-left">{value}</span>
    )}
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
 * 狭いところでは、品目を見分ける品目名と金額を 1 行目に、内訳を 2 行目に小さく置く。
 * 列の名前は表の見出しに出すので、欄ごとのラベルは読み上げ用にだけ残す。
 *
 * 支出のメモは空のことが多いので、狭いところでは空の欄を隠し、行のメニューに追加の項目を出す。
 * 広いところではメモは表の列なので、列がずれないよう空でも欄を残す。
 * 並べ替え・削除は毎回使うものではないので、行ごとのボタンを並べずメニューにまとめる。
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
  const memoCollapsed = mode === "payment" && item.memo === "";
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
        // 広い画面では入力欄の下線が行の区切りを兼ねるので、行の罫線は狭い画面（欄を積むとき）だけに引く。
        // 欄の下線（foreground/40）より薄いと品目の区切りと欄の下線を取り違えるので、下線より濃くする
        "grid items-end gap-x-4 gap-y-0 border-b border-foreground/60 py-2 @xl:gap-y-2 @xl:border-b-0",
        ITEM_COLUMNS[mode],
      )}
    >
      {hasCategory && (
        <FormField
          label={mode === "payment" ? "内訳" : "カテゴリ"}
          htmlFor={ids.category}
          labelClassName="sr-only"
          // 品目名の上に小さく添える。品目名と金額を同じ段に並べ、欄の高さをそろえるため
          className="order-1 col-span-full @xl:order-none @xl:col-span-1"
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
            <SelectTrigger
              id={ids.category}
              // 狭いところでは品目名に添える見出しのように、低く小さく薄く出す
              // 下線も消し、下の品目名の欄と取り違えないようにする
              className="w-fit max-w-full border-transparent text-xs text-muted-foreground data-[size=default]:h-6 @xl:w-full @xl:border-foreground/40 @xl:text-sm @xl:text-foreground @xl:data-[size=default]:h-8"
            >
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
        labelClassName="sr-only"
        className="order-2 @xl:order-none"
      >
        <ItemTextButton
          id={ids.name}
          value={item.name}
          placeholder="品目名"
          onClick={() => setEditing("name")}
        />
      </FormField>
      <FormField
        label="メモ"
        htmlFor={ids.memo}
        labelClassName="sr-only"
        className={cn(
          "order-5 col-span-full @xl:order-none @xl:col-span-1",
          memoCollapsed && "hidden @xl:flex",
        )}
      >
        <ItemTextButton
          id={ids.memo}
          value={item.memo}
          placeholder="メモ"
          onClick={() => setEditing("memo")}
        />
      </FormField>
      <FormField
        label="金額"
        htmlFor={ids.amount}
        labelClassName="sr-only"
        className="order-3 @xl:order-none"
      >
        <div className="relative">
          <Input
            id={ids.amount}
            inputMode="numeric"
            className="pr-4 text-right tabular-nums"
            value={item.amount}
            onChange={(event) => onChange({ amount: event.target.value })}
          />
          {/* 入力欄の文字と同じ大きさの行に置き、小さくした「円」の下端を数字にそろえる */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 py-1 text-sm"
          >
            <YenUnit />
          </span>
        </div>
      </FormField>
      {mode === "payment" && (
        // ボタン（h-7）は欄（h-8）より低く、下端でそろえると欄の文字より下に寄るので、欄と同じ高さの中で縦の中央に置く
        <div className="order-4 flex h-8 items-center justify-end @xl:order-none">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="品目の操作" />}
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto">
              {memoCollapsed && (
                // 広いところではメモの欄がいつも見えているので、追加の項目は要らない
                <DropdownMenuItem className="@xl:hidden" onClick={() => setEditing("memo")}>
                  <MessageSquarePlus />
                  メモを追加
                </DropdownMenuItem>
              )}
              <DropdownMenuItem disabled={index === 0} onClick={() => onMove(-1)}>
                <ArrowUp />
                上へ
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index === count - 1} onClick={() => onMove(1)}>
                <ArrowDown />
                下へ
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={count === 1} onClick={onRemove}>
                <Trash2 />
                品目を消す
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
 * 品目の合計。一番大事な数字なので大きく出し、単位は小さく添えて数字を読む邪魔をしない。
 */
export const ItemsTotal = ({ items, className }: { items: ItemDraft[]; className?: string }) => (
  <div className={cn("flex items-baseline justify-between gap-3", className)}>
    <span className="text-xs text-muted-foreground">合計</span>
    <span className="text-2xl font-semibold tracking-tight tabular-nums">
      {formatAmount(itemsTotal(items))}
      <YenUnit className="ml-0.5" />
    </span>
  </div>
);

/**
 * 品目の表。支出では品目を足す・並べ替える・消すこともできる。合計は置き場所が画面ごとに違うので、`ItemsTotal` で別に出す。
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
  const updateItem = (index: number, patch: Partial<ItemDraft>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          "grid gap-x-4 border-b border-foreground pb-1.5 text-xs text-muted-foreground",
          ITEM_COLUMNS[mode],
        )}
      >
        {/* 狭いところでは品目名と金額の見出しだけを出す */}
        {(mode === "payment" || mode === "income") && (
          <span className="hidden @xl:block">{mode === "payment" ? "内訳" : "カテゴリ"}</span>
        )}
        <span>品目名</span>
        <span className="hidden @xl:block">メモ</span>
        <span className="text-right">金額</span>
      </div>
      <div>
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
  onItemsChange,
}: {
  mode: TransactionMode;
  heading: ReactNode;
  draft: TransactionDraft;
  accounts: AccountOption[];
  categories: { payment: CategoryWithGenres[]; income: CategoryWithGenres[] };
  placeNames: string[];
  chainNames: string[];
  update: (patch: Partial<TransactionDraft>) => void;
  onItemsChange: (items: ItemDraft[]) => void;
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
              // 紐付いた収入は保存時に必ず「集計に含めない」になるので、選べないようにする
              disabled={(draft.reimbursements ?? []).length > 0}
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
          onChange={onItemsChange}
        />
        <ItemsTotal items={draft.items} className="mt-3 border-t border-foreground pt-2" />
      </Section>
    </>
  );
};

/**
 * 取引の入力欄の部品。取引の編集・手入力の登録・レシートの登録の画面で共有する。
 */
import {
  ArrowDown,
  ArrowUp,
  Ellipsis,
  MessageSquarePlus,
  MessageSquareText,
  Plus,
  Trash2,
} from "lucide-react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import {
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "@tsuke/ui/components/button";
import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxField,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@tsuke/ui/components/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tsuke/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tsuke/ui/components/dropdown-menu";
import { Input } from "@tsuke/ui/components/input";
import { AmountInput } from "@tsuke/ui/patterns/AmountInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectTriggerText,
  selectTriggerStyleProps,
  SelectValue,
} from "@tsuke/ui/components/select";
import { Textarea } from "@tsuke/ui/components/textarea";
import type { CategoryWithGenres } from "@/ledger/masters";
import type { TransactionMode } from "@/ledger/transactions";
import { categoryLabels, categoryValueOf } from "@/web/categoryValue";
import { CategoryOptions } from "@/web/components/CategoryOptions";
import { PlaceCandidates } from "@/web/components/PlaceCandidates";
import { PlaceMapDialog } from "@/web/components/PlaceMapDialog";
import { Section } from "@tsuke/ui/patterns/Section";
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
import { cn } from "@tsuke/ui/lib/utils";
import { FormField } from "@tsuke/ui/patterns/FormField";
import { TotalAmount } from "@tsuke/ui/patterns/TotalAmount";
import styles from "./TransactionFields.module.css";

export type AccountOption = { id: number; name: string };

/**
 * 口座の選択。選んでいる口座が一覧にない（アーカイブした）ときも、その値を選択肢に残す。
 */
export const AccountSelect = ({
  id,
  value,
  accounts,
  allowEmpty,
  invalid = false,
  onChange,
}: {
  id: string;
  value: string;
  accounts: AccountOption[];
  allowEmpty: boolean;
  /** 選ばれていないなどで、欄を赤くして直してほしいことを示す */
  invalid?: boolean;
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
      <SelectTrigger id={id} width="full" aria-invalid={invalid || undefined}>
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
 * 押すと検索の欄を別に開く形は、打ち始めるまでに 2 回押す必要があるので、店舗の欄そのものを入力にし、
 * 候補はほかの選択欄と同じ浮く面に並べる。
 */
export const PlaceInput = ({
  id,
  value,
  detail,
  placeNames,
  chainNames,
  warnNewPlace = false,
  onChange,
}: {
  id: string;
  value: string;
  detail: PlaceDetail | null;
  placeNames: string[];
  chainNames: string[];
  /** 新しい店舗になることを、案内ではなく警告として目立たせる */
  warnNewPlace?: boolean;
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
    <div className={styles.PlaceInput}>
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
        <ComboboxField ref={anchor}>
          <ComboboxPrimitive.Input id={id} placeholder="なし" render={<Input />} />
          {value !== "" && (
            <ComboboxClear
              render={<Button variant="ghost" size="icon-sm" aria-label="店舗を消す" />}
            />
          )}
          <PlaceMapDialog
            onSelect={(poi) => onChange(poi.name, placeDetailFor(poi.name, masters, poi))}
          />
        </ComboboxField>
        <ComboboxContent
          // 欄の右のボタンまで含めた幅で出す。見た目はほかの選択欄の一覧と揃えて浮く面にする。
          // 欄の続きに見せる inline は、この欄の一覧だけが違う見た目になるのでやめた
          anchor={anchor}
        >
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
        <PlaceCandidates
          name={value}
          detail={detail}
          masters={masters}
          warn={warnNewPlace}
          onChange={onChange}
        />
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
  icon,
  onClick,
}: {
  id: string;
  value: string;
  /** 空のときに薄く出す文字。列の見出しを出さない狭い場所で、何の欄かを示す */
  placeholder?: string;
  /** 文字の前に出すアイコン。値が入っていても何の欄かが分かるようにする */
  icon?: ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    id={id}
    title={value === "" ? undefined : value}
    {...selectTriggerStyleProps({ width: "full" })}
    onClick={onClick}
  >
    {icon !== undefined && <span className={styles.ItemTextIcon}>{icon}</span>}
    {value === "" && placeholder !== undefined ? (
      <SelectTriggerText placeholder>{placeholder}</SelectTriggerText>
    ) : (
      <SelectTriggerText>{value}</SelectTriggerText>
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
      <DialogContent initialFocus={initialFocus === "name" ? nameRef : memoRef} size="lg">
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
    <div className={`${styles.ItemGrid} ${styles.ItemRow}`} data-mode={mode}>
      {hasCategory && (
        <FormField
          label={mode === "payment" ? "内訳" : "カテゴリ"}
          htmlFor={ids.category}
          hideLabel
          className={styles.categoryField}
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
              variant="caption-on-narrow"
              width="full"
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
      <FormField label="品目名" htmlFor={ids.name} hideLabel className={styles.nameField}>
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
        hideLabel
        className={cn(styles.memoField, memoCollapsed && styles.collapsed)}
      >
        <ItemTextButton
          id={ids.memo}
          value={item.memo}
          placeholder="メモ"
          // 品目名と同じ見た目の欄が並ぶので、入力済みでもメモの欄だと分かるようにする
          icon={<MessageSquareText aria-hidden="true" />}
          onClick={() => setEditing("memo")}
        />
      </FormField>
      <FormField label="金額" htmlFor={ids.amount} hideLabel className={styles.amountField}>
        <AmountInput
          id={ids.amount}
          inputMode="numeric"
          value={item.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
        />
      </FormField>
      {mode === "payment" && (
        <div className={styles.menu}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="品目の操作" />}
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" width="auto">
              {memoCollapsed && (
                // 広いところではメモの欄がいつも見えているので、追加の項目は要らない
                <DropdownMenuItem onClick={() => setEditing("memo")}>
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
 * 品目の合計。一番大事な数字なので大きく出す。
 */
export const ItemsTotal = ({
  items,
  ruled = false,
  className,
}: {
  items: ItemDraft[];
  /** まとまりの始まりとして、上に黒の線を引く */
  ruled?: boolean;
  /** 並べる側が、合計の置き場所（余白・幅）を決めるときに使う */
  className?: string;
}) => <TotalAmount amount={itemsTotal(items)} ruled={ruled} className={className} />;

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
        className={`${styles.ItemGrid} ${styles.ItemHeader}`}
        data-mode={mode}
      >
        {(mode === "payment" || mode === "income") && (
          <span>{mode === "payment" ? "内訳" : "カテゴリ"}</span>
        )}
        <span>品目名</span>
        <span>メモ</span>
        <span className={styles.headerAmount}>金額</span>
      </div>
      {/* 狭いところでは見出しの行を出さないので、表の始まりの線をここで引く */}
      <div className={styles.ItemList}>
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
          tone="muted"
          flush
          className={styles.AddItem}
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
          <SelectTrigger id={directionId} width="full">
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
  requireFromAccount,
  showInvalid,
  update,
}: {
  mode: TransactionMode;
  draft: TransactionDraft;
  accounts: AccountOption[];
  requireFromAccount: boolean;
  showInvalid: boolean;
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
            allowEmpty={mode === "payment" && !requireFromAccount}
            invalid={requireFromAccount && showInvalid && draft.fromAccountId === ""}
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
  requireFromAccount = false,
  showInvalid = false,
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
  /**
   * 支出の支払元を必ず選ばせる。新しく登録する画面で使う。
   * 編集では、支払元のない取り込んだ支出も保存し直せるよう、空のままにできる
   */
  requireFromAccount?: boolean;
  /** 登録を試みた後など、入力が足りない欄を赤くする */
  showInvalid?: boolean;
  update: (patch: Partial<TransactionDraft>) => void;
  onItemsChange: (items: ItemDraft[]) => void;
}) => {
  const ids = { date: useId(), place: useId(), aggregation: useId() };
  return (
    <>
      <Section label={heading}>
        <div className={styles.Fields}>
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
              <SelectTrigger id={ids.aggregation} width="full">
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
          <AccountFields
            mode={mode}
            draft={draft}
            accounts={accounts}
            requireFromAccount={requireFromAccount}
            showInvalid={showInvalid}
            update={update}
          />
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
        <ItemsTotal items={draft.items} ruled className={styles.Total} />
      </Section>
    </>
  );
};

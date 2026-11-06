import { Link, useRouter } from "@void/react";
import { type TransitionEvent, useState } from "react";
import { submitAction } from "void/pages-client";
import { Maximize2, Plus, RotateCcw, TriangleAlert, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  TransactionFilter,
  TransactionListItem,
  TransactionMode,
} from "@/ledger/transactions";
import { advanceStatusOf, unreceivedAmountOf } from "@/ledger/advance";
import { cn } from "@/lib/utils";
import { categoryLabels, categoryValueOf, parseCategoryValue } from "@/web/categoryValue";
import { Section } from "@/web/components/Section";
import { FavoriteButton } from "@/web/components/FavoriteButton";
import { TransactionEditor } from "@/web/components/TransactionEditor";
import { CategoryOptions } from "@/web/components/CategoryOptions";
import { MonthHeading } from "@/web/components/MonthHeading";
import { MonthPager } from "@/web/components/MonthPager";
import { Skeleton } from "@/web/components/Skeleton";
import { formatAmount, formatDayOfMonth, formatFullDay } from "@/web/format";
import { groupByDate } from "@/web/groupByDate";
import { ADVANCE_STATUS_LABELS, MODE_LABELS, TRANSACTION_MODES } from "@/web/labels";
import { titleOf } from "@/web/transactionTitle";
import { isFiltered, transactionsHref } from "@/web/transactionsHref";
import type { Props } from "./index.server";

/** 立替の絞り込みの選択肢 */
const ADVANCE_FILTER_LABELS = { any: "立替あり", unreceived: "未入金" } as const;
const ADVANCE_FILTERS = ["any", "unreceived"] as const;

/**
 * 種類・口座・カテゴリの絞り込み。選ぶとすぐにその条件の一覧へ移る。
 * 何か絞り込んでいれば、月だけを残してすべて外すリセットを出す。
 */
const Filters = ({
  filter,
  accounts,
  categories,
  placeName,
  chainNames,
}: Pick<Props, "filter" | "accounts" | "categories" | "placeName" | "chainNames">) => {
  const router = useRouter();
  const visit = (next: Partial<TransactionFilter>) => {
    void router.visit(transactionsHref({ ...filter, ...next }), { preserveScroll: true });
  };
  const modeItems: Record<string, string> = { "": "すべての種類", ...MODE_LABELS };
  const accountItems: Record<string, string> = {
    "": "すべての口座",
    ...Object.fromEntries(accounts.map((account) => [String(account.id), account.name])),
  };
  const categoryItems: Record<string, string> = {
    "": "すべてのカテゴリ",
    ...categoryLabels(categories.payment),
    ...categoryLabels(categories.income),
  };

  const advanceItems: Record<string, string> = {
    "": "立替を問わない",
    ...ADVANCE_FILTER_LABELS,
  };

  const chainItems: Record<string, string> = {
    "": "すべてのチェーン",
    ...Object.fromEntries(chainNames.map((chain) => [chain, chain])),
  };

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <Select
        items={modeItems}
        value={filter.mode ?? ""}
        onValueChange={(value) => {
          const mode = TRANSACTION_MODES.find((candidate) => candidate === value);
          visit({ mode });
        }}
      >
        <SelectTrigger size="sm" aria-label="種類">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">すべての種類</SelectItem>
          {TRANSACTION_MODES.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {MODE_LABELS[mode]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={accountItems}
        value={filter.accountId === undefined ? "" : String(filter.accountId)}
        onValueChange={(value) =>
          visit({ accountId: value === null || value === "" ? undefined : Number(value) })
        }
      >
        <SelectTrigger size="sm" aria-label="口座">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">すべての口座</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={String(account.id)}>
              {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={categoryItems}
        value={categoryValueOf(filter.categoryId ?? null, filter.genreId ?? null)}
        onValueChange={(value) => {
          const { categoryId, genreId } = parseCategoryValue(value ?? "");
          visit({ categoryId: categoryId ?? undefined, genreId: genreId ?? undefined });
        }}
      >
        <SelectTrigger size="sm" aria-label="カテゴリ">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">すべてのカテゴリ</SelectItem>
          <CategoryOptions label="支出" categories={categories.payment} />
          <CategoryOptions label="収入" categories={categories.income} />
        </SelectContent>
      </Select>
      <Select
        items={advanceItems}
        value={filter.advance ?? ""}
        onValueChange={(value) =>
          visit({ advance: ADVANCE_FILTERS.find((candidate) => candidate === value) })
        }
      >
        <SelectTrigger size="sm" aria-label="立替">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">立替を問わない</SelectItem>
          {ADVANCE_FILTERS.map((advance) => (
            <SelectItem key={advance} value={advance}>
              {ADVANCE_FILTER_LABELS[advance]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {chainNames.length > 0 && (
        <Select
          items={chainItems}
          value={filter.chain ?? ""}
          onValueChange={(value) =>
            visit({ chain: value === null || value === "" ? undefined : value })
          }
        >
          <SelectTrigger size="sm" aria-label="チェーン">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">すべてのチェーン</SelectItem>
            {chainNames.map((chain) => (
              <SelectItem key={chain} value={chain}>
                {chain}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {filter.placeId !== undefined && (
        <span className="flex h-7 items-center gap-1 border-b border-foreground text-sm">
          {placeName ?? "（削除された店舗）"}
          <button
            type="button"
            aria-label="店舗の絞り込みを外す"
            className="p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => visit({ placeId: undefined })}
          >
            <X className="size-3.5" />
          </button>
        </span>
      )}
      {isFiltered(filter) && (
        <Link
          href={transactionsHref({ month: filter.month })}
          preserveScroll
          className="flex h-7 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          リセット
        </Link>
      )}
    </div>
  );
};

/**
 * 一覧に出している取引の件数と、支出と収入の合計。
 */
const ListTotals = ({ transactions }: { transactions: TransactionListItem[] }) => {
  const sumOf = (mode: TransactionMode) =>
    transactions
      .filter((transaction) => transaction.mode === mode)
      .reduce((total, transaction) => total + transaction.total, 0);
  const advanceTotal = transactions.reduce(
    (total, transaction) => total + transaction.advanceAmount,
    0,
  );
  return (
    <dl className="flex flex-wrap gap-x-5 text-xs text-muted-foreground">
      <div className="flex gap-1.5">
        <dt>件数</dt>
        <dd className="text-foreground tabular-nums">{transactions.length}</dd>
      </div>
      <div className="flex gap-1.5">
        <dt>支出</dt>
        <dd className="text-foreground tabular-nums">{formatAmount(sumOf("payment"))}</dd>
      </div>
      {advanceTotal > 0 && (
        <div className="flex gap-1.5">
          <dt>うち立替</dt>
          <dd className="text-foreground tabular-nums">{formatAmount(advanceTotal)}</dd>
        </div>
      )}
      <div className="flex gap-1.5">
        <dt>収入</dt>
        <dd className="text-foreground tabular-nums">{formatAmount(sumOf("income"))}</dd>
      </div>
    </dl>
  );
};

/**
 * 品目の要約。1 件ならその名前、複数なら「最初の品目名 ほか N 件」。
 */
const itemsSummaryOf = (transaction: TransactionListItem): string | null => {
  const [first, ...rest] = transaction.items;
  if (first === undefined) return null;
  const firstName = first.name ?? first.memo;
  if (rest.length === 0) return transaction.placeName === null ? null : firstName;
  return `${firstName ?? "品目"} ほか ${rest.length} 件`;
};

/**
 * 取引の口座。振替は「元 → 先」にする。
 */
const accountsOf = (transaction: TransactionListItem): string | null => {
  const { fromAccountName, toAccountName } = transaction;
  if (fromAccountName !== null && toAccountName !== null) {
    return `${fromAccountName} → ${toAccountName}`;
  }
  return fromAccountName ?? toAccountName;
};

/**
 * 取引の品目のカテゴリ（内訳）を重複なく並べる。
 */
const categoriesOf = (transaction: TransactionListItem): string[] => [
  ...new Set(
    transaction.items
      .filter((item) => item.categoryName !== null || item.genreName !== null)
      .map((item) => item.genreName ?? item.categoryName ?? ""),
  ),
];

/**
 * 金額の書き方。収入には「+」を付けてお金の向きを示す。
 */
const amountOf = (transaction: TransactionListItem): string =>
  transaction.mode === "income"
    ? `+${formatAmount(transaction.total)}`
    : formatAmount(transaction.total);

/**
 * 立替の額と状態の書き方。立替のない取引には null を返す。
 */
const advanceSummaryOf = (transaction: TransactionListItem): string | null => {
  const { advanceAmount, linkedAmount } = transaction;
  const status = advanceStatusOf(advanceAmount, linkedAmount);
  if (status === "none") return null;
  const summary = `うち立替 ${formatAmount(advanceAmount)}・${ADVANCE_STATUS_LABELS[status]}`;
  return status === "partial"
    ? `${summary}（残り ${formatAmount(unreceivedAmountOf(advanceAmount, linkedAmount))}）`
    : summary;
};

/** サイドパネルで詳細を開く画面の幅。一覧とパネルを並べても一覧の 12 列のグリッドが崩れない幅にする */
const SIDE_PANEL_MEDIA = "(min-width: 80rem)";

/**
 * 取引 1 件の行。押すと編集画面へ移る。広い画面では画面を移らず、一覧の横のサイドパネルで開く。
 *
 * 振替と残高調整はお金の出入りではないので、行全体を薄くして支出・収入と見分ける。
 */
const TransactionRow = ({
  transaction,
  filter,
  selected,
}: {
  transaction: TransactionListItem;
  filter: TransactionFilter;
  selected: boolean;
}) => {
  const router = useRouter();
  const summary = itemsSummaryOf(transaction);
  const accountName = accountsOf(transaction);
  const details = [summary, ...categoriesOf(transaction)].filter((value) => value !== null);
  const isMove = transaction.mode === "transfer" || transaction.mode === "adjustment";
  const advanceSummary = advanceSummaryOf(transaction);
  return (
    <li className="border-b">
      <Link
        // JavaScript が動く前や狭い画面では、取引の画面へ移る
        href={`/transactions/${transaction.id}`}
        aria-current={selected ? "true" : undefined}
        onNavigate={(event) => {
          if (!window.matchMedia(SIDE_PANEL_MEDIA).matches) return;
          event.preventDefault();
          void router.visit(transactionsHref(filter, transaction.id), { preserveScroll: true });
        }}
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_6rem] items-baseline gap-x-4 py-2.5 hover:bg-muted/60 sm:grid-cols-[minmax(0,1fr)_9rem_6rem]",
          isMove && "text-muted-foreground",
          selected && "bg-muted",
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate">
            {transaction.mode !== "payment" && (
              <span className="mr-2 text-xs text-muted-foreground">
                {MODE_LABELS[transaction.mode]}
              </span>
            )}
            {titleOf(transaction)}
          </span>
          {(details.length > 0 || accountName !== null) && (
            <span className="truncate text-xs text-muted-foreground">
              {details.join("・")}
              {/* 狭い画面では口座の列を出さないので、ここに続けて書く */}
              {accountName !== null && (
                <span className="sm:hidden">
                  {details.length > 0 && "・"}
                  {accountName}
                </span>
              )}
            </span>
          )}
          {advanceSummary !== null && (
            <span className="truncate text-xs text-muted-foreground tabular-nums">
              {advanceSummary}
            </span>
          )}
          {transaction.aggregation !== "always" && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <TriangleAlert className="size-3.5" aria-hidden="true" />
              {transaction.aggregation === "never" ? "集計に含めない" : "年の集計にのみ含める"}
            </span>
          )}
        </span>
        <span className="hidden truncate text-xs text-muted-foreground sm:block">
          {accountName}
        </span>
        <span className="text-right tabular-nums">{amountOf(transaction)}</span>
      </Link>
    </li>
  );
};

/**
 * 広い画面で一覧の横に出す、取引の編集のパネル。
 *
 * 取引の画面のアクションを呼ぶとその画面へ移ってしまうので、一覧の画面のアクションを一覧のクエリ付きで呼び、
 * 一覧とパネルをその場で描き直す。
 */
const SidePanel = ({
  filter,
  selected,
  closing,
  accounts,
  categories,
  chainNames,
}: Pick<Props, "filter" | "accounts" | "categories" | "chainNames"> & {
  selected: NonNullable<Props["selected"]>;
  /** 閉じるアニメーションの間だけ、閉じる前の取引を出しておく。操作はさせない */
  closing: boolean;
}) => {
  const router = useRouter();
  // 別の取引を開いても「保存しました」が残らないよう、保存した取引の ID で持つ
  const [savedId, setSavedId] = useState<number | null>(null);
  const { transaction } = selected;
  // 名前付きのアクションは `?update` のようにクエリの先頭に名前を付けて呼ぶ。残りのクエリが描き直す一覧になる
  const actionUrl = (name: "update" | "delete" | "favorite", selectedId?: number) =>
    `/transactions?${name}&${transactionsHref(filter, selectedId).split("?")[1]}`;

  return (
    <aside
      aria-label="取引の編集"
      inert={closing}
      className={cn(
        "ml-8 flex max-h-[calc(100dvh-var(--header-height)-2rem)] w-md shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain border-l pl-6 transition-opacity duration-300 animate-in fade-in motion-reduce:transition-none motion-reduce:animate-none",
        closing && "opacity-0",
      )}
    >
      <div className="flex items-center gap-1">
        <div className="mr-auto">
          <FavoriteButton
            favorite={selected.isFavorite}
            label="よく使う取引"
            showLabel
            onToggle={(favorite) =>
              submitAction(router, actionUrl("favorite", transaction.id), {
                method: "POST",
                data: { favorite },
                preserveScroll: true,
              })
            }
          />
        </div>
        <Link
          href={`/transactions/${transaction.id}`}
          aria-label="取引の画面で開く"
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <Maximize2 className="size-4" aria-hidden="true" />
        </Link>
        <Link
          href={transactionsHref(filter)}
          preserveScroll
          aria-label="パネルを閉じる"
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {/* 保存すると loader の値が変わるので、key を変えて入力中の値を保存した内容で作り直す */}
      <TransactionEditor
        key={JSON.stringify(transaction)}
        transaction={transaction}
        accounts={accounts}
        categories={categories}
        placeNames={selected.placeNames}
        reimbursementCandidates={selected.reimbursementCandidates}
        chainNames={chainNames}
        saved={savedId === transaction.id}
        onSavedChange={(saved) => setSavedId(saved ? transaction.id : null)}
        onSave={(input) =>
          submitAction(router, actionUrl("update", transaction.id), {
            method: "POST",
            data: input,
            preserveScroll: true,
          })
        }
        onDelete={() =>
          // selected を外した一覧に送り、消したあとはパネルを閉じた一覧にする
          submitAction(router, actionUrl("delete"), {
            method: "POST",
            data: { id: transaction.id },
            preserveScroll: true,
          })
        }
      />
    </aside>
  );
};

/**
 * 取引の一覧の画面。日付ごとにまとめ、日付を左の列に出す。
 * 広い画面で取引を選ぶと、一覧の右にサイドパネルを開いてその場で編集できる。
 */
const TransactionsPage = ({
  filter,
  transactions,
  accounts,
  categories,
  placeName,
  chainNames,
  selected,
}: Props) => {
  // パネルを閉じても列が縮みきるまでは中身を残すため、最後に開いた取引を持っておく
  const [shown, setShown] = useState(selected);
  if (selected !== null && selected !== shown) setShown(selected);
  // 未入金は全期間の一覧なので、月を移るときは絞り込みを外してその月の一覧にする
  const monthHref = (month: string) =>
    transactionsHref({
      ...filter,
      month,
      advance: filter.advance === "unreceived" ? undefined : filter.advance,
    });
  const unreceivedOnly = filter.advance === "unreceived";

  /**
   * パネルの列が縮みきったら、残しておいた中身を外す。中の要素のトランジションも届くので、列の幅の変化だけを見る。
   */
  const onTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName === "grid-template-columns" && selected === null) setShown(null);
  };

  // 月を移るときに横に送るのは件数と合計、取引の一覧だけにし、月の見出しと絞り込みは動かさない
  const list = (
    <div className="flex flex-col gap-8">
      <Section label="" className="gap-y-0">
        <ListTotals transactions={transactions} />
      </Section>
      {transactions.length === 0 ? (
        <Section label="">
          <p className="border-t border-foreground py-2.5 text-sm text-muted-foreground">
            条件に合う取引はありません
          </p>
        </Section>
      ) : (
        <div>
          {groupByDate(transactions).map((group, index) => (
            <Section
              key={group.date}
              className="gap-y-0"
              label={
                <span className="block pt-2.5 text-xs font-normal text-muted-foreground tabular-nums">
                  {unreceivedOnly ? formatFullDay(group.date) : formatDayOfMonth(group.date)}
                </span>
              }
            >
              {/* 一覧の始まりにだけ黒の線を引く */}
              <ul className={cn(index === 0 && "border-t border-foreground")}>
                {group.items.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    filter={filter}
                    selected={selected?.transaction.id === transaction.id}
                  />
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      // パネルの列は閉じていても 0 幅で置いておき、開け閉めで列の幅を動かす。
      // 一覧の幅も同時にレイアウトの最大幅のトランジションで広がるので、同じ長さにそろえる
      className={cn(
        "grid xl:grid-cols-[minmax(0,1fr)_0rem] xl:items-start xl:transition-[grid-template-columns] xl:duration-300 xl:ease-out motion-reduce:transition-none",
        selected !== null && "xl:grid-cols-[minmax(0,1fr)_30rem]",
      )}
      onTransitionEnd={onTransitionEnd}
    >
      <div className="flex min-w-0 flex-col gap-8">
        <div className="grid gap-x-4 gap-y-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-3">
            {unreceivedOnly ? (
              <h1 className="text-2xl font-semibold">未入金の立替</h1>
            ) : (
              <MonthHeading month={filter.month} hrefOf={monthHref} />
            )}
          </div>
          <div className="flex flex-col gap-3 md:col-span-9">
            <div className="flex items-start justify-between gap-x-5">
              <Filters
                filter={filter}
                accounts={accounts}
                categories={categories}
                placeName={placeName}
                chainNames={chainNames}
              />
              <div className="flex shrink-0 items-center gap-3">
                <Link
                  href="/statements/import"
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  CSV の取り込み
                </Link>
                <Link
                  href="/transactions/new"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <Plus aria-hidden="true" />
                  追加
                </Link>
              </div>
            </div>
          </div>
        </div>
        {unreceivedOnly ? (
          list
        ) : (
          <MonthPager
            month={filter.month}
            hrefOf={monthHref}
            placeholder={() => (
              <Section label="" className="gap-y-0">
                <Skeleton rows={8} />
              </Section>
            )}
          >
            {list}
          </MonthPager>
        )}
      </div>
      {/*
       * 列の幅に合わせて中身を切り取り、右に寄せておくことで、パネルが右から滑り込んで見えるようにする。
       * overflow: hidden だとスクロールの箱になって sticky が効かなくなるので clip にする
       */}
      <div className="hidden xl:sticky xl:top-[calc(var(--header-height)+1rem)] xl:flex xl:justify-end xl:overflow-clip">
        {shown !== null && (
          <SidePanel
            filter={filter}
            selected={shown}
            closing={selected === null}
            accounts={accounts}
            categories={categories}
            chainNames={chainNames}
          />
        )}
      </div>
    </div>
  );
};

export default TransactionsPage;

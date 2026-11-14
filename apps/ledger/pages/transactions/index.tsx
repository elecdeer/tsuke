import { Link, useRouter } from "@void/react";
import { type TransitionEvent, useEffect, useState } from "react";
import { submitAction } from "void/pages-client";
import { Maximize2, Plus, RotateCcw, TriangleAlert, X } from "lucide-react";
import { buttonStyleProps } from "@tsuke/ui/components/button";
import { Drawer, DrawerContent, DrawerTitle } from "@tsuke/ui/components/drawer";
import { visuallyHiddenClassName } from "@tsuke/ui/lib/a11y";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tsuke/ui/components/select";
import type {
  TransactionFilter,
  TransactionListItem,
  TransactionMode,
} from "@/ledger/transactions";
import { advanceStatusOf, unreceivedAmountOf } from "@/ledger/advance";
import { isYearPeriod, shiftPeriod } from "@/ledger/dates";
import { categoryLabels, categoryValueOf, parseCategoryValue } from "@/web/categoryValue";
import { Section } from "@tsuke/ui/patterns/Section";
import { FavoriteButton } from "@/web/components/FavoriteButton";
import { TransactionEditor } from "@/web/components/TransactionEditor";
import { CategoryOptions } from "@/web/components/CategoryOptions";
import { MonthHeading, StickyMonthBar, useMonthHeadingHidden } from "@/web/components/MonthHeading";
import { PeriodPager } from "@/web/components/PeriodPager";
import { PeriodViewSwitch } from "@/web/components/PeriodViewSwitch";
import { YearHeading } from "@/web/components/YearHeading";
import { SkeletonBlock, SkeletonText } from "@/web/components/Skeleton";
import { formatAmount, formatDayOfMonth, formatMonthDay } from "@/web/format";
import { groupByDate } from "@/web/groupByDate";
import { ADVANCE_STATUS_LABELS, MODE_LABELS, TRANSACTION_MODES } from "@/web/labels";
import { titleOf } from "@/web/transactionTitle";
import { createMonthPageCache } from "@/web/monthPageCache";
import { useMediaQuery } from "@/web/mediaQuery";
import { monthForYear } from "@/web/summaryView";
import { isFiltered, transactionsHref } from "@/web/transactionsHref";
import type { Props } from "./index.server";
import styles from "./index.module.css";

/** 立替の絞り込みの選択肢 */
const ADVANCE_FILTER_LABELS = { any: "立替あり", unreceived: "未入金" } as const;
const ADVANCE_FILTERS = ["any", "unreceived"] as const;

/**
 * 種類・口座・カテゴリの絞り込み。選ぶとすぐにその条件の一覧へ移る。
 * 何か絞り込んでいれば、期間だけを残してすべて外すリセットを出す。
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
    <div className={styles.Filters}>
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
        <span className={styles.placeChip}>
          {placeName ?? "（削除された店舗）"}
          <button
            type="button"
            aria-label="店舗の絞り込みを外す"
            className={styles.chipRemove}
            onClick={() => visit({ placeId: undefined })}
          >
            <X className={styles.chipRemoveIcon} />
          </button>
        </span>
      )}
      {isFiltered(filter) && (
        <Link
          href={transactionsHref({ period: filter.period })}
          preserveScroll
          className={styles.reset}
        >
          <RotateCcw className={styles.resetIcon} aria-hidden="true" />
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
    <dl className={styles.Totals}>
      <div className={styles.total}>
        <dt>件数</dt>
        <dd className={styles.totalValue}>{transactions.length}</dd>
      </div>
      <div className={styles.total}>
        <dt>支出</dt>
        <dd className={styles.totalValue}>{formatAmount(sumOf("payment"))}</dd>
      </div>
      {advanceTotal > 0 && (
        <div className={styles.total}>
          <dt>うち立替</dt>
          <dd className={styles.totalValue}>{formatAmount(advanceTotal)}</dd>
        </div>
      )}
      <div className={styles.total}>
        <dt>収入</dt>
        <dd className={styles.totalValue}>{formatAmount(sumOf("income"))}</dd>
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

/** サイドパネルで詳細を開く画面の幅。これより狭い画面では下から出るシートで開く。一覧とパネルを並べても一覧の 12 列のグリッドが崩れない幅にする */
const SIDE_PANEL_MEDIA = "(min-width: 80rem)";

/**
 * 取引 1 件の行。押すと画面を移らずに取引を開く。広い画面では一覧の横のサイドパネル、狭い画面では下から出るシートで開く。
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
    <li className={styles.TransactionRow}>
      <Link
        // JavaScript が動く前は、取引の画面へ移る
        href={`/transactions/${transaction.id}`}
        aria-current={selected ? "true" : undefined}
        onNavigate={(event) => {
          event.preventDefault();
          void router.visit(transactionsHref(filter, transaction.id), { preserveScroll: true });
        }}
        className={styles.rowLink}
        data-move={isMove || undefined}
      >
        <span className={styles.main}>
          <span className={styles.title}>
            {transaction.mode !== "payment" && (
              <span className={styles.mode}>{MODE_LABELS[transaction.mode]}</span>
            )}
            {titleOf(transaction)}
          </span>
          {(details.length > 0 || accountName !== null) && (
            <span className={styles.details}>
              {details.join("・")}
              {/* 狭い画面では口座の列を出さないので、ここに続けて書く */}
              {accountName !== null && (
                <span className={styles.detailsAccount}>
                  {details.length > 0 && "・"}
                  {accountName}
                </span>
              )}
            </span>
          )}
          {advanceSummary !== null && <span className={styles.advance}>{advanceSummary}</span>}
          {transaction.aggregation !== "always" && (
            <span className={styles.aggregation}>
              <TriangleAlert className={styles.aggregationIcon} aria-hidden="true" />
              {transaction.aggregation === "never" ? "集計に含めない" : "年の集計にのみ含める"}
            </span>
          )}
        </span>
        <span className={styles.account}>{accountName}</span>
        <span className={styles.amount}>{amountOf(transaction)}</span>
      </Link>
    </li>
  );
};

/** サイドパネルとシートに共通の、開いている取引についての値 */
type PanelProps = Pick<Props, "filter" | "accounts" | "categories" | "chainNames"> & {
  selected: NonNullable<Props["selected"]>;
};

/**
 * 開いている取引の編集。広い画面のサイドパネルと、狭い画面のシートの中身。
 *
 * 取引の画面のアクションを呼ぶとその画面へ移ってしまうので、一覧の画面のアクションを一覧のクエリ付きで呼び、
 * 一覧とパネルをその場で描き直す。
 */
const TransactionPanel = ({
  filter,
  selected,
  accounts,
  categories,
  chainNames,
  showPageLink,
}: PanelProps & {
  /** 取引の画面で開くリンクを出すか。シートは画面を移らずに見るためのものなので出さない */
  showPageLink: boolean;
}) => {
  const router = useRouter();
  // 別の取引を開いても「保存しました」が残らないよう、保存した取引の ID で持つ
  const [savedId, setSavedId] = useState<number | null>(null);
  const { transaction } = selected;
  // 名前付きのアクションは `?update` のようにクエリの先頭に名前を付けて呼ぶ。残りのクエリが描き直す一覧になる
  const actionUrl = (name: "update" | "delete" | "favorite", selectedId?: number) =>
    `/transactions?${name}&${transactionsHref(filter, selectedId).split("?")[1]}`;

  return (
    <>
      <div className={styles.PanelHeader}>
        <div className={styles.favorite}>
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
        {showPageLink && (
          <Link
            href={`/transactions/${transaction.id}`}
            aria-label="取引の画面で開く"
            className={styles.panelLink}
          >
            <Maximize2 className={styles.panelIcon} aria-hidden="true" />
          </Link>
        )}
        <Link
          href={transactionsHref(filter)}
          preserveScroll
          aria-label="パネルを閉じる"
          className={styles.panelLink}
        >
          <X className={styles.panelIcon} aria-hidden="true" />
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
    </>
  );
};

/**
 * 広い画面で一覧の横に出す、取引の編集のパネル。
 */
const SidePanel = ({
  closing,
  ...props
}: PanelProps & {
  /** 閉じるアニメーションの間だけ、閉じる前の取引を出しておく。操作はさせない */
  closing: boolean;
}) => (
  <aside
    aria-label="取引の編集"
    inert={closing}
    className={styles.SidePanel}
    data-closing={closing || undefined}
  >
    <TransactionPanel {...props} showPageLink />
  </aside>
);

/**
 * 狭い画面で下から出す、取引の編集のシート。閉じると一覧の URL から selected を外す。
 */
const PanelSheet = ({
  open,
  onClosed,
  selected,
  ...props
}: Omit<PanelProps, "selected"> & {
  /** 閉じるアニメーションの間も、閉じる前の取引を出しておく。まだ何も開いていなければ null */
  selected: PanelProps["selected"] | null;
  open: boolean;
  /** 閉じるアニメーションが終わったとき */
  onClosed: () => void;
}) => {
  const router = useRouter();
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) void router.visit(transactionsHref(props.filter), { preserveScroll: true });
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed();
      }}
    >
      {selected !== null && (
        <DrawerContent>
          <DrawerTitle className={visuallyHiddenClassName}>取引の編集</DrawerTitle>
          <TransactionPanel {...props} selected={selected} showPageLink={false} />
        </DrawerContent>
      )}
    </Drawer>
  );
};

/** 最近見た月の一覧。キーは月と絞り込みの条件を含む一覧の URL */
const listCache = createMonthPageCache<TransactionListItem[]>();

/**
 * 件数と合計、日ごとの取引の一覧。期間を移るときに横に送る部分。
 */
const TransactionList = ({
  transactions,
  filter,
  selectedId,
}: {
  transactions: TransactionListItem[];
  filter: TransactionFilter;
  selectedId: number | undefined;
}) => {
  const yearly = isYearPeriod(filter.period);
  return (
    <div className={styles.TransactionList}>
      <Section label="" gap="none">
        <ListTotals transactions={transactions} />
      </Section>
      {transactions.length === 0 ? (
        <Section label="">
          <p className={styles.Empty}>条件に合う取引はありません</p>
        </Section>
      ) : (
        <div>
          {groupByDate(transactions).map((group, index) => (
            <Section
              key={group.date}
              gap="none"
              // スクロールしても今見ている日付がわかるよう、日付をヘッダーの下に貼り付ける。
              // 月のバーが出ているときはその下に並べる（年の一覧には月のバーがない）
              stickyTop={
                yearly
                  ? "var(--header-height)"
                  : "calc(var(--header-height) + var(--month-bar-height))"
              }
              label={
                <span className={styles.DayLabel}>
                  {yearly ? formatMonthDay(group.date) : formatDayOfMonth(group.date)}
                </span>
              }
            >
              {/* 一覧の始まりにだけ黒の線を引く */}
              <ul className={styles.DayList} data-first={index === 0 || undefined}>
                {group.items.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    filter={filter}
                    selected={selectedId === transaction.id}
                  />
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 隣の期間の仮の中身。前に見た期間なら覚えている一覧を、まだ見ていなければ骨組みを出す。
 */
const NeighborList = ({ href, filter }: { href: string; filter: TransactionFilter }) => {
  const cached = listCache.recall(href);
  if (cached !== undefined) {
    return <TransactionList transactions={cached} filter={filter} selectedId={undefined} />;
  }
  return <TransactionListSkeleton />;
};

/**
 * 一覧を読む前の骨組み。件数・合計はラベルを本物で描いて数字だけを棒にし、
 * 日ごとのまとまりは数が月ごとに変わるので、まるごと棒にする。
 */
const TransactionListSkeleton = () => (
  <div className={styles.TransactionList}>
    <Section label="" gap="none">
      <dl className={styles.Totals}>
        {["件数", "支出", "収入"].map((label) => (
          <div key={label} className={styles.total}>
            <dt>{label}</dt>
            <dd>
              <SkeletonText width={label === "件数" ? "xs" : "sm"} />
            </dd>
          </div>
        ))}
      </dl>
    </Section>
    <SkeletonBlock rows={8} />
  </div>
);

/**
 * 取引の一覧の画面。日付ごとにまとめ、日付を左の列に出す。
 * 取引を選ぶと、広い画面では一覧の右にサイドパネルを、狭い画面では下からシートを出してその場で編集できる。
 */
const TransactionsPage = ({
  filter,
  currentMonth,
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
  // サーバーでは画面の幅がわからないので、サイドパネルで描いておく。狭い画面では CSS でパネルの列を隠している
  const sidePanel = useMediaQuery(SIDE_PANEL_MEDIA, true);
  // 期間（月か年）を移るときも、絞り込みはそのまま引き継ぐ
  const periodHref = (period: string) => transactionsHref({ ...filter, period });
  const yearly = isYearPeriod(filter.period);
  const year = filter.period.slice(0, 4);
  // 月の見出しがスクロールで隠れたら、ヘッダーの下に月のバーを貼り付ける
  const { headingRef, hidden: monthHeadingHidden } = useMonthHeadingHidden(!yearly);

  /**
   * パネルの列が縮みきったら、残しておいた中身を外す。中の要素のトランジションも届くので、列の幅の変化だけを見る。
   */
  const onTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName === "grid-template-columns" && selected === null) setShown(null);
  };

  // 期間を移るときに横に送るのは件数と合計、取引の一覧だけにし、期間の見出しと絞り込みは動かさない
  const list = (
    <TransactionList
      transactions={transactions}
      filter={filter}
      selectedId={selected?.transaction.id}
    />
  );
  const currentHref = periodHref(filter.period);
  useEffect(() => listCache.remember(currentHref, transactions), [currentHref, transactions]);

  return (
    <div
      className={styles.TransactionsPage}
      data-panel-open={selected !== null || undefined}
      onTransitionEnd={onTransitionEnd}
    >
      <div className={styles.main}>
        {!yearly && (
          <StickyMonthBar month={filter.period} hrefOf={periodHref} shown={monthHeadingHidden} />
        )}
        <div className={styles.header}>
          <div className={styles.headingColumn}>
            <PeriodViewSwitch
              label="一覧の単位"
              view={yearly ? "year" : "month"}
              monthHref={periodHref(
                yearly ? monthForYear(Number(year), currentMonth) : filter.period,
              )}
              yearHref={periodHref(year)}
            />
            {yearly ? (
              <YearHeading year={Number(year)} hrefOf={(next) => periodHref(String(next))} />
            ) : (
              <MonthHeading month={filter.period} hrefOf={periodHref} headingRef={headingRef} />
            )}
          </div>
          {/* 狭い画面ではボタンを上の行に出し、フィルタに全幅を使わせて横に折り返す */}
          <div className={styles.controls}>
            <div className={styles.filtersColumn}>
              <Filters
                filter={filter}
                accounts={accounts}
                categories={categories}
                placeName={placeName}
                chainNames={chainNames}
              />
            </div>
            <div className={styles.actions}>
              <Link href="/statements/import" className={styles.importLink}>
                CSV の取り込み
              </Link>
              <Link
                href="/transactions/new"
                {...buttonStyleProps({ variant: "outline", size: "sm" })}
              >
                <Plus aria-hidden="true" />
                追加
              </Link>
            </div>
          </div>
        </div>
        <PeriodPager
          period={filter.period}
          previous={shiftPeriod(filter.period, -1)}
          next={shiftPeriod(filter.period, 1)}
          hrefOf={periodHref}
          placeholder={(neighbor) => (
            <NeighborList href={periodHref(neighbor)} filter={{ ...filter, period: neighbor }} />
          )}
        >
          {list}
        </PeriodPager>
      </div>
      <div className={styles.panelColumn}>
        {sidePanel && shown !== null && (
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
      {/*
       * 開くときに下から滑り込むよう、シートは取引を開く前から置いておき、open だけを切り替える。
       * 開くのと同時に作ると、Base UI は最初から開いていたものとして扱い、開くアニメーションを付けない
       */}
      {!sidePanel && (
        <PanelSheet
          filter={filter}
          selected={shown}
          open={selected !== null}
          onClosed={() => setShown(null)}
          accounts={accounts}
          categories={categories}
          chainNames={chainNames}
        />
      )}
    </div>
  );
};

export default TransactionsPage;

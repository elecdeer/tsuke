import { Link, useRouter } from "@void/react";
import { ChevronRight, CircleCheck, FileUp, LoaderCircle, TriangleAlert } from "lucide-react";
import { memo, useCallback, useId, useState, type ChangeEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { createLedgerClient, LedgerFetchError } from "@/client";
import {
  readStatementCsvEvents,
  type StatementCsvFormat,
  type StatementCsvReadColumns,
} from "@/import/statementCsvEvents";
import type { ReadQuality } from "@/llm/readQuality";
import { cn } from "@/lib/utils";
import { ErrorMessage } from "@/web/components/ErrorMessage";
import { Section } from "@/web/components/Section";
import { formatDateTime, formatDay, formatYen } from "@/web/format";
import { MODE_LABELS } from "@/web/labels";
import { formatReadTime } from "@/web/receiptQueue";
import {
  applyClassifiedRows,
  changeDraftMode,
  decodeCsvBytes,
  describeColumns,
  draftProblem,
  draftsFromRead,
  finishPendingDrafts,
  markDraftEdited,
  registerInputFromDrafts,
  type StatementCsvDraft,
} from "@/web/statementCsvDraft";
import type { Props } from "./import.server";

const ledgerApi = () => createLedgerClient(window.location.origin);

/**
 * 台帳の API のエラーから、画面に出す文言を取り出す。
 */
const apiErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof LedgerFetchError) {
    const { data } = error;
    if (typeof data === "object" && data !== null && "error" in data) {
      const message: unknown = data.error;
      if (typeof message === "string") return message;
    }
  }
  return fallback;
};

/** 読み取りの結果のうち、行以外の情報 */
type ReadSummary = {
  file: File;
  skippedCount: number;
  unclassifiedCount: number;
  rowCount: number;
  /** AI を呼ばずに覚えていた分類を使った行数 */
  recalledCount: number;
  format: StatementCsvFormat | null;
  /** 分類に使ったモデル。登録のときに推測の記録へ残す */
  model: string;
  formatKnown: boolean;
  columns: StatementCsvReadColumns;
  /** 読み取りを始めてから行が届くまでの時間 */
  columnsReadMs: number;
  /** 読み取り全体の時間。読み取り中は null */
  readMs: number | null;
};

/** 読み取りの API のエラーの本文から、画面に出す文言を取り出す */
const readErrorMessage = async (response: Response): Promise<string> => {
  const fallback = "CSV を読み取れませんでした";
  try {
    const data: unknown = await response.json();
    if (typeof data === "object" && data !== null && "error" in data) {
      const message: unknown = data.error;
      if (typeof message === "string") return message;
    }
  } catch {
    // 認証の画面などで JSON でない応答が返ることがある
  }
  return fallback;
};

/**
 * 空文字を null に、それ以外を数値にする。選択肢の値を ID に戻すのに使う。
 */
const idFromValue = (value: string): number | null => (value === "" ? null : Number(value));

const DETAIL_HEAD_CLASS = "h-7 px-2 text-xs";
const DETAIL_CELL_CLASS = "whitespace-normal px-2 py-1";

/**
 * 読み取りの所要時間と列の読み取りの結果。普段は見なくてよいので折りたたんでおく。
 */
const ReadDetails = ({ summary }: { summary: ReadSummary }) => (
  <details className="group text-xs text-muted-foreground">
    <summary className="flex w-fit cursor-pointer list-none items-center gap-1 hover:text-foreground [&::-webkit-details-marker]:hidden">
      <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
      読み取りの詳細
    </summary>
    <div className="flex flex-col gap-2 pt-2">
      <p>
        読み取りにかかった時間:{" "}
        {summary.readMs === null ? (
          "読み取り中"
        ) : (
          <>
            {formatReadTime(summary.readMs)}
            {summary.recalledCount < summary.rowCount &&
              `（列 ${formatReadTime(summary.columnsReadMs)}・分類 ${formatReadTime(summary.readMs - summary.columnsReadMs)}）`}
          </>
        )}
      </p>
      <p>
        列の読み取り: {summary.formatKnown ? "覚えていた形式" : "AI の判定"}・
        {summary.columns.mapping.firstDataRow + 1} 行目から
      </p>
      <Table className="w-auto text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className={DETAIL_HEAD_CLASS}>項目</TableHead>
            <TableHead className={DETAIL_HEAD_CLASS}>列</TableHead>
            <TableHead className={DETAIL_HEAD_CLASS}>見出し</TableHead>
            <TableHead className={DETAIL_HEAD_CLASS}>最初の行の値</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {describeColumns(summary.columns).map(({ role, columnNumber, columnName, sample }) => (
            <TableRow key={`${role}:${columnNumber}`}>
              <TableCell className={DETAIL_CELL_CLASS}>{role}</TableCell>
              <TableCell className={cn(DETAIL_CELL_CLASS, "tabular-nums")}>
                {columnNumber}
              </TableCell>
              <TableCell className={cn(DETAIL_CELL_CLASS, "break-all")}>
                {columnName || "—"}
              </TableCell>
              <TableCell className={cn(DETAIL_CELL_CLASS, "break-all")}>{sample}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </details>
);

const SELECT_CLASS = "col-start-2 w-full @2xl:col-start-auto";

/**
 * 前回の取り込みを 1 行の文にする。次にどの日付からの CSV を出せばよいか分かるよう、明細の最後の日付を添える。
 */
const describeLastImport = (lastImport: Props["lastImports"][number]): string =>
  [
    `${formatDateTime(lastImport.importedAt)} に取り込み`,
    lastImport.lastDate === null ? null : `${formatDay(lastImport.lastDate)} までの明細`,
    `${lastImport.fileName}・${lastImport.rowCount} 件`,
  ]
    .filter((part) => part !== null)
    .join("・");

/**
 * 口座ごとの前回の取り込み。次に出す CSV の期間を決めるのに使う。
 */
const LastImports = ({ lastImports }: { lastImports: Props["lastImports"] }) => (
  <div className="flex flex-col gap-1">
    <h2 className="text-xs text-muted-foreground">前回の取り込み</h2>
    {lastImports.length === 0 ? (
      <p className="text-sm text-muted-foreground">まだ取り込んでいません</p>
    ) : (
      <dl className="border-t">
        {lastImports.map((lastImport) => (
          <div
            key={lastImport.accountId}
            className="flex flex-col gap-0.5 border-b py-2 @md:flex-row @md:items-baseline @md:gap-4"
          >
            <dt className="shrink-0 text-sm @md:w-32 @md:truncate">{lastImport.accountName}</dt>
            <dd className="min-w-0 text-xs text-muted-foreground tabular-nums break-all">
              {describeLastImport(lastImport)}
            </dd>
          </div>
        ))}
      </dl>
    )}
  </div>
);

/**
 * 明細の 1 行。種類に応じて、内訳・カテゴリ・相手の口座のどれかを選ばせる。
 *
 * 分類は利用先ごとに届くので、届いた行だけを描き直せるよう memo にする。
 */
const DraftRow = memo(function DraftRow({
  index,
  draft,
  problem,
  placeListId,
  accounts,
  paymentCategories,
  incomeCategories,
  disabled,
  onDraftChange,
}: {
  index: number;
  draft: StatementCsvDraft;
  problem: string | null;
  placeListId: string;
  accounts: Props["accounts"];
  paymentCategories: Props["paymentCategories"];
  incomeCategories: Props["incomeCategories"];
  disabled: boolean;
  onDraftChange: (index: number, next: StatementCsvDraft) => void;
}) {
  const onChange = (next: StatementCsvDraft) => onDraftChange(index, next);
  return (
    <li
      className={cn(
        "grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-b py-3 @2xl:grid-cols-[1.25rem_minmax(0,1fr)_6rem_7rem_minmax(0,1fr)]",
        !draft.selected && "text-muted-foreground",
      )}
    >
      <input
        type="checkbox"
        aria-label={`${formatDay(draft.date)} ${draft.description} を登録する`}
        className="mt-1 size-4 accent-primary"
        checked={draft.selected}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, selected: event.target.checked })}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate" title={draft.description}>
            {draft.description || "（利用先なし）"}
          </span>
          <span className="tabular-nums font-medium @2xl:hidden">
            {draft.direction === "in" ? "+" : ""}
            {formatYen(draft.amount)}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDay(draft.date)}・{draft.line} 行目
        </span>
        {draft.registered !== null && (
          <Link
            href={`/transactions/${draft.registered.transactionId}`}
            className="flex w-fit items-center gap-1 text-xs underline"
          >
            <CircleCheck className="size-3" aria-hidden="true" />
            登録済みかもしれません（{formatDay(draft.registered.date)}
            {draft.registered.placeName === null ? "" : `・${draft.registered.placeName}`}）
          </Link>
        )}
        {draft.pending && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
            分類中…
          </span>
        )}
        {draft.selected && problem !== null && (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <TriangleAlert className="size-3" aria-hidden="true" />
            {problem}
          </span>
        )}
      </div>
      <span className="hidden text-right tabular-nums font-medium @2xl:block">
        {draft.direction === "in" ? "+" : ""}
        {formatYen(draft.amount)}
      </span>
      <NativeSelect
        size="sm"
        className={cn(SELECT_CLASS, "self-start")}
        aria-label="種類"
        value={draft.mode}
        disabled={disabled}
        onChange={(event) => {
          const mode = event.target.value;
          if (mode === "payment" || mode === "income" || mode === "transfer") {
            onChange(changeDraftMode(draft, mode));
          }
        }}
      >
        <NativeSelectOption value="payment">
          {draft.direction === "in" ? "支出の返金" : MODE_LABELS.payment}
        </NativeSelectOption>
        {draft.direction === "in" && (
          <NativeSelectOption value="income">{MODE_LABELS.income}</NativeSelectOption>
        )}
        <NativeSelectOption value="transfer">{MODE_LABELS.transfer}</NativeSelectOption>
      </NativeSelect>
      <div className="col-start-2 flex min-w-0 flex-col gap-2 @2xl:col-start-auto">
        {draft.mode === "payment" && (
          <NativeSelect
            size="sm"
            className={SELECT_CLASS}
            aria-label="内訳"
            aria-invalid={draft.selected && !draft.pending && draft.genreId === null}
            value={draft.genreId ?? ""}
            disabled={disabled}
            onChange={(event) => onChange({ ...draft, genreId: idFromValue(event.target.value) })}
          >
            <NativeSelectOption value="">内訳を選ぶ</NativeSelectOption>
            {paymentCategories.map((category) => (
              <NativeSelectOptGroup key={category.id} label={category.name}>
                {category.genres.map((genre) => (
                  <NativeSelectOption key={genre.id} value={genre.id}>
                    {genre.name}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ))}
          </NativeSelect>
        )}
        {draft.mode === "income" && (
          <NativeSelect
            size="sm"
            className={SELECT_CLASS}
            aria-label="カテゴリ"
            value={draft.categoryId ?? ""}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...draft, categoryId: idFromValue(event.target.value) })
            }
          >
            <NativeSelectOption value="">カテゴリなし</NativeSelectOption>
            {incomeCategories.map((category) => (
              <NativeSelectOption key={category.id} value={category.id}>
                {category.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        {draft.mode === "transfer" ? (
          <NativeSelect
            size="sm"
            className={SELECT_CLASS}
            aria-label={draft.direction === "out" ? "振替先の口座" : "振替元の口座"}
            aria-invalid={draft.selected && !draft.pending && draft.counterAccountId === null}
            value={draft.counterAccountId ?? ""}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...draft, counterAccountId: idFromValue(event.target.value) })
            }
          >
            <NativeSelectOption value="">
              {draft.direction === "out" ? "振替先を選ぶ" : "振替元を選ぶ"}
            </NativeSelectOption>
            {accounts.map((account) => (
              <NativeSelectOption key={account.id} value={account.id}>
                {account.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : (
          <Input
            aria-label="店舗"
            placeholder="店舗（なければ品名に残します）"
            list={placeListId}
            className="h-7 text-sm"
            value={draft.place}
            disabled={disabled}
            onChange={(event) => onChange({ ...draft, place: event.target.value })}
          />
        )}
      </div>
    </li>
  );
});

/**
 * 銀行やカードの履歴 CSV を取り込む画面。
 *
 * ファイルを選ぶと列を読み取って行を出し、分類を利用先ごとに届いた分から埋めていく。結果を確かめ、選んだ行をまとめて登録する。
 * 行数が多くなるので、行の選択欄には軽いネイティブの select を使う。
 */
const StatementImportPage = ({
  accounts,
  paymentCategories,
  incomeCategories,
  placeNames,
  lastImports,
}: Props) => {
  const router = useRouter();
  const fileInputId = useId();
  const placeListId = useId();
  const [reading, setReading] = useState(false);
  /** 読み直しの結果の行が届くまでの間。前の結果を残したまま、結果で置き換わる入力を止める */
  const [rereading, setRereading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReadSummary | null>(null);
  const [drafts, setDrafts] = useState<StatementCsvDraft[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [registeredCount, setRegisteredCount] = useState<number | null>(null);

  const busy = reading || registering;
  const lastImportOfAccount = lastImports.find((lastImport) => lastImport.accountId === accountId);
  const pendingCount = drafts.filter((draft) => draft.pending).length;
  const selected = drafts.filter((draft) => draft.selected);
  const problemCount = selected.filter((draft) => draftProblem(draft, accountId) !== null).length;
  const canRegister = accountId !== null && selected.length > 0 && problemCount === 0 && !busy;

  /**
   * ファイルを読み取り、届いた分から結果を確かめる行にする。
   *
   * 読み直しは結果の行が届くまで前の結果を残し、失敗しても失わないようにする。
   */
  const readFile = async (file: File, quality: ReadQuality = "fast") => {
    setReading(true);
    setRereading(quality === "accurate");
    setError(null);
    setRegisteredCount(null);
    if (quality === "fast") {
      setSummary(null);
      setDrafts([]);
    }
    let finished = false;
    let receivedRows = false;
    const startedAt = performance.now();
    try {
      const text = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
      // 型付きクライアントは本文を読み切ってから返すので、順に読むここだけ fetch を直接使う
      const response = await fetch("/api/statements/csv/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name.slice(0, 200), text, quality }),
      });
      if (!response.ok || response.body === null) {
        setError(await readErrorMessage(response));
        finished = true;
        return;
      }
      for await (const event of readStatementCsvEvents(response.body)) {
        if (event.type === "rows") {
          receivedRows = true;
          setRereading(false);
          setDrafts(draftsFromRead(event.rows));
          setAccountId(event.accountId);
          setSummary({
            file,
            skippedCount: event.skippedCount,
            unclassifiedCount: 0,
            rowCount: event.rows.length,
            recalledCount: event.rows.filter((row) => !row.pending).length,
            format: event.format,
            model: event.model,
            formatKnown: event.formatKnown,
            columns: event.columns,
            columnsReadMs: performance.now() - startedAt,
            readMs: null,
          });
        } else if (event.type === "classified") {
          setDrafts((current) => applyClassifiedRows(current, event.rows));
          const failed = event.rows.filter((row) => !row.classified).length;
          setSummary(
            (current) =>
              current && { ...current, unclassifiedCount: current.unclassifiedCount + failed },
          );
        } else if (event.type === "error") {
          setError(event.message);
          finished = true;
        } else {
          finished = true;
        }
      }
      if (!finished) setError("読み取りが途中で切れました。残りの行は手で選んでください");
    } catch (readError) {
      console.error("CSV の読み取りに失敗しました", readError);
      setError("CSV を読み取れませんでした。読めた行があれば手で選べます");
    } finally {
      setDrafts(finishPendingDrafts);
      // 読み直しが行の届く前に失敗したら、残している前の結果の時間を変えない
      if (receivedRows) {
        const readMs = performance.now() - startedAt;
        setSummary((current) => current && { ...current, readMs });
      }
      setReading(false);
      setRereading(false);
    }
  };

  /**
   * より正確なモデルで読み直す。読み取りの結果で置き換わるので、直した内容があれば先に確かめる。
   */
  const rereadAccurately = (file: File) => {
    const edited = drafts.some((draft) => draft.edited);
    if (edited && !window.confirm("直した内容は読み取りの結果に置き換わります。読み直しますか？")) {
      return;
    }
    void readFile(file, "accurate");
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを選び直しても change が届くよう、選択を空に戻す
    event.target.value = "";
    if (file !== undefined) void readFile(file);
  };

  const register = async () => {
    if (accountId === null || summary === null) return;
    setRegistering(true);
    setError(null);
    try {
      const { count } = await ledgerApi()("/api/statements/csv/register", "POST", {
        body: registerInputFromDrafts({
          fileName: summary.file.name.slice(0, 200),
          accountId,
          format: summary.format,
          model: summary.model,
          drafts,
        }),
      });
      setRegisteredCount(count);
      setSummary(null);
      setDrafts([]);
      // 前回の取り込みの表示を今の登録に更新する。登録の結果の表示は残す
      void router.refresh({ preserveState: true, preserveScroll: true });
    } catch (registerError) {
      setError(apiErrorMessage(registerError, "登録できませんでした"));
    } finally {
      setRegistering(false);
    }
  };

  const updateDraft = useCallback(
    (index: number, next: StatementCsvDraft) =>
      setDrafts((current) =>
        current.map((draft, i) => (i === index ? markDraftEdited(draft, next) : draft)),
      ),
    [],
  );

  const outTotal = selected
    .filter((draft) => draft.direction === "out")
    .reduce((sum, draft) => sum + draft.amount, 0);
  const inTotal = selected
    .filter((draft) => draft.direction === "in")
    .reduce((sum, draft) => sum + draft.amount, 0);

  return (
    <div className="flex flex-col gap-10">
      <Section label={<h1 className="text-2xl font-semibold">CSV の取り込み</h1>}>
        <div className="flex flex-col gap-3 border-t border-foreground pt-3">
          <p className="text-sm text-muted-foreground">
            銀行やクレジットカードの履歴 CSV
            を選ぶと、列を読み取って店舗とカテゴリを分類します。登録した形式と利用先は覚えていて、次からは新しいものだけを
            AI が判定します。
          </p>
          <div>
            <label
              htmlFor={fileInputId}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "cursor-pointer has-disabled:pointer-events-none has-disabled:opacity-50",
              )}
            >
              {reading ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileUp className="size-4" aria-hidden="true" />
              )}
              {rereading
                ? "読み直し中…"
                : reading
                  ? summary === null
                    ? "列を読み取り中…"
                    : "分類中…"
                  : "CSV ファイルを選ぶ"}
              <input
                id={fileInputId}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={busy}
                onChange={onFileChange}
              />
            </label>
          </div>
          {error !== null && <ErrorMessage message={error} />}
          {registeredCount !== null && (
            <output className="flex items-center gap-1.5 text-sm">
              <CircleCheck className="size-4" aria-hidden="true" />
              {registeredCount} 件登録しました。
              <Link href="/transactions" className="underline">
                取引を見る
              </Link>
            </output>
          )}
          <div className="@container">
            <LastImports lastImports={lastImports} />
          </div>
        </div>
      </Section>

      {summary !== null && (
        <>
          <Section label="取り込む口座">
            <div className="flex flex-col gap-2 border-t border-foreground pt-3">
              <NativeSelect
                className="w-full max-w-sm"
                aria-label="取り込む口座"
                aria-invalid={accountId === null}
                value={accountId ?? ""}
                disabled={registering || rereading}
                onChange={(event) => setAccountId(idFromValue(event.target.value))}
              >
                <NativeSelectOption value="">口座を選ぶ</NativeSelectOption>
                {accounts.map((account) => (
                  <NativeSelectOption key={account.id} value={account.id}>
                    {account.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {lastImportOfAccount !== undefined && (
                <p className="text-xs text-muted-foreground">
                  この口座の前回の取り込み：{describeLastImport(lastImportOfAccount)}
                </p>
              )}
              <output className="text-xs text-muted-foreground">
                {summary.file.name}：{drafts.length} 行を読み取りました
                {pendingCount > 0 && `。${pendingCount} 行を分類しています`}
                {summary.recalledCount > 0 &&
                  `。${summary.recalledCount} 行は覚えていた分類を使いました`}
                {summary.skippedCount > 0 &&
                  `。日付か金額を読めなかった ${summary.skippedCount} 行は除きました`}
                {summary.unclassifiedCount > 0 &&
                  `。${summary.unclassifiedCount} 行は分類できなかったので、手で選んでください`}
              </output>
              <p className="text-xs text-muted-foreground">
                {summary.formatKnown && "覚えていた列の形式で読み取りました。"}
                読み取りが違うときは
                <button
                  type="button"
                  className="underline hover:text-foreground disabled:opacity-50"
                  disabled={busy}
                  onClick={() => rereadAccurately(summary.file)}
                >
                  より正確に読み直す
                </button>
              </p>
              <ReadDetails summary={summary} />
            </div>
          </Section>

          <Section label="明細">
            <datalist id={placeListId}>
              {placeNames.map((name) => (
                <option key={name} value={name} aria-label={name} />
              ))}
            </datalist>
            <ul className="@container border-t border-foreground" aria-label="明細">
              {drafts.map((draft, index) => (
                <DraftRow
                  key={draft.line}
                  index={index}
                  draft={draft}
                  problem={draftProblem(draft, accountId)}
                  placeListId={placeListId}
                  accounts={accounts}
                  paymentCategories={paymentCategories}
                  incomeCategories={incomeCategories}
                  disabled={registering || rereading}
                  onDraftChange={updateDraft}
                />
              ))}
            </ul>
          </Section>

          <Section label="">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm tabular-nums">
                {selected.length} 件・出金 {formatYen(outTotal)}・入金 {formatYen(inTotal)}
                {problemCount > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-destructive">
                    <TriangleAlert className="size-3.5" aria-hidden="true" />
                    未選択の項目が {problemCount} 件あります
                  </span>
                )}
              </p>
              <Button disabled={!canRegister} onClick={() => void register()}>
                {registering ? "登録中…" : `${selected.length} 件を登録`}
              </Button>
            </div>
          </Section>
        </>
      )}
    </div>
  );
};

export default StatementImportPage;

import { Link } from "@void/react";
import { CircleCheck, FileUp, LoaderCircle, TriangleAlert } from "lucide-react";
import { useId, useState, type ChangeEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { createLedgerClient, LedgerFetchError } from "@/client";
import { cn } from "@/lib/utils";
import { ErrorMessage } from "@/web/components/ErrorMessage";
import { Section } from "@/web/components/Section";
import { formatDay, formatYen } from "@/web/format";
import { MODE_LABELS } from "@/web/labels";
import {
  changeDraftMode,
  decodeCsvBytes,
  draftProblem,
  draftsFromRead,
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
  fileName: string;
  skippedCount: number;
  unclassifiedCount: number;
};

/**
 * 空文字を null に、それ以外を数値にする。選択肢の値を ID に戻すのに使う。
 */
const idFromValue = (value: string): number | null => (value === "" ? null : Number(value));

const SELECT_CLASS = "col-start-2 w-full @2xl:col-start-auto";

/**
 * 明細の 1 行。種類に応じて、内訳・カテゴリ・相手の口座のどれかを選ばせる。
 */
const DraftRow = ({
  draft,
  problem,
  placeListId,
  accounts,
  paymentCategories,
  incomeCategories,
  disabled,
  onChange,
}: {
  draft: StatementCsvDraft;
  problem: string | null;
  placeListId: string;
  accounts: Props["accounts"];
  paymentCategories: Props["paymentCategories"];
  incomeCategories: Props["incomeCategories"];
  disabled: boolean;
  onChange: (next: StatementCsvDraft) => void;
}) => (
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
          aria-invalid={draft.selected && draft.genreId === null}
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
          onChange={(event) => onChange({ ...draft, categoryId: idFromValue(event.target.value) })}
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
          aria-invalid={draft.selected && draft.counterAccountId === null}
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

/**
 * 銀行やカードの履歴 CSV を取り込む画面。
 *
 * ファイルを選ぶと AI が列を判定して行を分類する。結果を確かめ、選んだ行をまとめて登録する。
 * 行数が多くなるので、行の選択欄には軽いネイティブの select を使う。
 */
const StatementImportPage = ({
  accounts,
  paymentCategories,
  incomeCategories,
  placeNames,
}: Props) => {
  const fileInputId = useId();
  const placeListId = useId();
  const [reading, setReading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReadSummary | null>(null);
  const [drafts, setDrafts] = useState<StatementCsvDraft[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [registeredCount, setRegisteredCount] = useState<number | null>(null);

  const busy = reading || registering;
  const selected = drafts.filter((draft) => draft.selected);
  const problemCount = selected.filter((draft) => draftProblem(draft, accountId) !== null).length;
  const canRegister = accountId !== null && selected.length > 0 && problemCount === 0 && !busy;

  /**
   * ファイルを読み取り、結果を確かめる行にする。
   */
  const readFile = async (file: File) => {
    setReading(true);
    setError(null);
    setRegisteredCount(null);
    setSummary(null);
    setDrafts([]);
    try {
      const text = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
      const result = await ledgerApi()("/api/statements/csv/read", "POST", {
        body: { fileName: file.name.slice(0, 200), text },
      });
      setDrafts(draftsFromRead(result.rows));
      setAccountId(result.accountId);
      setSummary({
        fileName: file.name,
        skippedCount: result.skippedCount,
        unclassifiedCount: result.unclassifiedCount,
      });
    } catch (readError) {
      setError(apiErrorMessage(readError, "CSV を読み取れませんでした"));
    } finally {
      setReading(false);
    }
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
          fileName: summary.fileName.slice(0, 200),
          accountId,
          drafts,
        }),
      });
      setRegisteredCount(count);
      setSummary(null);
      setDrafts([]);
    } catch (registerError) {
      setError(apiErrorMessage(registerError, "登録できませんでした"));
    } finally {
      setRegistering(false);
    }
  };

  const updateDraft = (index: number, next: StatementCsvDraft) =>
    setDrafts((current) => current.map((draft, i) => (i === index ? next : draft)));

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
            銀行やクレジットカードの履歴 CSV を選ぶと、AI が列を判定して店舗とカテゴリを分類します。
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
              {reading ? "読み取り中…" : "CSV ファイルを選ぶ"}
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
                disabled={busy}
                onChange={(event) => setAccountId(idFromValue(event.target.value))}
              >
                <NativeSelectOption value="">口座を選ぶ</NativeSelectOption>
                {accounts.map((account) => (
                  <NativeSelectOption key={account.id} value={account.id}>
                    {account.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <output className="text-xs text-muted-foreground">
                {summary.fileName}：{drafts.length} 行を読み取りました
                {summary.skippedCount > 0 &&
                  `。日付か金額を読めなかった ${summary.skippedCount} 行は除きました`}
                {summary.unclassifiedCount > 0 &&
                  `。${summary.unclassifiedCount} 行は分類できなかったので、手で選んでください`}
              </output>
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
                  draft={draft}
                  problem={draftProblem(draft, accountId)}
                  placeListId={placeListId}
                  accounts={accounts}
                  paymentCategories={paymentCategories}
                  incomeCategories={incomeCategories}
                  disabled={busy}
                  onChange={(next) => updateDraft(index, next)}
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

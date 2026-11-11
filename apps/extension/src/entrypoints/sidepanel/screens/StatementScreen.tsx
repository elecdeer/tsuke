import { CircleCheckIcon, ScanTextIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToastManager } from "@/components/ui/toast";
import { AccountCombobox } from "../../../components/AccountCombobox.tsx";
import { CategoryCombobox, type CategorySelection } from "../../../components/CategoryCombobox.tsx";
import { ErrorMessage } from "../../../components/ErrorMessage.tsx";
import { YenUnit } from "../../../components/FormField.tsx";
import { StoreCombobox } from "../../../components/StoreCombobox.tsx";
import { formatAmount, formatShortDate, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { collectPageContent } from "../../../lib/extraction.ts";
import { createServerClient, withErrorMessage } from "../../../lib/serverClient";
import {
  buildStatementRows,
  selectReadableRows,
  type RegisteredMatch,
  type StatementRow,
} from "../../../lib/statementRows.ts";
import { useMutation } from "../../../lib/useMutation.ts";
import { categoriesQuery, placesQuery } from "../../../queries.ts";

interface Props {
  serverUrl: string;
}

/** 読み取り結果の概要。読み取る前は null */
interface ExtractSummary {
  rowCount: number;
  registeredCount: number;
  skippedCount: number;
}

interface StatementRowItemProps {
  row: StatementRow;
  serverUrl: string;
  disabled: boolean;
  onSelectedChange: (selected: boolean) => void;
  onStoreChange: (store: string | null) => void;
  onCategoryChange: (category: CategorySelection | null) => void;
}

/**
 * 明細の 1 行。台帳の明細の取り込み（apps/ledger/pages/statements/import.tsx）の行にそろえ、
 * 選ぶかどうかのチェックを左に、利用先と金額・日付をその右に、店舗とカテゴリの欄をさらに下に積む。
 * 選んでいない行は文字を薄くする。
 */
const StatementRowItem = ({
  row,
  serverUrl,
  disabled,
  onSelectedChange,
  onStoreChange,
  onCategoryChange,
}: StatementRowItemProps) => {
  const placeLabel = row.place || "(利用先不明)";
  return (
    <li
      className={cn(
        "grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-b py-3",
        !row.selected && "text-muted-foreground",
      )}
    >
      <input
        type="checkbox"
        className="mt-1 size-4 accent-primary"
        checked={row.selected}
        onChange={(e) => onSelectedChange(e.target.checked)}
        disabled={disabled || row.submitted}
        aria-label={`${placeLabel}（${formatShortDate(row.date)}）を登録する`}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate" title={placeLabel}>
            {placeLabel}
          </span>
          <span className="shrink-0 font-medium tabular-nums">{formatYen(row.amount)}</span>
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatShortDate(row.date)}
        </span>
        {row.submitted ? (
          <span className="flex items-center gap-1 text-xs text-foreground">
            <CircleCheckIcon className="size-3" aria-hidden="true" />
            登録しました
          </span>
        ) : row.registered ? (
          <span className="flex items-center gap-1 text-xs">
            <CircleCheckIcon className="size-3" aria-hidden="true" />
            登録済み {formatShortDate(row.registered.date)}
          </span>
        ) : null}
      </div>
      <div className="col-start-2 grid gap-y-2">
        <StoreCombobox serverUrl={serverUrl} value={row.store} onChange={onStoreChange} hideLabel />
        <CategoryCombobox
          serverUrl={serverUrl}
          value={row.category}
          onChange={onCategoryChange}
          hideLabel
        />
      </div>
    </li>
  );
};

/**
 * クレジットカードの月別明細などのページから利用行をまとめて読み取り、
 * 利用先・金額・カテゴリだけの概要で一括登録する画面。
 *
 * 既に登録済みと判定した行は選択を外した状態で表示する。
 */
export default function StatementScreen({ serverUrl }: Props) {
  const toastManager = useToastManager();
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [summary, setSummary] = useState<ExtractSummary | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // 明細を読み取ったモデル。登録のときに推測の記録へ残す
  const [readModel, setReadModel] = useState<string | null>(null);

  const updateRow = (id: string, patch: Partial<Omit<StatementRow, "id">>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const extractMutation = useMutation({
    mutationFn: async () => {
      const client = createServerClient(serverUrl);
      const pageContent = await collectPageContent();
      // 推測した店舗名と内訳を一覧に照らすので、店舗とカテゴリの一覧も使う。選択欄が読み込み済みならキャッシュを使う
      const [extracted, { places }, { categories }] = await Promise.all([
        withErrorMessage(
          "明細の読み取り",
          client("/api/statements/extract", "POST", { body: { pageContent } }),
        ),
        withErrorMessage("店舗の取得", placesQuery.prefetch(serverUrl)),
        withErrorMessage("カテゴリの取得", categoriesQuery.prefetch(serverUrl)),
      ]);

      const readableRows = selectReadableRows(extracted.rows);
      let matches: Array<RegisteredMatch | null> = readableRows.map(() => null);
      if (readableRows.length > 0) {
        ({ matches } = await withErrorMessage(
          "登録済みの確認",
          client("/api/statements/registered", "POST", {
            body: { entries: readableRows.map((row) => ({ date: row.date, amount: row.amount })) },
          }),
        ));
      }

      return {
        rows: buildStatementRows({ rows: readableRows, matches, places, categories }),
        accountId: extracted.accountId,
        model: extracted.model,
        skippedCount: extracted.rows.length - readableRows.length,
      };
    },
    onSuccess: ({ rows: newRows, accountId: extractedAccountId, model, skippedCount }) => {
      setRows(newRows);
      setReadModel(model);
      if (extractedAccountId !== null) setAccountId(extractedAccountId);
      setSummary({
        rowCount: newRows.length,
        registeredCount: newRows.filter((row) => row.registered !== null).length,
        skippedCount,
      });
    },
  });

  const selectedRows = rows.filter((row) => row.selected);
  const total = selectedRows.reduce((sum, row) => sum + row.amount, 0);

  const registerMutation = useMutation({
    mutationFn: async () => {
      const client = createServerClient(serverUrl);
      const targets = rows.filter((row) => row.selected);
      setProgress({ done: 0, total: targets.length });
      try {
        // 途中で失敗したとき登録済みの行がわかるよう、1 件ずつ登録して行の状態を更新する
        for (const [index, row] of targets.entries()) {
          if (!row.category) throw new Error("カテゴリが選択されていない行があります");
          await withErrorMessage(
            `「${row.place || "(利用先不明)"}」の登録`,
            client("/api/transactions", "POST", {
              body: {
                date: row.date,
                fromAccountId: accountId,
                // 明細の表記のまま店舗を作ると表記ゆれの店舗が増えるので、
                // 既存の店舗に紐付かない利用先は名前が残るよう品名に入れる
                placeName: row.store,
                items: [
                  {
                    genreId: row.category.genreId,
                    name: row.store === null ? row.place || null : null,
                    memo: null,
                    amount: row.amount,
                    aiGuess: { genreId: row.aiGenreId, name: row.place || null },
                  },
                ],
                ...(readModel !== null && {
                  aiRead: { source: "statement" as const, model: readModel },
                }),
              },
            }),
          );
          updateRow(row.id, { selected: false, submitted: true });
          setProgress({ done: index + 1, total: targets.length });
        }
        return targets.length;
      } finally {
        setProgress(null);
      }
    },
    onSuccess: (count) => {
      toastManager.add({ description: `${count}件登録しました` });
      // 登録で店舗の並び順が変わるので取り直す。失敗しても今の一覧を使い続ける
      placesQuery.refetch(serverUrl).catch(() => {});
    },
  });

  const isBusy = extractMutation.isPending || registerMutation.isPending;
  const canSubmit =
    selectedRows.length > 0 && selectedRows.every((row) => row.category !== null) && !isBusy;

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    registerMutation.mutate();
  };

  const submitLabel = progress
    ? `登録中…（${progress.done}/${progress.total}）`
    : `${selectedRows.length}件を登録`;

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isBusy}
          onClick={() => extractMutation.mutate()}
        >
          <ScanTextIcon />
          {extractMutation.isPending ? "読み取り中…" : "このページの明細を読み取る"}
        </Button>
        {extractMutation.isError && (
          <ErrorMessage
            message={
              extractMutation.error instanceof Error
                ? extractMutation.error.message
                : "明細の読み取りに失敗しました"
            }
          />
        )}
        {summary === null ? (
          <p className="text-xs text-muted-foreground">
            カードの利用明細ページを開いて読み取ると、利用先と金額だけでまとめて登録できます。
          </p>
        ) : (
          <output className="text-xs text-muted-foreground">
            {summary.rowCount}件読み取りました
            {summary.registeredCount > 0 &&
              `（うち${summary.registeredCount}件は登録済みのため選択を外しました）`}
            {summary.skippedCount > 0 &&
              `。日付・金額を読み取れなかった${summary.skippedCount}件は除外しました`}
          </output>
        )}
      </div>

      <div className="border-t border-foreground pt-3">
        <AccountCombobox serverUrl={serverUrl} value={accountId} onChange={setAccountId} />
      </div>

      {rows.length > 0 && (
        <ul className="border-t border-foreground" aria-label="明細">
          {rows.map((row) => (
            <StatementRowItem
              key={row.id}
              row={row}
              serverUrl={serverUrl}
              disabled={isBusy}
              onSelectedChange={(selected) => updateRow(row.id, { selected })}
              onStoreChange={(store) => updateRow(row.id, { store })}
              onCategoryChange={(category) => updateRow(row.id, { category })}
            />
          ))}
        </ul>
      )}

      {(rows.length > 0 || registerMutation.isError) && (
        // 登録のボタンと合計は、行が多くてスクロールしても見えるよう下の帯に置く
        <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-foreground bg-background py-2">
          {registerMutation.isError && (
            <ErrorMessage
              message={
                registerMutation.error instanceof Error
                  ? registerMutation.error.message
                  : "登録に失敗しました"
              }
            />
          )}
          {rows.length > 0 && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  合計（{selectedRows.length}件）
                </span>
                <span className="text-2xl font-semibold tracking-tight tabular-nums">
                  {formatAmount(total)}
                  <YenUnit className="ml-0.5" />
                </span>
              </div>
              <Button type="submit" size="lg" className="shrink-0 px-6" disabled={!canSubmit}>
                {submitLabel}
              </Button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

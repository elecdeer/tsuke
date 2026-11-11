import type { LedgerOutput } from "ledger/client";
import type { CategorySelection } from "../components/CategoryCombobox.tsx";
import type { CategoriesResponse, PlacesResponse } from "../queries.ts";
import { findCategorySelectionByGenreId } from "./extraction.ts";

/** LLM が明細ページから抽出した 1 行。読み取れなかった項目は null */
export type ExtractedStatementRow = LedgerOutput<"/api/statements/extract", "POST">["rows"][number];

/** 日付と金額が読み取れており登録に使える明細行 */
export type ReadableStatementRow = ExtractedStatementRow & { date: string; amount: number };

/** 既に台帳に登録されていると判定した支出 */
export type RegisteredMatch = NonNullable<
  LedgerOutput<"/api/statements/registered", "POST">["matches"][number]
>;

/** 一括登録画面で扱う明細行 */
export interface StatementRow {
  id: string;
  date: string;
  /** 明細に書かれた利用先名 */
  place: string;
  /** 登録先の既存の店舗の名前。紐付かなければ null（利用先名は品名として登録する） */
  store: string | null;
  amount: number;
  category: CategorySelection | null;
  /** AI が推測した内訳。決められなかったときは null。画面で内訳を変えても変えない */
  aiGenreId: number | null;
  /** 登録対象として選択されているか */
  selected: boolean;
  /** 既に登録済みと判定した支出。登録済みでなければ null */
  registered: RegisteredMatch | null;
  /** この画面から登録したか */
  submitted: boolean;
}

/**
 * 日付と金額（正の整数）が読み取れた行だけを残す。
 */
export const selectReadableRows = (
  rows: ReadonlyArray<ExtractedStatementRow>,
): ReadableStatementRow[] =>
  rows.flatMap((row) =>
    row.date !== null && row.amount !== null && Number.isInteger(row.amount) && row.amount > 0
      ? [{ ...row, date: row.date, amount: row.amount }]
      : [],
  );

/**
 * LLM が推測した店舗名を既存の店舗に解決する。一覧にない名前は捨て、
 * 推測がないときは利用先名が店舗名と完全に一致する店舗を使う。
 */
const resolveStore = (
  row: ExtractedStatementRow,
  places: PlacesResponse["places"],
): string | null => {
  const guessed = row.placeName !== null ? places.find((p) => p.name === row.placeName) : undefined;
  return (guessed ?? places.find((p) => p.name === row.place))?.name ?? null;
};

/**
 * 抽出した明細行と登録済み判定の結果から、一括登録画面の行を組み立てる。
 *
 * 登録済みと判定した行は選択を外しておく（誤判定のときはユーザーが選択し直せる）。
 *
 * @param matches `rows` と同じ順序の登録済み判定結果
 */
export const buildStatementRows = (params: {
  rows: ReadonlyArray<ReadableStatementRow>;
  matches: ReadonlyArray<RegisteredMatch | null>;
  places: PlacesResponse["places"];
  categories: CategoriesResponse["categories"];
}): StatementRow[] =>
  params.rows.map((row, index) => {
    const registered = params.matches[index] ?? null;
    return {
      id: crypto.randomUUID(),
      date: row.date,
      place: row.place ?? "",
      store: resolveStore(row, params.places),
      amount: row.amount,
      category:
        row.genreId !== null
          ? findCategorySelectionByGenreId(params.categories, row.genreId)
          : null,
      aiGenreId: row.genreId,
      selected: registered === null,
      registered,
      submitted: false,
    };
  });

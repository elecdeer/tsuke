/**
 * 履歴 CSV の取り込み画面で確かめる行の、下書きの組み立てと登録の入力への変換。
 */
import type { StatementCsvRegisterInput } from "@/ledger/statementCsv";
import type {
  StatementCsvClassifiedRow,
  StatementCsvFormat,
  StatementCsvReadColumns,
  StatementCsvReadResultRow,
} from "@/import/statementCsvEvents";

/** 画面で確かめる 1 行 */
export type StatementCsvDraft = StatementCsvReadResultRow & {
  selected: boolean;
  /** 店舗の入力欄の文字列 */
  place: string;
  /** 手で分類を直した行。後から届く AI の分類で上書きしない */
  edited: boolean;
  /** 手で選択を変えた行。後から届く登録済みの判定で選択を変えない */
  selectionEdited: boolean;
};

/** 画面に出す、列の読み取りの 1 行 */
export type ColumnDescription = {
  /** 取り込みでの役割 */
  role: string;
  /** CSV での列の番号（1 始まり。行の番号と揃える） */
  columnNumber: number;
  /** CSV での見出し。見出しがなければ空 */
  columnName: string;
  /** 最初の利用の行の値 */
  sample: string;
};

/**
 * 列の読み取りの結果を、役割ごとの説明にする。
 */
export const describeColumns = ({
  mapping,
  header,
  sampleRow,
}: StatementCsvReadColumns): ColumnDescription[] => {
  const describe = (role: string, column: number | null): ColumnDescription[] =>
    column === null
      ? []
      : [
          {
            role,
            columnNumber: column + 1,
            columnName: header?.[column] ?? "",
            sample: sampleRow[column] ?? "",
          },
        ];
  const amountRole =
    mapping.amountPositiveMeans === "outflow" ? "金額（正の値が出金）" : "金額（正の値が入金）";
  return [
    ...describe("利用日", mapping.dateColumn),
    ...mapping.descriptionColumns.flatMap((column) => describe("利用先", column)),
    ...describe(amountRole, mapping.amountColumn),
    ...describe("出金", mapping.amountColumn === null ? mapping.outflowColumn : null),
    ...describe("入金", mapping.amountColumn === null ? mapping.inflowColumn : null),
  ];
};

/**
 * 読み取りの結果を下書きにする。登録済みと判定した行は選択を外しておく（誤判定なら選び直せる）。
 */
export const draftsFromRead = (
  rows: ReadonlyArray<StatementCsvReadResultRow>,
): StatementCsvDraft[] =>
  rows.map((row) => ({
    ...row,
    selected: row.registered === null,
    place: row.placeName ?? "",
    edited: false,
    selectionEdited: false,
  }));

/**
 * 画面で変えられた行に印を付ける。分類を直した行は、AI の分類を待たないことにする。
 */
export const markDraftEdited = (
  previous: StatementCsvDraft,
  next: StatementCsvDraft,
): StatementCsvDraft => {
  const edited =
    previous.mode !== next.mode ||
    previous.place !== next.place ||
    previous.genreId !== next.genreId ||
    previous.categoryId !== next.categoryId ||
    previous.counterAccountId !== next.counterAccountId;
  return {
    ...next,
    edited: previous.edited || edited,
    pending: previous.pending && !edited,
    selectionEdited: previous.selectionEdited || previous.selected !== next.selected,
  };
};

/**
 * 届いた AI の分類を下書きに反映する。手で直した行と手で変えた選択はそのまま残す。
 */
export const applyClassifiedRows = (
  drafts: ReadonlyArray<StatementCsvDraft>,
  rows: ReadonlyArray<StatementCsvClassifiedRow>,
): StatementCsvDraft[] => {
  const byLine = new Map(rows.map((row) => [row.line, row]));
  return drafts.map((draft) => {
    const row = byLine.get(draft.line);
    if (row === undefined || draft.edited) return draft;
    return {
      ...draft,
      mode: row.mode,
      placeName: row.placeName,
      genreId: row.genreId,
      categoryId: row.categoryId,
      counterAccountId: row.counterAccountId,
      registered: row.registered,
      pending: false,
      place: row.placeName ?? "",
      selected: draft.selectionEdited ? draft.selected : row.registered === null,
    };
  });
};

/**
 * 読み取りが途中で終わったときに、残りの行を手で選べるようにする。
 */
export const finishPendingDrafts = (
  drafts: ReadonlyArray<StatementCsvDraft>,
): StatementCsvDraft[] => drafts.map((draft) => ({ ...draft, pending: false }));

/**
 * 行の種類を変える。種類ごとに持てる項目が違うので、持てない項目を空にする。
 */
export const changeDraftMode = (
  draft: StatementCsvDraft,
  mode: StatementCsvDraft["mode"],
): StatementCsvDraft => ({
  ...draft,
  mode,
  genreId: mode === "payment" ? draft.genreId : null,
  categoryId: mode === "income" ? draft.categoryId : null,
  counterAccountId: mode === "transfer" ? draft.counterAccountId : null,
  place: mode === "transfer" ? "" : draft.place,
});

/**
 * 選択した行を登録できるかを確かめ、できなければ足りないものを返す。
 */
export const draftProblem = (draft: StatementCsvDraft, accountId: number | null): string | null => {
  if (draft.pending) return null;
  if (draft.mode === "payment" && draft.genreId === null) return "内訳を選んでください";
  if (draft.mode === "income" && draft.direction === "out") {
    return "出金は収入にできません";
  }
  if (draft.mode === "transfer") {
    if (draft.counterAccountId === null) return "相手の口座を選んでください";
    if (draft.counterAccountId === accountId) return "取り込む口座とは別の口座を選んでください";
  }
  return null;
};

/**
 * 選択した行を登録の入力にする。
 *
 * 明細の表記のまま店舗を作ると表記ゆれの店舗が増えるので、店舗を選ばなかった行は利用先を品名に入れて残す。
 * 店舗を選んでいれば利用先の表記は店舗名と重なるので入れない。振替は店舗を持たないので常に品名に入れる。
 */
export const registerInputFromDrafts = (params: {
  fileName: string;
  accountId: number;
  format?: StatementCsvFormat | null;
  drafts: ReadonlyArray<StatementCsvDraft>;
}): StatementCsvRegisterInput => ({
  fileName: params.fileName,
  accountId: params.accountId,
  format: params.format ?? null,
  rows: params.drafts.flatMap((draft): StatementCsvRegisterInput["rows"] => {
    if (!draft.selected) return [];
    const placeName = draft.place.trim() === "" ? null : draft.place.trim();
    const name = placeName === null ? truncateName(draft.description) : null;
    const description = draft.description.slice(0, NAME_MAX_CHARS);
    switch (draft.mode) {
      case "payment":
        return draft.genreId === null
          ? []
          : [
              {
                mode: "payment",
                description,
                date: draft.date,
                amount: draft.direction === "in" ? -draft.amount : draft.amount,
                placeName,
                name,
                genreId: draft.genreId,
              },
            ];
      case "income":
        return [
          {
            mode: "income",
            description,
            date: draft.date,
            amount: draft.amount,
            placeName,
            name,
            categoryId: draft.categoryId,
          },
        ];
      case "transfer":
        return draft.counterAccountId === null
          ? []
          : [
              {
                mode: "transfer",
                description,
                date: draft.date,
                amount: draft.amount,
                name: truncateName(draft.description),
                direction: draft.direction,
                counterAccountId: draft.counterAccountId,
              },
            ];
    }
  }),
});

/** 品名の長さの上限（登録の入力の検証と同じ） */
const NAME_MAX_CHARS = 200;

/**
 * 利用先を品名の長さに収める。空なら null にする。
 */
const truncateName = (description: string): string | null =>
  description === "" ? null : description.slice(0, NAME_MAX_CHARS);

/** BOM なしの UTF-8 かを確かめるため、誤りで止まるデコーダーで読む */
const decodeUtf8 = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

/**
 * CSV ファイルの中身を文字列にする。日本の銀行やカードの CSV は Shift_JIS が多いので、UTF-8 でなければ Shift_JIS と見なす。
 */
export const decodeCsvBytes = (bytes: Uint8Array): string =>
  decodeUtf8(bytes) ?? new TextDecoder("shift_jis").decode(bytes);

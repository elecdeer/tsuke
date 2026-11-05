/**
 * 履歴 CSV の取り込み画面で確かめる行の、下書きの組み立てと登録の入力への変換。
 */
import type { StatementCsvRegisterInput } from "@/ledger/statementCsv";
import type { RegisteredPayment } from "@/ledger/statements";
import type { StatementCsvReadRow } from "@/llm/readStatementCsv";

/** 読み取りの結果の 1 行 */
export type StatementCsvReadResultRow = StatementCsvReadRow & {
  registered: RegisteredPayment | null;
};

/** 画面で確かめる 1 行 */
export type StatementCsvDraft = StatementCsvReadResultRow & {
  selected: boolean;
  /** 店舗の入力欄の文字列 */
  place: string;
};

/**
 * 読み取りの結果を下書きにする。登録済みと判定した行は選択を外しておく（誤判定なら選び直せる）。
 */
export const draftsFromRead = (
  rows: ReadonlyArray<StatementCsvReadResultRow>,
): StatementCsvDraft[] =>
  rows.map((row) => ({ ...row, selected: row.registered === null, place: row.placeName ?? "" }));

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
  drafts: ReadonlyArray<StatementCsvDraft>;
}): StatementCsvRegisterInput => ({
  fileName: params.fileName,
  accountId: params.accountId,
  rows: params.drafts.flatMap((draft): StatementCsvRegisterInput["rows"] => {
    if (!draft.selected) return [];
    const placeName = draft.place.trim() === "" ? null : draft.place.trim();
    const name = placeName === null ? truncateName(draft.description) : null;
    switch (draft.mode) {
      case "payment":
        return draft.genreId === null
          ? []
          : [
              {
                mode: "payment",
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

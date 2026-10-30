import type { ExtractedPayment } from "../llm/extractPayment.ts";
import type { TransactionDraft } from "./transactionDraft.ts";

/**
 * 撮ったレシートの状態。
 *
 * - `waiting`：AI の読み取りを待っている
 * - `reading`：AI が読み取っている
 * - `read`：読み取れた。確かめて登録するのを待っている
 * - `failed`：読み取れなかった。読み直すか、手で入力して登録する
 */
export type ReceiptStatus = "waiting" | "reading" | "read" | "failed";

/**
 * 撮ってから登録するまでのレシート 1 枚。写真は大きいので別に持つ（入力のたびに書き直さないため）。
 */
export type ReceiptEntry = {
  id: string;
  /** 撮った時刻（ms）。キューはこの順に並べる */
  createdAt: number;
  status: ReceiptStatus;
  /** AI が読み取った結果。読み取る前と、読み取れなかったときは null */
  extracted: ExtractedPayment | null;
  /** 確かめているフォームの値。読み取り（または失敗）が済むまでは null */
  draft: TransactionDraft | null;
};

/** 同時に AI へ読み取りを頼む枚数の上限 */
export const READ_CONCURRENCY = 2;

/**
 * 撮った順に並べる。
 */
export const sortEntries = (entries: ReceiptEntry[]): ReceiptEntry[] =>
  [...entries].sort((a, b) => a.createdAt - b.createdAt);

/**
 * 次に読み取りを始めるレシートを選ぶ。読み取り中と合わせて上限を超えないよう、撮った順に待っているものから取る。
 */
export const nextToRead = (
  entries: ReceiptEntry[],
  concurrency: number = READ_CONCURRENCY,
): ReceiptEntry[] => {
  const reading = entries.filter((entry) => entry.status === "reading").length;
  const room = Math.max(0, concurrency - reading);
  return sortEntries(entries)
    .filter((entry) => entry.status === "waiting")
    .slice(0, room);
};

/**
 * 保存しておいたキューを開き直したときの状態にする。
 *
 * 読み取り中のまま画面を閉じたものは結果が届かないので、待ちに戻して読み直す。
 */
export const restoreEntries = (entries: ReceiptEntry[]): ReceiptEntry[] =>
  sortEntries(entries).map((entry) =>
    entry.status === "reading" ? { ...entry, status: "waiting" } : entry,
  );

/**
 * 確かめる対象として選ぶレシートを決める。選んでいたものがなくなっていれば、キューの先頭にする。
 */
export const selectedEntry = (
  entries: ReceiptEntry[],
  selectedId: string | null,
): ReceiptEntry | null =>
  entries.find((entry) => entry.id === selectedId) ?? sortEntries(entries)[0] ?? null;

/**
 * レシートをキューから外した後に選ぶものを決める。後ろに続くものがあればそれ、なければ 1 つ前、何もなければ null。
 */
export const nextAfterRemoval = (entries: ReceiptEntry[], removedId: string): string | null => {
  const sorted = sortEntries(entries);
  const index = sorted.findIndex((entry) => entry.id === removedId);
  if (index === -1) return sorted[0]?.id ?? null;
  return sorted[index + 1]?.id ?? sorted[index - 1]?.id ?? null;
};

/**
 * レシートを差し替える（なければ足す）。撮った順に並べ直して返す。
 */
export const upsertEntry = (entries: ReceiptEntry[], entry: ReceiptEntry): ReceiptEntry[] =>
  sortEntries([...entries.filter((current) => current.id !== entry.id), entry]);

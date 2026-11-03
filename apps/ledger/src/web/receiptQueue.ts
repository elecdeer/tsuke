import type { ExtractedPayment } from "../llm/extractPayment.ts";
import type { ReadQuality } from "../llm/readQuality.ts";
import type { TransactionDraft } from "./transactionDraft.ts";

/**
 * 撮ったレシートの状態。
 *
 * - `waiting`：AI の読み取りを待っている
 * - `reading`：AI が読み取っている
 * - `read`：読み取れた。確かめて登録するのを待っている
 * - `failed`：読み取れなかった。読み直すか、前の結果や手の入力のまま登録する
 */
export type ReceiptStatus = "waiting" | "reading" | "read" | "failed";

/** AI が読み取った結果。電話番号は、この項目を足す前に端末へ保存されたレシートにはない */
export type ReadReceipt = ExtractedPayment & { placePhone?: string | null };

/**
 * 撮ってから登録するまでのレシート 1 枚。写真は大きいので別に持つ（入力のたびに書き直さないため）。
 */
export type ReceiptEntry = {
  id: string;
  /** 撮った時刻（ms）。キューはこの順に並べる */
  createdAt: number;
  status: ReceiptStatus;
  /** 読み取りの優先。ないものは fast（この項目を足す前に端末へ保存されたレシートにはない） */
  quality?: ReadQuality;
  /** AI が読み取った結果。読み取る前と、一度も読み取れていないときは null */
  extracted: ReadReceipt | null;
  /** 最後に読み取れたときにかかった時間（ms）。この項目を足す前に端末へ保存されたレシートにはない */
  readMs?: number;
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
 * より正確なモデルで読み直すのを頼む。読み直せるまでは前の結果を残し、失敗しても失わないようにする。
 */
export const requestAccurateRead = (entry: ReceiptEntry): ReceiptEntry => ({
  ...entry,
  status: "waiting",
  quality: "accurate",
});

/**
 * 読み取りの失敗を記録する。読み直しの失敗なら、前の結果と入力中の値を残す。
 */
export const markReadFailed = (
  entry: ReceiptEntry,
  emptyDraft: TransactionDraft,
): ReceiptEntry => ({
  ...entry,
  status: "failed",
  draft: entry.draft ?? emptyDraft,
});

/**
 * 読み取りにかかった時間を、画面に出す文言にする。
 */
export const formatReadTime = (readMs: number): string => `${(readMs / 1000).toFixed(1)} 秒`;

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

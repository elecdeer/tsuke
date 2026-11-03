import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ExtractedPayment } from "../llm/extractPayment.ts";
import type { ReadQuality } from "../llm/readQuality.ts";
import {
  markReadFailed,
  nextToRead,
  requestAccurateRead,
  restoreEntries,
  upsertEntry,
  type ReceiptEntry,
} from "./receiptQueue.ts";
import { createReceiptQueueStore } from "./receiptQueueStore.ts";
import type { TransactionDraft } from "./transactionDraft.ts";

/**
 * キューを操作する関数と、今のキュー。
 */
export type ReceiptQueue = {
  /** 撮った順に並んだレシート */
  entries: ReceiptEntry[];
  /** レシートの ID ごとの写真（data URL） */
  images: ReadonlyMap<string, string>;
  /** 保存しておいたキューを読み込み終えたか */
  loaded: boolean;
  /** 縮めた写真をキューの末尾に足す */
  add: (image: string) => void;
  updateDraft: (id: string, draft: TransactionDraft) => void;
  /** 読み取れなかったものを読み直す */
  retry: (id: string) => void;
  /** 読み取れたものを、より正確なモデルで読み直す */
  rereadAccurately: (id: string) => void;
  /** 登録した、または捨てたレシートをキューから外す */
  remove: (id: string) => void;
};

/**
 * 保存先に書けなくても（プライベートブラウズなど）、画面の中のキューでは続けられるようにする。
 */
const ignoreStoreError = (error: unknown): void => {
  console.warn("receipt queue store failed", error);
};

/**
 * 撮ったレシートを溜め、裏で AI の読み取りを進めるキュー。
 *
 * 読み取りは撮った順に、同時に `READ_CONCURRENCY` 枚まで進める。キューは IndexedDB にも保存し、
 * 画面を開き直したら続きから読み取る。
 *
 * - `read`：写真を読み取る。失敗したら例外を投げる
 * - `toDraft`：読み取った結果（読み取れなければ null）をフォームの値にする
 */
export const useReceiptQueue = ({
  read,
  toDraft,
}: {
  read: (image: string, quality: ReadQuality) => Promise<ExtractedPayment>;
  toDraft: (extracted: ExtractedPayment | null) => TransactionDraft;
}): ReceiptQueue => {
  // サーバーで描くときは IndexedDB がないが、開くのは effect の中だけなので作るだけなら問題ない
  const [store] = useState(() => createReceiptQueueStore());
  const [entries, setEntries] = useState<ReceiptEntry[]>([]);
  const [images, setImages] = useState<ReadonlyMap<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  // 読み取りの結果は非同期に届くので、その時点の最新のキューを ref でも持つ
  const entriesRef = useRef<ReceiptEntry[]>([]);
  // StrictMode で effect が 2 回走っても、同じレシートを 2 回読み取らないようにする
  const started = useRef(new Set<string>());

  const commit = (next: ReceiptEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
  };

  const save = (entry: ReceiptEntry) => {
    commit(upsertEntry(entriesRef.current, entry));
    store.putEntry(entry).catch(ignoreStoreError);
  };

  /** まだキューにあれば（読み取り中に捨てられていなければ）書き換える */
  const patch = (id: string, change: Partial<ReceiptEntry>) => {
    const current = entriesRef.current.find((entry) => entry.id === id);
    if (current !== undefined) save({ ...current, ...change });
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([store.listEntries(), store.getImages()])
      .then(([saved, savedImages]) => {
        if (cancelled) return;
        // 読み込み終わる前に撮ったものも残す
        commit(restoreEntries(saved).reduce(upsertEntry, entriesRef.current));
        setImages((current) => new Map([...savedImages, ...current]));
      })
      .catch(ignoreStoreError)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const startReading = useEffectEvent((entry: ReceiptEntry) => {
    started.current.add(entry.id);
    const image = images.get(entry.id);
    save({ ...entry, status: "reading" });
    const reading =
      image === undefined
        ? Promise.reject(new Error("写真が見つかりません"))
        : read(image, entry.quality ?? "fast");
    reading
      .then(
        (extracted) => patch(entry.id, { status: "read", extracted, draft: toDraft(extracted) }),
        () => patch(entry.id, markReadFailed(entry, toDraft(null))),
      )
      .finally(() => started.current.delete(entry.id));
  });

  useEffect(() => {
    if (!loaded) return;
    for (const entry of nextToRead(entries)) {
      if (!started.current.has(entry.id)) startReading(entry);
    }
  }, [loaded, entries]);

  return {
    entries,
    images,
    loaded,
    add: (image) => {
      const last = entriesRef.current.at(-1);
      const entry: ReceiptEntry = {
        id: crypto.randomUUID(),
        // 続けて足しても撮った順が入れ替わらないよう、前のものより必ず後にする
        createdAt: Math.max(Date.now(), (last?.createdAt ?? 0) + 1),
        status: "waiting",
        extracted: null,
        draft: null,
      };
      setImages((current) => new Map(current).set(entry.id, image));
      commit(upsertEntry(entriesRef.current, entry));
      store.addEntry(entry, image).catch(ignoreStoreError);
    },
    updateDraft: (id, draft) => patch(id, { draft }),
    retry: (id) => patch(id, { status: "waiting" }),
    rereadAccurately: (id) => {
      const current = entriesRef.current.find((entry) => entry.id === id);
      if (current !== undefined) save(requestAccurateRead(current));
    },
    remove: (id) => {
      commit(entriesRef.current.filter((entry) => entry.id !== id));
      setImages((current) => {
        const next = new Map(current);
        next.delete(id);
        return next;
      });
      store.deleteEntry(id).catch(ignoreStoreError);
    },
  };
};

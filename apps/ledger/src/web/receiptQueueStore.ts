import type { ReceiptEntry } from "./receiptQueue.ts";

/**
 * 撮ったレシートのキューをブラウザの IndexedDB に保存する。
 *
 * 画面を閉じたり読み込み直したりしても、確かめていないレシートを撮り直さずに済むようにする。
 * 写真は台帳（サーバー）には保存しない方針なので、端末の中にだけ置く。
 * フォームの入力のたびに数百 KB の写真を書き直さないよう、写真は別のストアに分ける。
 */

const DB_NAME = "tsuke-receipts";
const DB_VERSION = 1;
const ENTRIES = "entries";
const IMAGES = "images";

/**
 * IndexedDB のリクエストの結果を Promise にする。
 */
const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/**
 * トランザクションが書き終わるのを待つ。
 */
const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

/**
 * キューの保存先。開くのは最初に使うときの 1 回だけ。
 */
export type ReceiptQueueStore = {
  listEntries: () => Promise<ReceiptEntry[]>;
  putEntry: (entry: ReceiptEntry) => Promise<void>;
  /** 写真（data URL）とレシートを一緒に足す */
  addEntry: (entry: ReceiptEntry, image: string) => Promise<void>;
  getImages: () => Promise<Map<string, string>>;
  deleteEntry: (id: string) => Promise<void>;
};

/**
 * 保存先を作る。`factory` はテストで差し替えるためのもの。
 */
export const createReceiptQueueStore = (
  factory: IDBFactory = globalThis.indexedDB,
): ReceiptQueueStore => {
  let opened: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    opened ??= new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(ENTRIES, { keyPath: "id" });
        request.result.createObjectStore(IMAGES);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return opened;
  };

  return {
    listEntries: async () => {
      const db = await open();
      // 保存するのは ReceiptEntry だけなので、読み出した値もその形になっている
      return requestResult(
        db.transaction(ENTRIES).objectStore(ENTRIES).getAll() as IDBRequest<ReceiptEntry[]>,
      );
    },
    putEntry: async (entry) => {
      const db = await open();
      const transaction = db.transaction(ENTRIES, "readwrite");
      transaction.objectStore(ENTRIES).put(entry);
      await transactionDone(transaction);
    },
    addEntry: async (entry, image) => {
      const db = await open();
      const transaction = db.transaction([ENTRIES, IMAGES], "readwrite");
      transaction.objectStore(IMAGES).put(image, entry.id);
      transaction.objectStore(ENTRIES).put(entry);
      await transactionDone(transaction);
    },
    getImages: async () => {
      const db = await open();
      const store = db.transaction(IMAGES).objectStore(IMAGES);
      // キーはレシートの ID、値は data URL の文字列だけを保存している
      const [keys, values] = await Promise.all([
        requestResult(store.getAllKeys() as IDBRequest<string[]>),
        requestResult(store.getAll() as IDBRequest<string[]>),
      ]);
      return new Map(keys.map((key, index) => [key, values[index] ?? ""]));
    },
    deleteEntry: async (id) => {
      const db = await open();
      const transaction = db.transaction([ENTRIES, IMAGES], "readwrite");
      transaction.objectStore(ENTRIES).delete(id);
      transaction.objectStore(IMAGES).delete(id);
      await transactionDone(transaction);
    },
  };
};

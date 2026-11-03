import { IDBFactory } from "fake-indexeddb";
import { describe, expect, test } from "vite-plus/test";
import type { ReceiptEntry } from "./receiptQueue.ts";
import { createReceiptQueueStore } from "./receiptQueueStore.ts";

const entry = (id: string, createdAt: number): ReceiptEntry => ({
  id,
  createdAt,
  status: "waiting",
  extracted: null,
  draft: null,
});

describe("createReceiptQueueStore", () => {
  test("足したレシートと写真を読み出せる", async () => {
    const store = createReceiptQueueStore(new IDBFactory());
    await store.addEntry(entry("a", 1), "data:image/jpeg;base64,AAA");
    await store.addEntry(entry("b", 2), "data:image/jpeg;base64,BBB");

    expect((await store.listEntries()).map((current) => current.id).sort()).toEqual(["a", "b"]);
    expect(await store.getImages()).toEqual(
      new Map([
        ["a", "data:image/jpeg;base64,AAA"],
        ["b", "data:image/jpeg;base64,BBB"],
      ]),
    );
  });

  test("レシートを書き換えても写真は残る", async () => {
    const store = createReceiptQueueStore(new IDBFactory());
    await store.addEntry(entry("a", 1), "data:image/jpeg;base64,AAA");
    await store.putEntry({ ...entry("a", 1), status: "read" });

    expect(await store.listEntries()).toEqual([{ ...entry("a", 1), status: "read" }]);
    expect((await store.getImages()).get("a")).toBe("data:image/jpeg;base64,AAA");
  });

  test("消すとレシートと写真の両方がなくなる", async () => {
    const store = createReceiptQueueStore(new IDBFactory());
    await store.addEntry(entry("a", 1), "data:image/jpeg;base64,AAA");
    await store.addEntry(entry("b", 2), "data:image/jpeg;base64,BBB");
    await store.deleteEntry("a");

    expect((await store.listEntries()).map((current) => current.id)).toEqual(["b"]);
    expect([...(await store.getImages()).keys()]).toEqual(["b"]);
  });

  test("開き直しても保存した内容が残る", async () => {
    const factory = new IDBFactory();
    await createReceiptQueueStore(factory).addEntry(entry("a", 1), "data:image/jpeg;base64,AAA");

    const reopened = createReceiptQueueStore(factory);
    expect((await reopened.listEntries()).map((current) => current.id)).toEqual(["a"]);
  });
});

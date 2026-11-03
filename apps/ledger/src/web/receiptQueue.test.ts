import { describe, expect, test } from "vite-plus/test";
import {
  nextAfterRemoval,
  nextToRead,
  restoreEntries,
  selectedEntry,
  sortEntries,
  upsertEntry,
  type ReceiptEntry,
  type ReceiptStatus,
} from "./receiptQueue.ts";

const entry = (id: string, createdAt: number, status: ReceiptStatus = "waiting"): ReceiptEntry => ({
  id,
  createdAt,
  status,
  extracted: null,
  draft: null,
});

const ids = (entries: ReceiptEntry[]) => entries.map((current) => current.id);

describe("sortEntries", () => {
  test("撮った順に並べる", () => {
    expect(ids(sortEntries([entry("b", 2), entry("c", 3), entry("a", 1)]))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("nextToRead", () => {
  test("待っているものを撮った順に上限まで選ぶ", () => {
    const entries = [entry("c", 3), entry("a", 1), entry("b", 2)];
    expect(ids(nextToRead(entries, 2))).toEqual(["a", "b"]);
  });

  test("読み取り中のものを上限に数える", () => {
    const entries = [entry("a", 1, "reading"), entry("b", 2), entry("c", 3)];
    expect(ids(nextToRead(entries, 2))).toEqual(["b"]);
  });

  test("上限まで読み取り中なら何も選ばない", () => {
    const entries = [entry("a", 1, "reading"), entry("b", 2, "reading"), entry("c", 3)];
    expect(nextToRead(entries, 2)).toEqual([]);
  });

  test("読み取り済み・失敗したものは選ばない", () => {
    const entries = [entry("a", 1, "read"), entry("b", 2, "failed")];
    expect(nextToRead(entries, 2)).toEqual([]);
  });
});

describe("restoreEntries", () => {
  test("読み取り中のまま残っていたものを待ちに戻し、撮った順に並べる", () => {
    const restored = restoreEntries([entry("b", 2, "read"), entry("a", 1, "reading")]);
    expect(restored.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "a", status: "waiting" },
      { id: "b", status: "read" },
    ]);
  });
});

describe("selectedEntry", () => {
  const entries = [entry("b", 2), entry("a", 1)];

  test("選んでいるものを返す", () => {
    expect(selectedEntry(entries, "b")?.id).toBe("b");
  });

  test("選んでいるものがなければキューの先頭を返す", () => {
    expect(selectedEntry(entries, "gone")?.id).toBe("a");
    expect(selectedEntry(entries, null)?.id).toBe("a");
  });

  test("キューが空なら null を返す", () => {
    expect(selectedEntry([], null)).toBeNull();
  });
});

describe("nextAfterRemoval", () => {
  const entries = [entry("a", 1), entry("b", 2), entry("c", 3)];

  test("後ろに続くものを選ぶ", () => {
    expect(nextAfterRemoval(entries, "b")).toBe("c");
  });

  test("末尾を外したら 1 つ前を選ぶ", () => {
    expect(nextAfterRemoval(entries, "c")).toBe("b");
  });

  test("最後の 1 枚を外したら null を返す", () => {
    expect(nextAfterRemoval([entry("a", 1)], "a")).toBeNull();
  });
});

describe("upsertEntry", () => {
  test("同じ ID のものを差し替える", () => {
    const updated = upsertEntry([entry("a", 1), entry("b", 2)], entry("a", 1, "read"));
    expect(updated.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "a", status: "read" },
      { id: "b", status: "waiting" },
    ]);
  });

  test("新しいものを撮った順の位置に足す", () => {
    expect(ids(upsertEntry([entry("a", 1), entry("c", 3)], entry("b", 2)))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

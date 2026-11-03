import { describe, expect, test } from "vite-plus/test";
import {
  draftFromTransaction,
  moveItem,
  updateFromDraft,
  type TransactionDraft,
} from "./transactionDraft.ts";

describe("draftFromTransaction", () => {
  test("保存されている取引を入力欄の文字列にする", () => {
    expect(
      draftFromTransaction({
        id: 1,
        date: "2026-10-01",
        mode: "payment",
        aggregation: "never",
        source: "manual",
        fromAccountId: 3,
        toAccountId: null,
        placeName: null,
        items: [{ categoryId: 1, genreId: 2, name: null, memo: "メモ", amount: -50 }],
      }),
    ).toEqual({
      date: "2026-10-01",
      aggregation: "never",
      fromAccountId: "3",
      toAccountId: "",
      placeName: "",
      placeDetail: null,
      items: [{ key: 0, category: "g:1:2", name: "", memo: "メモ", amount: "-50" }],
    });
  });
});

describe("updateFromDraft", () => {
  const item = { key: 0, category: "g:1:2", name: "牛乳", memo: "", amount: " 1,280 " };
  const draft: TransactionDraft = {
    date: "2026-10-01",
    aggregation: "always",
    fromAccountId: "3",
    toAccountId: "",
    placeName: "スーパー",
    placeDetail: { chain: "スーパーチェーン", poi: null },
    items: [item],
  };

  test("入力欄の文字列を保存の入力にする", () => {
    expect(updateFromDraft(draft)).toEqual({
      ok: true,
      input: {
        date: "2026-10-01",
        aggregation: "always",
        fromAccountId: 3,
        toAccountId: null,
        placeName: "スーパー",
        placeDetail: { chain: "スーパーチェーン", poi: null },
        items: [{ categoryId: 1, genreId: 2, name: "牛乳", memo: "", amount: 1280 }],
      },
    });
  });

  test("負の金額を受け付ける", () => {
    const result = updateFromDraft({ ...draft, items: [{ ...item, amount: "-30" }] });

    expect(result.ok && result.input.items[0]?.amount).toBe(-30);
  });

  test.each(["", "12.5", "abc"])("金額が「%s」なら理由を返す", (amount) => {
    expect(
      updateFromDraft({
        ...draft,
        items: [...draft.items, { key: 1, category: "", name: "", memo: "", amount }],
      }),
    ).toEqual({ ok: false, error: "2 件目の金額を整数で入れてください" });
  });
});

describe("moveItem", () => {
  test("要素を後ろへ動かす", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  test("要素を前へ動かす", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });

  test("範囲の外へは動かさない", () => {
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});

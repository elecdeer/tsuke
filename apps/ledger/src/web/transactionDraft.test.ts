import { describe, expect, test } from "vite-plus/test";
import {
  draftForMode,
  draftFromTransaction,
  emptyItem,
  isDraftEdited,
  moveItem,
  toSingleLine,
  updateFromDraft,
  type TransactionDraft,
} from "./transactionDraft.ts";

describe("toSingleLine", () => {
  test("改行を空白に置き換える", () => {
    expect(toSingleLine("コーヒー\nミルク")).toBe("コーヒー ミルク");
  });

  test("続いた改行や CRLF は 1 つの空白にまとめる", () => {
    expect(toSingleLine("コーヒー\r\n\r\nミルク")).toBe("コーヒー ミルク");
  });

  test("改行のない値はそのまま返す", () => {
    expect(toSingleLine("コーヒー ミルク")).toBe("コーヒー ミルク");
  });
});

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
        hasReceiptImage: false,
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

describe("draftForMode", () => {
  const paymentDraft: TransactionDraft = {
    date: "2026-10-01",
    aggregation: "never",
    fromAccountId: "3",
    toAccountId: "",
    placeName: "スーパー",
    placeDetail: { chain: "スーパーチェーン", poi: null },
    items: [
      { key: 0, category: "g:1:2", name: "牛乳", memo: "メモ", amount: "200" },
      { key: 1, category: "g:1:3", name: "卵", memo: "", amount: "300" },
    ],
  };

  test("日付と集計の設定は引き継ぐ", () => {
    expect(draftForMode(paymentDraft, "transfer")).toMatchObject({
      date: "2026-10-01",
      aggregation: "never",
    });
  });

  test("収入にすると支払元とカテゴリを消し、先頭の品目だけを残す。店舗は残す", () => {
    expect(draftForMode(paymentDraft, "income")).toMatchObject({
      fromAccountId: "",
      toAccountId: "",
      placeName: "スーパー",
      items: [{ key: 0, category: "", name: "牛乳", memo: "メモ", amount: "200" }],
    });
  });

  test("振替にすると店舗を消し、口座は両方残す", () => {
    const draft = draftForMode({ ...paymentDraft, toAccountId: "4" }, "transfer");

    expect(draft).toMatchObject({
      fromAccountId: "3",
      toAccountId: "4",
      placeName: "",
      placeDetail: null,
    });
    expect(draft.items).toHaveLength(1);
  });

  test("支出にすると入金先とカテゴリを消す", () => {
    const draft = draftForMode({ ...paymentDraft, toAccountId: "4" }, "payment");

    expect(draft.toAccountId).toBe("");
    expect(draft.fromAccountId).toBe("3");
    expect(draft.items.map((item) => item.category)).toEqual(["", ""]);
  });

  test("残高調整にすると、口座が両方あれば入金先を残す", () => {
    expect(draftForMode({ ...paymentDraft, toAccountId: "4" }, "adjustment")).toMatchObject({
      fromAccountId: "",
      toAccountId: "4",
    });
  });

  test("残高調整にすると、支払元だけならそのまま残す", () => {
    expect(draftForMode(paymentDraft, "adjustment")).toMatchObject({
      fromAccountId: "3",
      toAccountId: "",
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

describe("isDraftEdited", () => {
  const original: TransactionDraft = {
    date: "2026-11-03",
    aggregation: "always",
    fromAccountId: "",
    toAccountId: "",
    placeName: "スーパーA",
    placeDetail: null,
    items: [{ ...emptyItem(0), name: "牛乳", amount: "248" }],
  };

  test("同じ値なら直していないと判定する", () => {
    expect(isDraftEdited(structuredClone(original), original)).toBe(false);
  });

  test("品目の金額を変えたら直したと判定する", () => {
    const edited = { ...original, items: [{ ...emptyItem(0), name: "牛乳", amount: "300" }] };
    expect(isDraftEdited(edited, original)).toBe(true);
  });
});

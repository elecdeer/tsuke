import { describe, expect, test } from "vite-plus/test";
import type { ExtractedPayment } from "../llm/extractPayment.ts";
import {
  draftFromExtracted,
  duplicateCheckFromDraft,
  emptyPaymentDraft,
  paymentFromDraft,
} from "./receiptDraft.ts";
import type { TransactionDraft } from "./transactionDraft.ts";

const context = {
  categories: [
    { id: 1, name: "食費", genres: [{ id: 11, name: "食料品" }] },
    { id: 2, name: "日用品", genres: [{ id: 21, name: "消耗品" }] },
  ],
  accounts: [{ id: 3 }, { id: 4 }],
  placeNames: ["ミドリマート"],
  chainNames: ["ミドリ"],
  today: "2026-10-29",
};

const milk = { name: "牛乳", amount: 248, memo: null, genreId: 11 };

const extracted: ExtractedPayment = {
  date: "2026-10-27",
  accountId: 4,
  placeName: "ミドリマート",
  items: [milk, { name: "洗剤", amount: 328, memo: "詰め替え", genreId: 21 }],
  confidence: "high",
  reasoning: "",
};

describe("emptyPaymentDraft", () => {
  test("日付を今日にした、品目 1 件の空のフォームを作る", () => {
    expect(emptyPaymentDraft("2026-10-29")).toEqual({
      date: "2026-10-29",
      aggregation: "always",
      fromAccountId: "",
      toAccountId: "",
      placeName: "",
      placeDetail: null,
      items: [{ key: 0, category: "", name: "", memo: "", amount: "" }],
    });
  });
});

describe("draftFromExtracted", () => {
  test("読み取った店舗が一覧になければ、新しい店舗としてチェーンを推測する", () => {
    const draft = draftFromExtracted(
      { ...extracted, placeName: "ミドリ 新宿店" },
      { ...context, chainNames: [] },
    );
    expect(draft.placeDetail).toEqual({ chain: "ミドリ", poi: null });
  });

  test("読み取った値をフォームの文字列にし、内訳はカテゴリと合わせた選択肢の値にする", () => {
    expect(draftFromExtracted(extracted, context)).toEqual({
      date: "2026-10-27",
      aggregation: "always",
      fromAccountId: "4",
      toAccountId: "",
      placeName: "ミドリマート",
      placeDetail: null,
      items: [
        {
          key: 0,
          category: "g:1:11",
          name: "牛乳",
          memo: "",
          amount: "248",
          aiGuess: { genreId: 11, name: "牛乳" },
        },
        {
          key: 1,
          category: "g:2:21",
          name: "洗剤",
          memo: "詰め替え",
          amount: "328",
          aiGuess: { genreId: 21, name: "洗剤" },
        },
      ],
    });
  });

  test("読み取れなかった項目は空にし、日付は今日にする", () => {
    const draft = draftFromExtracted(
      {
        ...extracted,
        date: null,
        accountId: null,
        placeName: null,
        items: [{ name: null, amount: null, memo: null, genreId: null }],
      },
      context,
    );
    expect(draft).toMatchObject({ date: "2026-10-29", fromAccountId: "", placeName: "" });
    expect(draft.items).toEqual([
      {
        key: 0,
        category: "",
        name: "",
        memo: "",
        amount: "",
        aiGuess: { genreId: null, name: null },
      },
    ]);
  });

  test("候補にない口座・内訳は選んでいないことにする", () => {
    const draft = draftFromExtracted(
      { ...extracted, accountId: 99, items: [{ ...milk, genreId: 999 }] },
      context,
    );
    expect(draft.fromAccountId).toBe("");
    expect(draft.items[0]?.category).toBe("");
    expect(draft.items[0]?.aiGuess).toEqual({ genreId: 999, name: "牛乳" });
  });

  test("品目が空なら空の品目を 1 件置く", () => {
    expect(draftFromExtracted({ ...extracted, items: [] }, context).items).toHaveLength(1);
  });
});

describe("paymentFromDraft", () => {
  const item = { key: 0, category: "g:1:11", name: "牛乳", memo: "", amount: "1,248" };
  const draft: TransactionDraft = {
    date: "2026-10-27",
    aggregation: "always",
    fromAccountId: "4",
    toAccountId: "",
    placeName: "ミドリマート",
    placeDetail: null,
    items: [item],
  };

  test("支出の登録の入力にする", () => {
    expect(paymentFromDraft(draft)).toEqual({
      ok: true,
      input: {
        date: "2026-10-27",
        fromAccountId: 4,
        placeName: "ミドリマート",
        placeDetail: null,
        items: [{ genreId: 11, name: "牛乳", memo: "", amount: 1248 }],
      },
    });
  });

  test("AI が読み取った品目には、フォームで直す前の内訳と品名を付ける", () => {
    const items = [
      { ...item, category: "g:2:21", name: "牛乳 1L", aiGuess: { genreId: 11, name: "牛乳" } },
      { key: 1, category: "g:1:11", name: "手で足した品目", memo: "", amount: "100" },
    ];
    const result = paymentFromDraft({ ...draft, items });
    expect(result.ok && result.input.items).toEqual([
      {
        genreId: 21,
        name: "牛乳 1L",
        memo: "",
        amount: 1248,
        aiGuess: { genreId: 11, name: "牛乳" },
      },
      { genreId: 11, name: "手で足した品目", memo: "", amount: 100 },
    ]);
  });

  test("口座が空なら null にする", () => {
    const result = paymentFromDraft({ ...draft, fromAccountId: "" });
    expect(result.ok && result.input.fromAccountId).toBeNull();
  });

  test("内訳を選んでいない品目があれば理由を返す", () => {
    const items = [...draft.items, { key: 1, category: "", name: "", memo: "", amount: "10" }];
    expect(paymentFromDraft({ ...draft, items })).toEqual({
      ok: false,
      error: "2 件目の内訳を選んでください",
    });
  });

  test("金額が整数でない品目があれば理由を返す", () => {
    const items = [{ ...item, amount: "abc" }];
    expect(paymentFromDraft({ ...draft, items })).toEqual({
      ok: false,
      error: "1 件目の金額を整数で入れてください",
    });
  });
});

describe("duplicateCheckFromDraft", () => {
  test("内訳と金額がそろった品目だけを、フォームの位置と合わせて集める", () => {
    expect(
      duplicateCheckFromDraft({
        date: "2026-10-27",
        items: [
          { key: 0, category: "g:1:11", name: "", memo: "", amount: "248" },
          { key: 1, category: "", name: "", memo: "", amount: "100" },
          { key: 2, category: "g:2:21", name: "", memo: "", amount: "1,328" },
          { key: 3, category: "g:2:21", name: "", memo: "", amount: "" },
        ],
      }),
    ).toEqual({
      input: {
        date: "2026-10-27",
        items: [
          { genreId: 11, amount: 248 },
          { genreId: 21, amount: 1328 },
        ],
      },
      indexes: [0, 2],
    });
  });

  test("確かめられる品目がなければ null を返す", () => {
    expect(
      duplicateCheckFromDraft({
        date: "2026-10-27",
        items: [{ key: 0, category: "", name: "", memo: "", amount: "" }],
      }),
    ).toBeNull();
  });
});

import { describe, expect, test } from "vite-plus/test";
import {
  allocateReimbursements,
  draftFromTransaction,
  emptyItem,
  isDraftEdited,
  itemsTotalOf,
  moveItem,
  toggleAdvanceTarget,
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
        advanceAmount: 0,
        linkedIncomes: [],
        linkedPayments: [],
        items: [
          {
            categoryId: 1,
            genreId: 2,
            name: null,
            memo: "メモ",
            amount: -50,
            isAdvanceTarget: true,
          },
        ],
      }),
    ).toEqual({
      date: "2026-10-01",
      aggregation: "never",
      fromAccountId: "3",
      toAccountId: "",
      placeName: "",
      placeDetail: null,
      items: [
        {
          key: 0,
          category: "g:1:2",
          name: "",
          memo: "メモ",
          amount: "-50",
          isAdvanceTarget: true,
        },
      ],
      advanceAmount: "",
      reimbursements: [],
    });
  });

  test("未入金の残りがある支出の紐付けは、まだ入金がある状態にする", () => {
    const payment = (paymentId: number, advanceAmount: number) => ({
      paymentId,
      date: "2026-10-01",
      title: null,
      total: 3600,
      advanceAmount,
      advanceLimit: 3600,
      otherLinked: 0,
    });
    const draft = draftFromTransaction({
      id: 1,
      date: "2026-10-20",
      mode: "income",
      aggregation: "never",
      source: "manual",
      fromAccountId: null,
      toAccountId: 3,
      placeName: null,
      hasReceiptImage: false,
      advanceAmount: 0,
      linkedIncomes: [],
      linkedPayments: [
        { ...payment(1, 2400), amount: 1200 },
        { ...payment(2, 800), amount: 800 },
      ],
      items: [
        {
          categoryId: 1,
          genreId: null,
          name: null,
          memo: null,
          amount: 2000,
          isAdvanceTarget: false,
        },
      ],
    });

    expect(draft.reimbursements?.map((reimbursement) => reimbursement.expectMore)).toEqual([
      true,
      false,
    ]);
    expect(draft.reimbursements?.map((reimbursement) => reimbursement.amount)).toEqual([
      "1200",
      "800",
    ]);
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
        items: [
          {
            categoryId: 1,
            genreId: 2,
            name: "牛乳",
            memo: "",
            amount: 1280,
            isAdvanceTarget: false,
          },
        ],
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

describe("立替の入力", () => {
  const item = (key: number, amount: string, isAdvanceTarget = false) => ({
    ...emptyItem(key),
    amount,
    isAdvanceTarget,
  });
  const base: TransactionDraft = {
    date: "2026-10-01",
    aggregation: "always",
    fromAccountId: "",
    toAccountId: "",
    placeName: "",
    placeDetail: null,
    items: [item(0, "100")],
  };
  const payment = (paymentId: number, advanceAmount: number) => ({
    paymentId,
    date: "2026-10-01",
    title: null,
    total: 3600,
    advanceAmount,
    advanceLimit: 3600,
    otherLinked: 0,
  });

  describe("itemsTotalOf", () => {
    test("品目の金額の和を返し、入力途中の金額は 0 と数える", () => {
      expect(itemsTotalOf([item(0, "1,000"), item(1, "-200"), item(2, "-"), item(3, "")])).toBe(
        800,
      );
    });
  });

  describe("toggleAdvanceTarget", () => {
    test("印を付けると対象の品目の合計を立替額に入れる", () => {
      const result = toggleAdvanceTarget([item(0, "1000"), item(1, "2,000")], 1, true);

      expect(result.advanceAmount).toBe("2000");
      expect(result.items.map((value) => value.isAdvanceTarget)).toEqual([false, true]);
    });

    test("印がなくなったら立替額を空にする", () => {
      const result = toggleAdvanceTarget([item(0, "1000", true)], 0, false);

      expect(result.advanceAmount).toBe("");
    });
  });

  describe("allocateReimbursements", () => {
    test("未入金の残りに比例した額を入れる", () => {
      const result = allocateReimbursements(
        [
          { payment: payment(1, 2000), amount: "", expectMore: false },
          { payment: payment(2, 3500), amount: "", expectMore: true },
        ],
        5500,
      );

      expect(result.map((value) => value.amount)).toEqual(["2000", "3500"]);
      expect(result.map((value) => value.expectMore)).toEqual([false, true]);
    });
  });

  describe("updateFromDraft", () => {
    test("立替の入力がないフォームでは立替の項目を入れない", () => {
      const parsed = updateFromDraft(base);

      expect(parsed.ok && "advanceAmount" in parsed.input).toBe(false);
      expect(parsed.ok && "reimbursements" in parsed.input).toBe(false);
    });

    test("立替額のカンマを取り除き、空なら 0 にする", () => {
      expect(updateFromDraft({ ...base, advanceAmount: "2,400" })).toMatchObject({
        input: { advanceAmount: 2400 },
      });
      expect(updateFromDraft({ ...base, advanceAmount: " " })).toMatchObject({
        input: { advanceAmount: 0 },
      });
    });

    test("立替額が 0 以上の整数でなければ理由を返す", () => {
      expect(updateFromDraft({ ...base, advanceAmount: "-1" })).toEqual({
        ok: false,
        error: "立替額を 0 以上の整数で入れてください",
      });
    });

    test("紐付けを保存の入力にする", () => {
      const parsed = updateFromDraft({
        ...base,
        reimbursements: [{ payment: payment(7, 100), amount: "1,200", expectMore: true }],
      });

      expect(parsed).toMatchObject({
        input: { reimbursements: [{ paymentId: 7, amount: 1200, expectMore: true }] },
      });
    });

    test("充てる額が整数でなければ理由を返す", () => {
      expect(
        updateFromDraft({
          ...base,
          reimbursements: [{ payment: payment(7, 100), amount: "x", expectMore: false }],
        }),
      ).toEqual({ ok: false, error: "支出へ充てる額を整数で入れてください" });
    });
  });
});

import { describe, expect, test } from "vite-plus/test";
import {
  applyClassifiedRows,
  changeDraftMode,
  decodeCsvBytes,
  describeColumns,
  draftProblem,
  draftsFromRead,
  finishPendingDrafts,
  markDraftEdited,
  registerInputFromDrafts,
  type StatementCsvDraft,
} from "./statementCsvDraft.ts";
import type { StatementCsvReadResultRow } from "../import/statementCsvEvents.ts";

const readRow = (
  overrides: Partial<StatementCsvReadResultRow> = {},
): StatementCsvReadResultRow => ({
  line: 2,
  date: "2026-05-10",
  description: "ｽｰﾊﾟｰA",
  direction: "out",
  amount: 1000,
  mode: "payment",
  placeName: null,
  genreId: 10,
  categoryId: null,
  counterAccountId: null,
  registered: null,
  pending: false,
  ...overrides,
});

const draft = (overrides: Partial<StatementCsvDraft> = {}): StatementCsvDraft => ({
  ...readRow(),
  selected: true,
  place: "",
  edited: false,
  selectionEdited: false,
  ...overrides,
});

describe("draftsFromRead", () => {
  test("登録済みの行は選択を外し、店舗名を入力欄に入れる", () => {
    const registered = { transactionId: 1, date: "2026-05-10", amount: 1000, placeName: null };

    const drafts = draftsFromRead([readRow({ placeName: "スーパーA" }), readRow({ registered })]);

    expect(drafts.map((row) => [row.selected, row.place])).toEqual([
      [true, "スーパーA"],
      [false, ""],
    ]);
  });
});

describe("describeColumns", () => {
  const mapping = {
    firstDataRow: 1,
    dateColumn: 0,
    descriptionColumns: [1, 2],
    amountColumn: null,
    amountPositiveMeans: "outflow" as const,
    outflowColumn: 3,
    inflowColumn: 4,
  };
  const header = ["日付", "摘要", "", "出金", "入金"];
  const sampleRow = ["2026/05/10", "ｽｰﾊﾟｰA", "店", "1000", ""];

  test("役割ごとに列の番号と見出しと最初の行の値を示す", () => {
    expect(describeColumns({ mapping, header, sampleRow })).toEqual([
      { role: "利用日", columnNumber: 1, columnName: "日付", sample: "2026/05/10" },
      { role: "利用先", columnNumber: 2, columnName: "摘要", sample: "ｽｰﾊﾟｰA" },
      { role: "利用先", columnNumber: 3, columnName: "", sample: "店" },
      { role: "出金", columnNumber: 4, columnName: "出金", sample: "1000" },
      { role: "入金", columnNumber: 5, columnName: "入金", sample: "" },
    ]);
  });

  test("金額が 1 列なら正の値の向きを示し、見出しがなければ空にする", () => {
    const columns = describeColumns({
      mapping: {
        ...mapping,
        descriptionColumns: [],
        amountColumn: 1,
        amountPositiveMeans: "inflow",
        outflowColumn: 3,
      },
      header: null,
      sampleRow: ["2026/05/10", "-100"],
    });

    expect(columns).toEqual([
      { role: "利用日", columnNumber: 1, columnName: "", sample: "2026/05/10" },
      { role: "金額（正の値が入金）", columnNumber: 2, columnName: "", sample: "-100" },
    ]);
  });
});

describe("applyClassifiedRows", () => {
  const classified = {
    line: 2,
    mode: "payment" as const,
    placeName: "スーパーA",
    genreId: 20,
    categoryId: null,
    counterAccountId: null,
    registered: null,
    classified: true,
  };
  const registered = { transactionId: 1, date: "2026-05-10", amount: 1000, placeName: null };

  test("分類を埋めて、分類待ちを解く", () => {
    const [applied] = applyClassifiedRows([draft({ pending: true, genreId: null })], [classified]);

    expect(applied).toMatchObject({ pending: false, genreId: 20, place: "スーパーA" });
  });

  test("AI が分類した行には、AI が推測した内訳を持たせる", () => {
    const [payment, income] = applyClassifiedRows(
      [draft({ pending: true }), draft({ line: 3, pending: true })],
      [classified, { ...classified, line: 3, mode: "income", genreId: null }],
    );

    expect(payment?.aiGuess).toEqual({ genreId: 20 });
    // AI が支出と分類しなかった行は、内訳の推測がなかったものとして持つ
    expect(income?.aiGuess).toEqual({ genreId: null });
  });

  test("AI が分類を返さなかった行には、推測を持たせない", () => {
    const [applied] = applyClassifiedRows(
      [draft({ pending: true })],
      [{ ...classified, genreId: null, classified: false }],
    );

    expect(applied).not.toHaveProperty("aiGuess");
  });

  test("登録済みと分かったら選択を外す", () => {
    const [applied] = applyClassifiedRows(
      [draft({ pending: true })],
      [{ ...classified, registered }],
    );

    expect(applied).toMatchObject({ selected: false, registered });
  });

  test("手で変えた選択はそのまま残す", () => {
    const [applied] = applyClassifiedRows(
      [draft({ pending: true, selected: true, selectionEdited: true })],
      [{ ...classified, registered }],
    );

    expect(applied?.selected).toBe(true);
  });

  test("手で直した行は上書きしない", () => {
    const edited = draft({ edited: true, genreId: 10, place: "手入力" });

    expect(applyClassifiedRows([edited], [classified])).toEqual([edited]);
  });

  test("届いていない行は分類待ちのまま", () => {
    const waiting = draft({ line: 9, pending: true });

    expect(applyClassifiedRows([waiting], [classified])).toEqual([waiting]);
  });
});

describe("markDraftEdited", () => {
  test("分類を直すと印を付け、分類待ちを解く", () => {
    const previous = draft({ pending: true });

    expect(markDraftEdited(previous, { ...previous, genreId: 20 })).toMatchObject({
      edited: true,
      pending: false,
      selectionEdited: false,
    });
  });

  test("選択だけを変えても分類は待ち続ける", () => {
    const previous = draft({ pending: true });

    expect(markDraftEdited(previous, { ...previous, selected: false })).toMatchObject({
      edited: false,
      pending: true,
      selectionEdited: true,
    });
  });
});

describe("finishPendingDrafts", () => {
  test("分類待ちを解いて、足りない項目を見せる", () => {
    const [finished] = finishPendingDrafts([draft({ pending: true, genreId: null })]);

    expect(finished?.pending).toBe(false);
    expect(draftProblem(draft({ pending: true, genreId: null }), 1)).toBeNull();
    expect(finished && draftProblem(finished, 1)).toBe("内訳を選んでください");
  });
});

describe("changeDraftMode", () => {
  test("種類に持てない項目を空にする", () => {
    const changed = changeDraftMode(draft({ genreId: 10, place: "スーパーA" }), "transfer");

    expect(changed).toMatchObject({ mode: "transfer", genreId: null, place: "" });
  });
});

describe("draftProblem", () => {
  test("支出は内訳が必須", () => {
    expect(draftProblem(draft({ genreId: null }), 1)).toBe("内訳を選んでください");
    expect(draftProblem(draft(), 1)).toBeNull();
  });

  test("収入はカテゴリなしでも登録できる", () => {
    expect(draftProblem(draft({ mode: "income", direction: "in", genreId: null }), 1)).toBeNull();
  });

  test("振替は取り込む口座とは別の相手の口座が必須", () => {
    const transfer = draft({ mode: "transfer", genreId: null });

    expect(draftProblem(transfer, 1)).toBe("相手の口座を選んでください");
    expect(draftProblem({ ...transfer, counterAccountId: 1 }, 1)).toBe(
      "取り込む口座とは別の口座を選んでください",
    );
    expect(draftProblem({ ...transfer, counterAccountId: 2 }, 1)).toBeNull();
  });
});

describe("registerInputFromDrafts", () => {
  const rowsOf = (drafts: StatementCsvDraft[]) =>
    registerInputFromDrafts({ fileName: "a.csv", accountId: 1, drafts }).rows;

  test("選択した行だけを登録の入力にする", () => {
    expect(rowsOf([draft({ selected: false })])).toEqual([]);
  });

  test("店舗があれば利用先を品名に入れず、なければ品名に残す", () => {
    expect(rowsOf([draft({ place: " スーパーA " }), draft()])).toMatchObject([
      { placeName: "スーパーA", name: null },
      { placeName: null, name: "ｽｰﾊﾟｰA" },
    ]);
  });

  test("AI が分類した支出の行には、直す前の推測とモデルを付ける", () => {
    const input = registerInputFromDrafts({
      fileName: "a.csv",
      accountId: 1,
      model: "test-model",
      drafts: [
        draft({ genreId: 30, aiGuess: { genreId: 20 } }),
        draft({ mode: "income", genreId: null, aiGuess: { genreId: null } }),
        draft(),
      ],
    });

    expect(input.aiModel).toBe("test-model");
    expect(input.rows.map((row) => "aiGuess" in row && row.aiGuess)).toEqual([
      { genreId: 20 },
      false,
      false,
    ]);
  });

  test("モデルが分からなければ付けない", () => {
    expect(
      registerInputFromDrafts({ fileName: "a.csv", accountId: 1, drafts: [] }),
    ).not.toHaveProperty("aiModel");
  });

  test("返金は負の金額の支出にする", () => {
    expect(rowsOf([draft({ direction: "in" })])).toMatchObject([
      { mode: "payment", amount: -1000 },
    ]);
  });

  test("収入と振替の入力を作る", () => {
    expect(
      rowsOf([
        draft({ mode: "income", direction: "in", genreId: null, categoryId: 5 }),
        draft({ mode: "transfer", genreId: null, counterAccountId: 2, place: "" }),
      ]),
    ).toEqual([
      {
        mode: "income",
        description: "ｽｰﾊﾟｰA",
        date: "2026-05-10",
        amount: 1000,
        placeName: null,
        name: "ｽｰﾊﾟｰA",
        categoryId: 5,
      },
      {
        mode: "transfer",
        description: "ｽｰﾊﾟｰA",
        date: "2026-05-10",
        amount: 1000,
        name: "ｽｰﾊﾟｰA",
        direction: "out",
        counterAccountId: 2,
      },
    ]);
  });
});

describe("decodeCsvBytes", () => {
  test("UTF-8 をそのまま読む", () => {
    expect(decodeCsvBytes(new TextEncoder().encode("利用日,金額"))).toBe("利用日,金額");
  });

  test("UTF-8 でなければ Shift_JIS として読む", () => {
    // 「利用」の Shift_JIS
    expect(decodeCsvBytes(Uint8Array.of(0x97, 0x98, 0x97, 0x70))).toBe("利用");
  });
});

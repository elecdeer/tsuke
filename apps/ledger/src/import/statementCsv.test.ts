import { describe, expect, test } from "vite-plus/test";
import {
  applyColumnMapping,
  checkColumnMapping,
  parseCsvTable,
  parseStatementAmount,
  parseStatementDate,
  type ColumnMapping,
} from "./statementCsv.ts";

const cardMapping: ColumnMapping = {
  firstDataRow: 1,
  dateColumn: 0,
  descriptionColumns: [1],
  amountColumn: 2,
  amountPositiveMeans: "outflow",
  outflowColumn: null,
  inflowColumn: null,
};

const bankMapping: ColumnMapping = {
  firstDataRow: 2,
  dateColumn: 0,
  descriptionColumns: [1],
  amountColumn: null,
  amountPositiveMeans: "outflow",
  outflowColumn: 2,
  inflowColumn: 3,
};

describe("parseCsvTable", () => {
  test("列数のそろわない行と、引用符の中のカンマを読む", () => {
    expect(parseCsvTable('口座,1234\n\n日付,内容,金額\n2026/5/10,"A,B",1000\n')).toEqual([
      ["口座", "1234"],
      ["日付", "内容", "金額"],
      ["2026/5/10", "A,B", "1000"],
    ]);
  });

  test("値の途中の引用符で止まらない", () => {
    expect(parseCsvTable('2026/5/10,5" TV,1000')).toEqual([["2026/5/10", '5" TV', "1000"]]);
  });
});

describe("parseStatementDate", () => {
  test.each([
    ["2026/5/10", "2026-05-10"],
    ["2026-05-10", "2026-05-10"],
    ["2026.05.10", "2026-05-10"],
    ["20260510", "2026-05-10"],
    ["2026年5月10日", "2026-05-10"],
    ["２０２６/０５/１０", "2026-05-10"],
    ["26/05/10", "2026-05-10"],
    ["2026/05/10 12:34", "2026-05-10"],
    ["令和8年5月10日", "2026-05-10"],
    ["R8.5.10", "2026-05-10"],
    ["H31/4/30", "2019-04-30"],
  ])("%s を %s にする", (value, expected) => {
    expect(parseStatementDate(value)).toBe(expected);
  });

  test.each(["", "合計", "5/10", "2026/13/01", "2026/02/30"])("%s は読まない", (value) => {
    expect(parseStatementDate(value)).toBeNull();
  });
});

describe("parseStatementAmount", () => {
  test.each([
    ["1000", 1000],
    ["1,000", 1000],
    ["¥1,000", 1000],
    ["\\1,000", 1000],
    ["１，０００円", 1000],
    ["+1000", 1000],
    ["1000.00", 1000],
    ["-500", -500],
    ["−500", -500],
    ["△500", -500],
    ["▲500", -500],
    ["(500)", -500],
    ["0", 0],
  ])("%s を %d にする", (value, expected) => {
    expect(parseStatementAmount(value)).toBe(expected);
  });

  test.each(["", " ", "12.34", "abc", "--5"])("%s は読まない", (value) => {
    expect(parseStatementAmount(value)).toBeNull();
  });
});

describe("applyColumnMapping", () => {
  test("カードの形式：正は出金、負は入金として読み、合計の行は除く", () => {
    const table = [
      ["利用日", "利用店名", "利用金額"],
      ["2026/05/10", "ｽｰﾊﾟｰA", "1,000"],
      ["2026/05/11", "返品", "-300"],
      ["合計", "", "700"],
    ];

    expect(applyColumnMapping(table, cardMapping)).toEqual({
      rows: [
        { line: 2, date: "2026-05-10", description: "ｽｰﾊﾟｰA", direction: "out", amount: 1000 },
        { line: 3, date: "2026-05-11", description: "返品", direction: "in", amount: 300 },
      ],
      skippedCount: 1,
    });
  });

  test("符号付きの列で正が入金の形式を読む", () => {
    const { rows } = applyColumnMapping(
      [
        ["2026/05/10", "給与", "200000"],
        ["2026/05/11", "ATM", "-5000"],
      ],
      {
        ...cardMapping,
        firstDataRow: 0,
        amountPositiveMeans: "inflow",
      },
    );

    expect(rows.map((row) => [row.direction, row.amount])).toEqual([
      ["in", 200000],
      ["out", 5000],
    ]);
  });

  test("銀行の形式：出金と入金の列を読み分け、見出しの前の行を飛ばす", () => {
    const table = [
      ["口座番号", "1234567"],
      ["日付", "摘要", "出金", "入金", "残高"],
      ["2026/05/10", "ﾃﾞﾝｷﾀﾞｲ", "5,000", "", "95,000"],
      ["2026/05/25", "ｷﾕｳﾖ", "", "200,000", "295,000"],
    ];

    expect(applyColumnMapping(table, bankMapping)).toEqual({
      rows: [
        { line: 3, date: "2026-05-10", description: "ﾃﾞﾝｷﾀﾞｲ", direction: "out", amount: 5000 },
        { line: 4, date: "2026-05-25", description: "ｷﾕｳﾖ", direction: "in", amount: 200000 },
      ],
      skippedCount: 0,
    });
  });

  test("複数の説明の列は空白でつなぎ、空の列は飛ばす", () => {
    const { rows } = applyColumnMapping([["2026/05/10", "振込", "", "ﾔﾏﾀﾞ", "100"]], {
      ...cardMapping,
      firstDataRow: 0,
      descriptionColumns: [1, 2, 3],
      amountColumn: 4,
    });

    expect(rows[0]?.description).toBe("振込 ﾔﾏﾀﾞ");
  });

  test("金額が 0 や空の行は除く", () => {
    expect(
      applyColumnMapping(
        [
          ["2026/05/10", "A", "0"],
          ["2026/05/10", "B", ""],
        ],
        {
          ...cardMapping,
          firstDataRow: 0,
        },
      ),
    ).toEqual({ rows: [], skippedCount: 2 });
  });
});

describe("checkColumnMapping", () => {
  const table = [
    ["日付", "内容", "金額"],
    ["2026/05/10", "A", "100"],
  ];

  test("正しい割り当てなら null を返す", () => {
    expect(checkColumnMapping(table, cardMapping)).toBeNull();
  });

  test("範囲外の列を指摘する", () => {
    expect(checkColumnMapping(table, { ...cardMapping, amountColumn: 3 })).toBe(
      "存在しない列を指しています",
    );
  });

  test("範囲外の行を指摘する", () => {
    expect(checkColumnMapping(table, { ...cardMapping, firstDataRow: 2 })).toBe(
      "存在しない行を指しています",
    );
  });

  test("金額の列がなければ指摘する", () => {
    expect(checkColumnMapping(table, { ...cardMapping, amountColumn: null })).toBe(
      "金額の列がありません",
    );
  });
});

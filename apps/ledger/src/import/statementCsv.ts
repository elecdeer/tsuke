/**
 * 銀行やクレジットカードの履歴 CSV を、列の割り当てに従って利用の行に直す。
 *
 * 列の割り当ては AI が CSV ごとに決めるが、日付と金額の値はここでコードで読む。
 * 数百行を LLM に書き写させると、気づきにくい金額の誤りが混ざりうるため。
 */
import { parse } from "csv-parse/sync";
import * as v from "valibot";

/** CSV の列の割り当て。列と行の番号は 0 始まり */
export const ColumnMappingSchema = v.strictObject({
  /** 最初の利用の行。見出しや口座情報の行はこれより前にある */
  firstDataRow: v.number(),
  dateColumn: v.number(),
  /** 利用先や摘要の列。複数あれば空白でつなぐ */
  descriptionColumns: v.array(v.number()),
  /** 1 つの列に符号付きで金額が入る形式の列。出金と入金で列が分かれていれば null */
  amountColumn: v.nullable(v.number()),
  /** `amountColumn` の正の値が表す向き */
  amountPositiveMeans: v.picklist(["outflow", "inflow"]),
  outflowColumn: v.nullable(v.number()),
  inflowColumn: v.nullable(v.number()),
});

export type ColumnMapping = v.InferOutput<typeof ColumnMappingSchema>;

/** CSV から読み取った利用の 1 行 */
export type StatementCsvRow = {
  /** CSV の行番号（1 始まり） */
  line: number;
  date: string;
  description: string;
  /** 口座から見たお金の向き */
  direction: "out" | "in";
  /** 金額（正の整数） */
  amount: number;
};

/**
 * CSV の文字列を行と列の表にする。
 *
 * 明細の CSV は見出しの前に口座情報の行があったり末尾に合計の行があったりして列数がそろわないので、列数は揃えない。
 * 銀行の CSV には値の途中に引用符が入るものがあるので、引用符の誤りも許す。
 */
export const parseCsvTable = (text: string): string[][] => {
  const table: string[][] = parse(text, {
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    skip_records_with_empty_values: true,
    trim: true,
  });
  return table;
};

/** 和暦の元号の開始年の前年 */
const ERA_BASE_YEAR: Record<string, number> = {
  令和: 2018,
  R: 2018,
  平成: 1988,
  H: 1988,
};

/**
 * 年月日が暦の上にある日付なら YYYY-MM-DD にする。
 */
const toIsoDate = (year: number, month: number, day: number): string | null => {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date.toISOString().slice(0, 10) : null;
};

/**
 * 明細の日付を YYYY-MM-DD にする。
 *
 * 2026/5/10・2026-05-10・20260510・2026年5月10日・26/05/10・令和8年5月10日・R8.5.10 を読む。
 * 年のない日付は、どの年か決められないので読まない。
 *
 * @returns 日付として読めなければ null（合計の行などもここで弾かれる）
 */
export const parseStatementDate = (value: string): string | null => {
  const text = value.normalize("NFKC").trim();

  const era = /^(令和|平成|R|H)\s*(\d{1,2})[/.\-年]\s*(\d{1,2})[/.\-月]\s*(\d{1,2})日?$/i.exec(
    text,
  );
  if (era !== null) {
    const base = ERA_BASE_YEAR[(era[1] ?? "").toUpperCase()];
    if (base === undefined) return null;
    return toIsoDate(base + Number(era[2]), Number(era[3]), Number(era[4]));
  }

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (compact !== null) {
    return toIsoDate(Number(compact[1]), Number(compact[2]), Number(compact[3]));
  }

  const separated = /^(\d{4}|\d{2})[/.\-年]\s*(\d{1,2})[/.\-月]\s*(\d{1,2})日?(?:\s.*)?$/.exec(
    text,
  );
  if (separated === null) return null;
  const year = Number(separated[1]);
  return toIsoDate(
    (separated[1] ?? "").length === 2 ? 2000 + year : year,
    Number(separated[2]),
    Number(separated[3]),
  );
};

/**
 * 明細の金額を符号付きの整数にする。
 *
 * 通貨記号・桁区切り・全角数字のほか、マイナスの表記（-・−・△・▲・括弧）を読む。
 *
 * @returns 空か、整数の金額として読めなければ null（外貨の小数の金額も読まない）
 */
export const parseStatementAmount = (value: string): number | null => {
  const text = value
    .normalize("NFKC")
    .replace(/[\s,¥\\円]/g, "")
    .replace(/^\+/, "");
  if (text === "") return null;

  const parenthesized = /^\((.+)\)$/.exec(text);
  const unsigned = (parenthesized?.[1] ?? text).replace(/^[-−△▲]/, "");
  const negative = parenthesized !== null || unsigned !== (parenthesized?.[1] ?? text);

  if (!/^\d+(\.0+)?$/.test(unsigned)) return null;
  const amount = Number(unsigned);
  if (!Number.isSafeInteger(amount)) return null;
  return negative ? -amount : amount;
};

/**
 * 表の 1 行の金額を、口座から見た向きと正の金額にする。
 *
 * 向きの列が分かれている形式で両方に値があることはないはずなので、出金の列を先に見る。
 */
const readAmount = (
  cells: string[],
  mapping: ColumnMapping,
): Pick<StatementCsvRow, "direction" | "amount"> | null => {
  const cell = (column: number | null): number | null =>
    column === null ? null : parseStatementAmount(cells[column] ?? "");

  const signed = (amount: number, positive: StatementCsvRow["direction"]) => {
    const negated = positive === "out" ? "in" : "out";
    return { direction: amount > 0 ? positive : negated, amount: Math.abs(amount) };
  };

  if (mapping.amountColumn !== null) {
    const amount = cell(mapping.amountColumn);
    if (amount === null || amount === 0) return null;
    return signed(amount, mapping.amountPositiveMeans === "outflow" ? "out" : "in");
  }
  const outflow = cell(mapping.outflowColumn);
  if (outflow !== null && outflow !== 0) return signed(outflow, "out");
  const inflow = cell(mapping.inflowColumn);
  if (inflow !== null && inflow !== 0) return signed(inflow, "in");
  return null;
};

/**
 * 列の割り当てが表の範囲に収まり、日付と金額の列があるかを確かめ、問題があれば理由を返す。
 */
export const checkColumnMapping = (table: string[][], mapping: ColumnMapping): string | null => {
  const columnCount = Math.max(0, ...table.map((row) => row.length));
  const columns = [
    mapping.dateColumn,
    ...mapping.descriptionColumns,
    ...[mapping.amountColumn, mapping.outflowColumn, mapping.inflowColumn].filter(
      (column) => column !== null,
    ),
  ];
  if (columns.some((column) => !Number.isInteger(column) || column < 0 || column >= columnCount)) {
    return "存在しない列を指しています";
  }
  if (
    !Number.isInteger(mapping.firstDataRow) ||
    mapping.firstDataRow < 0 ||
    mapping.firstDataRow >= table.length
  ) {
    return "存在しない行を指しています";
  }
  if (
    mapping.amountColumn === null &&
    mapping.outflowColumn === null &&
    mapping.inflowColumn === null
  ) {
    return "金額の列がありません";
  }
  return null;
};

/**
 * 表を列の割り当てに従って利用の行にする。
 *
 * 日付か金額を読めない行は、合計の行や区切りの行として除き、件数だけを返す。
 */
export const applyColumnMapping = (
  table: string[][],
  mapping: ColumnMapping,
): { rows: StatementCsvRow[]; skippedCount: number } => {
  const rows: StatementCsvRow[] = [];
  let skippedCount = 0;
  table.slice(mapping.firstDataRow).forEach((cells, index) => {
    const date = parseStatementDate(cells[mapping.dateColumn] ?? "");
    const amount = readAmount(cells, mapping);
    if (date === null || amount === null) {
      skippedCount += 1;
      return;
    }
    rows.push({
      line: mapping.firstDataRow + index + 1,
      date,
      description: mapping.descriptionColumns
        .map((column) => cells[column] ?? "")
        .filter((text) => text !== "")
        .join(" "),
      ...amount,
    });
  });
  return { rows, skippedCount };
};

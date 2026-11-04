/**
 * LLM による履歴 CSV の読み取り。列の割り当ての判定と、利用先ごとの分類の 2 段階に分ける。
 *
 * 値の書き写しを LLM に任せず（src/import/statementCsv.ts を参照）、分類には同じ利用先を 1 度だけ渡すので、
 * 行数が多くても出力が膨らまない。
 */
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  applyColumnMapping,
  checkColumnMapping,
  ColumnMappingSchema,
  parseCsvTable,
  type StatementCsvRow,
} from "../import/statementCsv.ts";
import type { CategoryWithGenres } from "../ledger/masters.ts";
import {
  ACCOUNT_NOTES_RULE,
  findPlaceName,
  formatAccountsForPrompt,
  formatCategoriesForPrompt,
  formatRecentPlacesForPrompt,
  PLACE_NOTES_RULE,
  resolvePlaceAlias,
  type ExtractPaymentContext,
} from "./extractPayment.ts";
import { runStructuredChat, truncate, type AiRunner } from "./structuredChat.ts";

/** 列の判定に渡す、先頭の行数。見出しの前の口座情報と利用の行の形がわかる長さ */
const HEAD_ROWS = 20;
/** 列の判定に渡す、末尾の行数。合計の行があるかがわかる長さ */
const TAIL_ROWS = 3;
/** 列の判定に渡す 1 行の最大文字数 */
const ROW_MAX_CHARS = 500;
/** 1 回の分類で渡す利用先の数。応答が長くなりすぎると途中で切れるので分ける */
const CLASSIFY_CHUNK_SIZE = 100;
/** 分類の候補として渡す店舗の数 */
const CLASSIFY_PLACES_LIMIT = 200;
/** 1 回の読み取りで受け付ける利用の行数の上限 */
export const STATEMENT_CSV_ROWS_MAX = 500;

/** 読み取りに渡す、台帳の候補 */
export type StatementCsvContext = {
  paymentCategories: CategoryWithGenres[];
  incomeCategories: CategoryWithGenres[];
  accounts: ExtractPaymentContext["accounts"];
  places: ExtractPaymentContext["places"];
};

/** 列の判定の出力スキーマ */
export const DetectedColumnsSchema = v.strictObject({
  mapping: ColumnMappingSchema,
  accountId: v.nullable(v.number()),
  reasoning: v.string(),
});

const DETECTED_COLUMNS_JSON_SCHEMA = toJsonSchema(DetectedColumnsSchema);

/**
 * 列の判定に渡す CSV の抜粋を、行番号付きで作る。行番号を付けるのは、AI に列と行を番号で答えさせるため。
 */
const formatTableExcerpt = (table: string[][]): string => {
  const formatRow = (row: string[], index: number): string =>
    `row ${index}: ${truncate(JSON.stringify(row), ROW_MAX_CHARS)}`;
  const head = table.slice(0, HEAD_ROWS).map(formatRow);
  const tailStart = Math.max(HEAD_ROWS, table.length - TAIL_ROWS);
  const tail = table.slice(tailStart).map((row, index) => formatRow(row, tailStart + index));
  const omitted = tailStart - HEAD_ROWS;
  return [...head, ...(omitted > 0 ? [`... (${omitted} rows omitted)`] : []), ...tail].join("\n");
};

/**
 * 列の判定の system / prompt を作る。
 */
export const buildDetectColumnsPrompt = (input: {
  fileName: string;
  table: string[][];
  accounts: StatementCsvContext["accounts"];
}): { system: string; prompt: string } => ({
  system: [
    "Work out the structure of a CSV exported from a bank account or credit card transaction history, for a household ledger.",
    "The rows are shown as JSON arrays of cells. Row and column numbers start at 0.",
    "",
    "Rules:",
    "- `firstDataRow`: the first row that is an individual transaction, after any account information rows and the header row.",
    "- `dateColumn`: the transaction/usage date (利用日, お取引日), not the billing, value or payment date.",
    "- `descriptionColumns`: the columns that describe the transaction: the merchant (利用店名, 利用先) or the bank's description (摘要, 内容, お取引内容). Do not include the user's name, card number, balance or payment method columns.",
    "- When one column holds the amount: set `amountColumn` to it, with `outflowColumn` and `inflowColumn` null. On a credit card statement use the usage amount (利用金額), not this month's installment or the fee, and positive amounts are outflow. For a signed bank amount, negative amounts are usually outflow, so positive means inflow.",
    "- When withdrawals (出金, お支払金額) and deposits (入金, お預り金額) have separate columns: set `outflowColumn` and `inflowColumn`, with `amountColumn` null. Never use a balance (残高) column as an amount.",
    '- `amountPositiveMeans`: what a positive value in `amountColumn` means. Use "outflow" when `amountColumn` is null.',
    `- \`accountId\`: the account this CSV belongs to, judging from the file name, the account information rows and the descriptions. Must be one of the provided account IDs; otherwise null. ${ACCOUNT_NOTES_RULE}`,
    "- `reasoning`: 1-3 sentences justifying your choices.",
  ].join("\n"),
  prompt: [
    `File name: ${input.fileName}`,
    "",
    "## Accounts (format: `accountId=name`)",
    formatAccountsForPrompt(input.accounts),
    "",
    "## CSV rows",
    "```",
    formatTableExcerpt(input.table),
    "```",
  ].join("\n"),
});

/** 分類の 1 件の出力スキーマ */
const ClassifiedEntrySchema = v.strictObject({
  id: v.number(),
  mode: v.picklist(["payment", "income", "transfer"]),
  placeName: v.nullable(v.string()),
  genreId: v.nullable(v.number()),
  categoryId: v.nullable(v.number()),
  counterAccountId: v.nullable(v.number()),
});

/** 分類の出力スキーマ */
export const ClassifiedEntriesSchema = v.strictObject({
  entries: v.array(ClassifiedEntrySchema),
});

const CLASSIFIED_ENTRIES_JSON_SCHEMA = toJsonSchema(ClassifiedEntriesSchema);

/** 分類に渡す利用先。同じ利用先と向きの行はまとめて 1 件にする */
export type ClassifyTarget = Pick<StatementCsvRow, "description" | "direction">;

/**
 * 分類の system / prompt を作る。
 */
export const buildClassifyPrompt = (
  input: { targets: ClassifyTarget[]; accountName: string | null } & StatementCsvContext,
): { system: string; prompt: string } => ({
  system: [
    "Classify the entries of a bank account or credit card history for a household ledger. Each entry has a description and a direction (`out`: money left the account, `in`: money entered the account).",
    "",
    "Rules:",
    "- Return one item in `entries` per input entry, with the same `id`.",
    "- `mode`: `payment` for spending, `income` for money received (salary, interest, refunds from outside a purchase), `transfer` for money moved between the user's own accounts (credit card bill payment, charging e-money, ATM withdrawals into a cash account, moving money to another of the user's accounts).",
    "- An `in` entry on a credit card is a refund or cancellation of a purchase: use `payment`, with the genre of the original purchase.",
    "- `placeName`: for `payment` and `income`, the name of the store in `Stores` that is the same merchant or payer as the description, copied exactly. Descriptions often abbreviate names or use half-width katakana or romaji (e.g. ｱﾏｿﾞﾝ / AMAZON.CO.JP → Amazon.co.jp), so match by meaning, not by exact text. Use null when no store clearly matches; never invent a store name. " +
      PLACE_NOTES_RULE,
    "- `genreId`: for `payment`, the most fitting genre ID from `Payment categories`. Otherwise null.",
    "- `categoryId`: for `income`, the most fitting category ID from `Income categories`. Otherwise null.",
    `- \`counterAccountId\`: for \`transfer\`, the user's other account (not the account of this history) money moved to or from. Must be one of the provided account IDs; null when none clearly fits. Otherwise null. ${ACCOUNT_NOTES_RULE}`,
  ].join("\n"),
  prompt: [
    `Account of this history: ${input.accountName ?? "(unknown)"}`,
    "",
    "## Payment categories (format: `categoryId=name: genreId=name, ...`)",
    formatCategoriesForPrompt(input.paymentCategories),
    "",
    "## Income categories (format: `categoryId=name`)",
    input.incomeCategories.map((category) => `${category.id}=${category.name}`).join("\n") ||
      "(none)",
    "",
    "## Accounts (format: `accountId=name`)",
    formatAccountsForPrompt(input.accounts),
    "",
    "## Stores (format: `name [count, lastUsedOn]`)",
    formatRecentPlacesForPrompt(input.places, CLASSIFY_PLACES_LIMIT),
    "",
    "## Entries",
    input.targets
      .map((target, id) => `${id}: ${target.direction} ${JSON.stringify(target.description)}`)
      .join("\n"),
  ].join("\n"),
});

/** 分類を台帳の値に確かめた結果 */
export type RowClassification = {
  mode: "payment" | "income" | "transfer";
  placeName: string | null;
  genreId: number | null;
  categoryId: number | null;
  counterAccountId: number | null;
};

/** 読み取った 1 行 */
export type StatementCsvReadRow = StatementCsvRow & RowClassification;

/**
 * AI が分類を返さなかった行の既定の分類。画面でカテゴリを選べば登録できる。
 */
const unclassified = (direction: StatementCsvRow["direction"]): RowClassification => ({
  mode: direction === "out" ? "payment" : "income",
  placeName: null,
  genreId: null,
  categoryId: null,
  counterAccountId: null,
});

/**
 * AI の分類を台帳の値で確かめる。
 *
 * 候補にない ID は捨て、種類に関係のない項目は空にして、登録の決まり（`checkModeRules`）に合う形にする。
 * 口座から出ていくお金は収入にならないので支出に直す。
 */
export const sanitizeClassification = (
  entry: v.InferOutput<typeof ClassifiedEntrySchema>,
  target: ClassifyTarget,
  context: StatementCsvContext & { accountId: number | null },
): RowClassification => {
  const mode = entry.mode === "income" && target.direction === "out" ? "payment" : entry.mode;

  if (mode === "transfer") {
    const known = context.accounts.some((account) => account.id === entry.counterAccountId);
    return {
      ...unclassified(target.direction),
      mode,
      counterAccountId:
        known && entry.counterAccountId !== context.accountId ? entry.counterAccountId : null,
    };
  }

  const placeName =
    entry.placeName !== null
      ? resolvePlaceAlias(entry.placeName, context.places)
      : (findPlaceName(target.description, context.places) ?? null);
  const genreIds = context.paymentCategories.flatMap((category) =>
    category.genres.map((genre) => genre.id),
  );
  return {
    ...unclassified(target.direction),
    mode,
    // 候補にない店舗名は、登録のときに新しい店舗を作ってしまうので捨てる
    placeName: context.places.some((place) => place.name === placeName) ? placeName : null,
    genreId:
      mode === "payment" && entry.genreId !== null && genreIds.includes(entry.genreId)
        ? entry.genreId
        : null,
    categoryId:
      mode === "income" &&
      context.incomeCategories.some((category) => category.id === entry.categoryId)
        ? entry.categoryId
        : null,
  };
};

const targetKey = (target: ClassifyTarget): string => `${target.direction}:${target.description}`;

/**
 * 同じ利用先をまとめて分類し、各行に結果を戻す。
 *
 * 分類は後から画面で直せるので、一部の分割で失敗しても読み取り全体は失敗にせず、その行を未分類で返す。
 */
const classifyRows = async (params: {
  ai: AiRunner;
  model: string;
  rows: StatementCsvRow[];
  accountId: number | null;
  context: StatementCsvContext;
  abortSignal?: AbortSignal;
}): Promise<{ rows: StatementCsvReadRow[]; unclassifiedCount: number }> => {
  const targets = [
    ...new Map(params.rows.map((row) => [targetKey(row), row] as const)).values(),
  ].map(({ description, direction }) => ({ description, direction }));
  const accountName =
    params.context.accounts.find((account) => account.id === params.accountId)?.name ?? null;

  const chunks = Array.from({ length: Math.ceil(targets.length / CLASSIFY_CHUNK_SIZE) }, (_, i) =>
    targets.slice(i * CLASSIFY_CHUNK_SIZE, (i + 1) * CLASSIFY_CHUNK_SIZE),
  );
  const results = await Promise.allSettled(
    chunks.map((chunk) =>
      runStructuredChat({
        ai: params.ai,
        model: params.model,
        buildPrompt: () => buildClassifyPrompt({ ...params.context, targets: chunk, accountName }),
        schemaName: "ClassifiedEntries",
        jsonSchema: CLASSIFIED_ENTRIES_JSON_SCHEMA,
        schema: ClassifiedEntriesSchema,
        abortSignal: params.abortSignal,
      }),
    ),
  );

  const classified = new Map<string, RowClassification>();
  results.forEach((result, chunkIndex) => {
    if (result.status === "rejected") {
      console.error("LLM classify-statement-csv failed", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      return;
    }
    const chunk = chunks[chunkIndex] ?? [];
    for (const entry of result.value.object.entries) {
      const target = chunk[entry.id];
      if (target === undefined) continue;
      classified.set(
        targetKey(target),
        sanitizeClassification(entry, target, { ...params.context, accountId: params.accountId }),
      );
    }
  });

  let unclassifiedCount = 0;
  const rows = params.rows.map((row) => {
    const classification = classified.get(targetKey(row));
    if (classification === undefined) unclassifiedCount += 1;
    return { ...row, ...(classification ?? unclassified(row.direction)) };
  });
  return { rows, unclassifiedCount };
};

/** 読み取りの失敗。`message` は画面に出す */
export type ReadStatementCsvResult =
  | {
      ok: true;
      accountId: number | null;
      rows: StatementCsvReadRow[];
      /** 日付か金額を読めず除いた行数 */
      skippedCount: number;
      /** AI が分類を返さなかった行数 */
      unclassifiedCount: number;
    }
  | { ok: false; status: 400 | 502; message: string };

/**
 * 履歴 CSV を読み取る。AI で列を判定して値を読み、利用先を分類する。
 */
export const readStatementCsv = async (params: {
  ai: AiRunner;
  model: string;
  fileName: string;
  text: string;
  context: StatementCsvContext;
  abortSignal?: AbortSignal;
}): Promise<ReadStatementCsvResult> => {
  let table: string[][];
  try {
    table = parseCsvTable(params.text);
  } catch {
    return { ok: false, status: 400, message: "CSV として読めないファイルです" };
  }
  if (table.length === 0) return { ok: false, status: 400, message: "CSV に行がありません" };

  let detected: v.InferOutput<typeof DetectedColumnsSchema>;
  try {
    ({ object: detected } = await runStructuredChat({
      ai: params.ai,
      model: params.model,
      buildPrompt: () =>
        buildDetectColumnsPrompt({
          fileName: params.fileName,
          table,
          accounts: params.context.accounts,
        }),
      schemaName: "DetectedColumns",
      jsonSchema: DETECTED_COLUMNS_JSON_SCHEMA,
      schema: DetectedColumnsSchema,
      abortSignal: params.abortSignal,
    }));
  } catch (error) {
    console.error("LLM detect-statement-csv-columns failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, status: 502, message: "CSV の列を判定できませんでした" };
  }

  const mappingError = checkColumnMapping(table, detected.mapping);
  if (mappingError !== null) {
    console.error("LLM detected invalid statement csv columns", {
      mappingError,
      mapping: detected.mapping,
    });
    return { ok: false, status: 502, message: "CSV の列を判定できませんでした" };
  }

  const { rows, skippedCount } = applyColumnMapping(table, detected.mapping);
  if (rows.length === 0) {
    return { ok: false, status: 400, message: "CSV から利用の行を読み取れませんでした" };
  }
  if (rows.length > STATEMENT_CSV_ROWS_MAX) {
    return {
      ok: false,
      status: 400,
      message: `一度に取り込めるのは ${STATEMENT_CSV_ROWS_MAX} 行までです（${rows.length} 行あります）。期間を分けて書き出してください`,
    };
  }

  const accountId = params.context.accounts.some((account) => account.id === detected.accountId)
    ? detected.accountId
    : null;
  const classified = await classifyRows({
    ai: params.ai,
    model: params.model,
    rows,
    accountId,
    context: params.context,
    abortSignal: params.abortSignal,
  });
  return { ok: true, accountId, skippedCount, ...classified };
};

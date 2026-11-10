/**
 * LLM によるカード明細ページからの利用行の抽出。
 */
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
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
import {
  runStructuredChat,
  truncate,
  type AiRunner,
  type ExtractTiming,
} from "./structuredChat.ts";

/** プロンプトに渡す、ページの内容と台帳の候補（支払いの抽出と同じ） */
export type ExtractStatementContext = ExtractPaymentContext;

/**
 * 明細の 1 行（1 回の利用）分のスキーマ。
 *
 * 明細は品目の内訳を持たない概要として登録するので、利用先と金額だけを抽出する。
 * `place` は明細に書かれた利用先名、`placeName` はそれと同じ店と推測した既存の店舗の名前。
 * 明細の利用先名は半角カナ・ローマ字・略称などで店舗名と表記がずれるため、照合を LLM に任せる。
 */
const ExtractedStatementRowSchema = v.strictObject({
  date: v.nullable(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
  place: v.nullable(v.string()),
  placeName: v.nullable(v.string()),
  amount: v.nullable(v.number()),
  genreId: v.nullable(v.number()),
});

/**
 * 明細ページから LLM に抽出させる出力スキーマ。
 *
 * 口座（カード）は明細全体で共通なのでトップレベルに置く。
 */
export const ExtractedStatementSchema = v.strictObject({
  accountId: v.nullable(v.number()),
  rows: v.array(ExtractedStatementRowSchema),
  confidence: v.picklist(["high", "medium", "low"]),
  reasoning: v.string(),
});

export type ExtractedStatement = v.InferOutput<typeof ExtractedStatementSchema>;

/** 明細は行数が多いので、1 会計分のページより長く snapshot を渡す */
const STATEMENT_ARIA_SNAPSHOT_MAX_CHARS = 48000;
/** 明細の各行を既存の店舗に紐付けるので、1 会計分より多くの店舗を候補として渡す */
const STATEMENT_PLACES_LIMIT = 200;

/**
 * 明細ページから利用行を抽出するための system / prompt を構築する。
 */
export const buildStatementPrompt = (
  input: ExtractStatementContext,
): { system: string; prompt: string } => {
  const system = [
    "Extract every transaction row from a web page accessibility snapshot of a credit card (or bank / e-money) monthly statement for a household ledger.",
    "",
    "Rules:",
    "- One entry in `rows` per transaction row in the statement. Do not merge or split rows.",
    '- `date`: the usage/transaction date (利用日) as "YYYY-MM-DD", not the billing or payment date. When the year is omitted, infer it from the statement period.',
    "- `place`: the merchant name (利用先) as written on the page.",
    "- `placeName`: the name of the store in `Stores` that is the same merchant as `place`, copied exactly. Statements often abbreviate names or use half-width katakana or romaji (e.g. ｱﾏｿﾞﾝ / AMAZON.CO.JP → Amazon.co.jp), so match by meaning, not by exact text. Use null when no store clearly matches; never invent a store name. " +
      PLACE_NOTES_RULE,
    "- `amount`: the usage amount (利用金額) in JPY as a positive integer. For installment purchases use the original usage amount, not this month's installment. For foreign currency use the JPY amount.",
    "- Skip refunds, cancellations, credits and negative amounts, as well as totals, subtotals and rows that are not individual transactions.",
    "- `genreId`: the most fitting genre ID for each merchant. Must be one of the provided genre IDs; otherwise null.",
    "  The listing shows `categoryId=name: genreId=name, ...` so you can see which genres belong to which category.",
    `- \`accountId\`: the account that matches the card shown on the page. Must be one of the provided account IDs; otherwise null. ${ACCOUNT_NOTES_RULE}`,
    "- `confidence`: high/medium/low based on how clearly the page conveys the transactions.",
    "- `reasoning`: 1-3 sentences justifying your choices.",
    "- Use null for fields that cannot be determined. `rows` may be empty when the page has no transactions.",
  ].join("\n");

  const ariaSnapshot = truncate(input.pageContent.ariaSnapshot, STATEMENT_ARIA_SNAPSHOT_MAX_CHARS);

  const prompt = [
    `URL: ${input.pageContent.url}`,
    `Title: ${input.pageContent.title}`,
    `Collected at: ${input.pageContent.collectedAt}`,
    "",
    "## Categories (format: `categoryId=name: genreId=name, ...`)",
    formatCategoriesForPrompt(input.categories),
    "",
    "## Accounts (format: `accountId=name`)",
    formatAccountsForPrompt(input.accounts),
    "",
    "## Stores (format: `name [count, lastUsedOn]`)",
    formatRecentPlacesForPrompt(input.places, STATEMENT_PLACES_LIMIT),
    "",
    "## Page accessibility snapshot",
    "```",
    ariaSnapshot,
    "```",
  ].join("\n");

  return { system, prompt };
};

/** `ExtractedStatementSchema` を OpenAI 互換の JSON Schema に変換した結果 */
const EXTRACTED_STATEMENT_JSON_SCHEMA = toJsonSchema(ExtractedStatementSchema);

/**
 * 明細の 1 行の店舗名を台帳の店舗の名前に直す。
 *
 * AI が店舗を選べなかった行でも、明細の表記が店舗名か別名に一致していれば店舗が決まる。
 */
export const resolveStatementPlaceName = (
  row: Pick<ExtractedStatement["rows"][number], "place" | "placeName">,
  places: ExtractStatementContext["places"],
): string | null => {
  if (row.placeName !== null) return resolvePlaceAlias(row.placeName, places);
  return row.place === null ? null : (findPlaceName(row.place, places) ?? null);
};

/**
 * Workers AI binding を使って明細ページから利用行を抽出する。
 */
export const runExtractStatement = (params: {
  ai: AiRunner;
  model: string;
  reasoningEffort?: string;
  input: ExtractStatementContext;
  abortSignal?: AbortSignal;
}): Promise<{ object: ExtractedStatement; usage: unknown; timing: ExtractTiming }> =>
  runStructuredChat({
    ai: params.ai,
    model: params.model,
    reasoningEffort: params.reasoningEffort,
    buildPrompt: () => buildStatementPrompt(params.input),
    schemaName: "ExtractedStatement",
    jsonSchema: EXTRACTED_STATEMENT_JSON_SCHEMA,
    schema: ExtractedStatementSchema,
    abortSignal: params.abortSignal,
  }).then((result) => ({
    ...result,
    object: {
      ...result.object,
      rows: result.object.rows.map((row) => ({
        ...row,
        placeName: resolveStatementPlaceName(row, params.input.places),
      })),
    },
  }));

/**
 * LLM による紙のレシートの写真からの支払い情報の抽出。
 *
 * 出力はページからの抽出（extractPayment.ts）と同じ形にして、確認フォームへの入れ方をそろえる。
 */
import * as v from "valibot";
import {
  EXTRACTED_PAYMENT_JSON_SCHEMA,
  ExtractedPaymentSchema,
  formatAccountsForPrompt,
  formatCategoriesForPrompt,
  formatRecentPlacesForPrompt,
  type ExtractedPayment,
  type ExtractPaymentContext,
} from "./extractPayment.ts";
import {
  runStructuredChat,
  type AiRunner,
  type ExtractTiming,
  type StructuredPrompt,
} from "./structuredChat.ts";

/**
 * レシートの画像の data URL の上限の長さ。ブラウザで長辺 1600px の JPEG に縮めてから送るので、
 * ふつうは 1MB に届かない。縮めずに送られた写真を AI に渡さないための上限
 */
const RECEIPT_IMAGE_MAX_LENGTH = 4_000_000;

/**
 * レシートの読み取りでの推論量。既定のままだと出力の 3/4 ほどが推論トークンで、読み取りに 10 秒ほどかかっていた。
 * low でも推論トークンが 150〜400 出て 5〜10 秒かかり、none で 2.5 秒ほどに縮んだ（品名・金額・日付の読み取りは同じだった）。
 * 読み取った値は登録前に画面で確かめて直せるので、精度より待ち時間を優先する。
 * 推論しない Clairic・Clef（Workers AI の抽出・判定モデル）も試したが、Clairic は画像の日本語を読み落とすので使えなかった
 */
const RECEIPT_REASONING_EFFORT = "none";

/** レシートの画像（JPEG・PNG・WebP の data URL） */
export const ReceiptImageSchema = v.pipe(
  v.string(),
  v.regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/),
  v.maxLength(RECEIPT_IMAGE_MAX_LENGTH),
);

/** プロンプトに渡す、レシートの画像と台帳の候補 */
export type ExtractReceiptContext = Omit<ExtractPaymentContext, "pageContent"> & {
  /** レシートの画像の data URL */
  image: string;
  /** 撮影した日（YYYY-MM-DD）。レシートの年が省略・和暦のときの手がかりにする */
  today: string;
};

/**
 * LLM へ渡す system / prompt / 画像を構築する。
 */
export const buildReceiptPrompt = (input: ExtractReceiptContext): StructuredPrompt => {
  const system = [
    "Extract payment info from a photo of a Japanese paper receipt for a household ledger.",
    "",
    "Rules:",
    "- `accountId` must be one of the provided account IDs; otherwise null. Infer it from the payment method printed on the receipt (cash, card brand, e-money, QR payment).",
    '- `date`: "YYYY-MM-DD". Convert Japanese era years (令和8年 = 2026) and two-digit years; when the year is missing, use the year of "Today".',
    "- `placeName`: use a recent store name as is when it clearly fits, else the store name printed on the receipt (include the branch name).",
    "- `confidence`: high/medium/low based on how legible the receipt is.",
    "- `reasoning`: 1-3 sentences justifying your choices.",
    "",
    "`items` (one per product line):",
    "- `amount` is the price actually paid for the line in JPY (integer), tax included. When prices are tax-exclusive (外税/税抜), add the tax so the items sum to the receipt total.",
    "- Discounts (値引, 割引, クーポン) are separate items with negative amounts.",
    "- Do NOT make items from subtotal, total, tax, tendered (お預り), change (お釣り), or points lines.",
    "- `name` is the product name as printed, without codes or tax marks (※, 軽, *); `memo` is a short note (e.g. quantity × unit price) only when helpful.",
    "- `genreId` is the per-item genre. Must be one of the provided genre IDs; otherwise null.",
    "  Pick the genre by its parent category context — the listing shows `categoryId=name: genreId=name, ...` so you can see which genres belong to which category.",
    "  Choose the most fitting genre for each item independently; different items in the same purchase may have different genres.",
    "  A discount item takes the same `genreId` as the item it discounts. When it applies to the whole purchase, use the genre of the largest item.",
    "- Use null for fields that cannot be determined.",
    "- `items` is never empty; include at least one entry even if every field is null.",
  ].join("\n");

  // プロンプトキャッシュは先頭から一致する部分にしか効かないので、変わりにくい順に並べる。
  // カテゴリ・口座はめったに変わらず、今日の日付は日ごとに、店舗の使用回数は登録のたびに変わる
  const prompt = [
    "## Categories (format: `categoryId=name: genreId=name, ...`)",
    formatCategoriesForPrompt(input.categories),
    "",
    "## Accounts (format: `accountId=name, ...`)",
    formatAccountsForPrompt(input.accounts),
    "",
    `Today: ${input.today}`,
    "",
    "## Recent stores (format: `name [count, lastUsedOn]`)",
    formatRecentPlacesForPrompt(input.places),
  ].join("\n");

  return { system, prompt, images: [input.image] };
};

/**
 * Workers AI binding を使ってレシートの写真から支払い情報を抽出する。
 */
export const runExtractReceipt = (params: {
  ai: AiRunner;
  model: string;
  input: ExtractReceiptContext;
  abortSignal?: AbortSignal;
}): Promise<{ object: ExtractedPayment; usage: unknown; timing: ExtractTiming }> =>
  runStructuredChat({
    ai: params.ai,
    model: params.model,
    buildPrompt: () => buildReceiptPrompt(params.input),
    schemaName: "ExtractedPayment",
    jsonSchema: EXTRACTED_PAYMENT_JSON_SCHEMA,
    schema: ExtractedPaymentSchema,
    reasoningEffort: RECEIPT_REASONING_EFFORT,
    abortSignal: params.abortSignal,
  });

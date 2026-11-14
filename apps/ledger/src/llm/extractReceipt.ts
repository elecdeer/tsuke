/**
 * LLM による紙のレシートの写真からの支払い情報の抽出。
 *
 * 出力はページからの抽出（extractPayment.ts）と同じ形にして、確認フォームへの入れ方をそろえる。
 */
import type { LanguageModelUsage } from "ai";
import * as v from "valibot";
import { normalizePhone } from "../ledger/placePhone.ts";
import {
  ACCOUNT_NOTES_RULE,
  ExtractedPaymentSchema,
  findPlaceName,
  formatAccountsForPrompt,
  formatCategoriesForPrompt,
  formatRecentPlacesForPrompt,
  PLACE_NOTES_RULE,
  TAX_ITEM_RULE,
  TOTAL_RULE,
  type ExtractPaymentContext,
  type PlaceForPrompt,
} from "./extractPayment.ts";
import { READ_SETTINGS, type ReadQuality } from "./readQuality.ts";
import {
  runStructuredChat,
  type ModelProvider,
  type ExtractTiming,
  type StructuredPrompt,
} from "./structuredChat.ts";

/**
 * レシートの画像の data URL の上限の長さ。ブラウザで長辺 1600px の JPEG に縮めてから送るので、
 * ふつうは 1MB に届かない。縮めずに送られた写真を AI に渡さないための上限
 */
const RECEIPT_IMAGE_MAX_LENGTH = 4_000_000;

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
 * 写真の中のレシートの範囲。写真の左上を 0、右下を 1000 とした座標。
 *
 * ピクセルにしないのは、写真の大きさを伝えても Gemini が 0〜1000 の座標を返したため（docs/phase5-design.md）。
 * 外れた値でも読み取り全体を失敗にしないよう、値の範囲はここでは確かめず、使うときに確かめる
 */
export const ReceiptBoxSchema = v.strictObject({
  ymin: v.number(),
  xmin: v.number(),
  ymax: v.number(),
  xmax: v.number(),
});

export type ReceiptBox = v.InferOutput<typeof ReceiptBoxSchema>;

/** レシートの読み取りの出力。ページからの抽出の項目に、店舗の電話番号と写真の中のレシートの範囲を足す */
export const ExtractedReceiptSchema = v.strictObject({
  ...ExtractedPaymentSchema.entries,
  placePhone: v.nullable(v.string()),
  receiptBox: v.nullable(ReceiptBoxSchema),
});

export type ExtractedReceipt = v.InferOutput<typeof ExtractedReceiptSchema>;

/**
 * LLM へ渡す system / prompt / 画像を構築する。
 */
export const buildReceiptPrompt = (input: ExtractReceiptContext): StructuredPrompt => {
  const system = [
    "Extract payment info from a photo of a Japanese paper receipt for a household ledger.",
    "",
    "Rules:",
    `- \`accountId\` must be one of the provided account IDs; otherwise null. Infer it from the payment method printed on the receipt (cash, card brand, e-money, QR payment). ${ACCOUNT_NOTES_RULE}`,
    '- `date`: "YYYY-MM-DD". Convert Japanese era years (令和8年 = 2026) and two-digit years; when the year is missing, use the year of "Today".',
    `- \`placeName\`: use a recent store name as is when it clearly fits, else the store name printed on the receipt (include the branch name). When writing a printed name, put one half-width space between the chain name and the branch name (e.g. \`ローソン 新宿西口店\`); use no space when there is no branch. ${PLACE_NOTES_RULE}`,
    TOTAL_RULE,
    "- `placePhone`: the store's phone number printed on the receipt (TEL, 電話), as printed; null when there is none. Do not use fax numbers.",
    "- `receiptBox`: the bounding box of the whole paper receipt in the image, including its blank margins; no part of the receipt may be outside it, and when the receipt is tilted the box must contain all four corners. Integers ymin, xmin, ymax, xmax normalized to 0-1000 relative to the image (top-left is 0,0; bottom-right is 1000,1000), regardless of the image's size. null when no receipt is visible.",
    "- `confidence`: high/medium/low based on how legible the receipt is.",
    "- `reasoning`: 1-3 sentences justifying your choices.",
    "",
    "`items` (one per product line):",
    "- `amount` is the price printed for the line in JPY (integer).",
    "- Discounts (値引, 割引, クーポン) are separate items with negative amounts.",
    TAX_ITEM_RULE,
    "- Do NOT make items from subtotal, total, tendered (お預り), change (お釣り), or points lines.",
    "- `name` is the product name as printed, without codes or tax marks (※, 軽, *); `memo` is a short note (e.g. variant) only when helpful, else null. Never put prices or their breakdown (unit price, quantity × unit price, tax, discount) in `memo`.",
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
    "## Accounts (format: `accountId=name`)",
    formatAccountsForPrompt(input.accounts),
    "",
    `Today: ${input.today}`,
    "",
    "## Recent stores (format: `name [count, lastUsedOn]`)",
    formatRecentPlacesForPrompt(input.places),
  ].join("\n");

  return { system, prompt, images: [input.image] };
};

/** 短い名前は無関係な店舗の名前にも含まれやすいので、部分一致はこの文字数以上の名前でだけ見る */
const PARTIAL_MATCH_MIN_LENGTH = 3;

/**
 * レシートから読み取った店舗名を、既存の店舗の名前に直す。当たらなければそのまま返す。
 *
 * 名前と別名で当たらなければ電話番号で探し、それでも当たらなければ、読み取った語がすべて店舗名に含まれる店舗を探す。
 * 店舗名は OpenPOI の施設から作ると空白を含むので、空白を落として比べる。
 * 本部の番号を印字するチェーンや同じチェーンの別の支店に付けないよう、どちらも 1 つに決まるときだけ直す。
 */
export const resolveReceiptPlaceName = (
  placeName: string | null,
  places: PlaceForPrompt[],
  phone: string | null = null,
): string | null => {
  const known = placeName === null ? undefined : findPlaceName(placeName, places);
  if (known !== undefined) return known;

  const [samePhone, ...otherPhones] =
    phone === null ? [] : places.filter((place) => place.phone === phone);
  if (samePhone !== undefined && otherPhones.length === 0) return samePhone.name;
  if (placeName === null) return null;

  const words = placeName
    .normalize("NFKC")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  if (words.join("").length < PARTIAL_MATCH_MIN_LENGTH) return placeName;
  const [match, ...others] = places.filter((place) => {
    const name = place.name.normalize("NFKC").toLowerCase().replace(/\s/g, "");
    return words.every((word) => name.includes(word));
  });
  return match !== undefined && others.length === 0 ? match.name : placeName;
};

/**
 * AI でレシートの写真から支払い情報を抽出する。
 */
export const runExtractReceipt = (params: {
  ai: ModelProvider;
  quality: ReadQuality;
  input: ExtractReceiptContext;
  abortSignal?: AbortSignal;
}): Promise<{ object: ExtractedReceipt; usage: LanguageModelUsage; timing: ExtractTiming }> =>
  runStructuredChat({
    ai: params.ai,
    model: READ_SETTINGS[params.quality].model,
    buildPrompt: () => buildReceiptPrompt(params.input),
    schemaName: "ExtractedReceipt",
    schema: ExtractedReceiptSchema,
    reasoningEffort: READ_SETTINGS[params.quality].reasoningEffort,
    abortSignal: params.abortSignal,
  }).then((result) => {
    const placePhone = normalizePhone(result.object.placePhone);
    return {
      ...result,
      object: {
        ...result.object,
        placePhone,
        placeName: resolveReceiptPlaceName(
          result.object.placeName,
          params.input.places,
          placePhone,
        ),
      },
    };
  });

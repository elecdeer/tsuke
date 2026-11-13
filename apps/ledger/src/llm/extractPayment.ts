/**
 * LLM によるページからの支払い情報の抽出。
 * AI SDK の呼び出しは structuredChat.ts にまとめている。
 */
import type { LanguageModelUsage } from "ai";
import * as v from "valibot";
import type { CategoryWithGenres, PlaceWithUsage } from "../ledger/masters.ts";
import {
  runStructuredChat,
  truncate,
  type ModelProvider,
  type ExtractTiming,
  type ReasoningEffort,
} from "./structuredChat.ts";

/** 拡張機能の content script が集めたページの内容 */
export const PageContentSchema = v.object({
  url: v.string(),
  title: v.string(),
  ariaSnapshot: v.string(),
  collectedAt: v.string(),
});

export type PageContent = v.InferOutput<typeof PageContentSchema>;

/** プロンプトに渡す店舗。別名とヒントは設定してある店舗にだけある。電話番号はプロンプトには出さず、読み取りの後の紐付けに使う */
export type PlaceForPrompt = PlaceWithUsage & {
  aliases?: string[];
  aiHint?: string | null;
  phone?: string | null;
};

/** プロンプトに渡す口座。ヒントは設定してある口座にだけある */
export type AccountForPrompt = {
  id: number;
  name: string;
  aiHint?: string | null;
};

/** プロンプトに渡す、ページの内容と台帳の候補 */
export type ExtractPaymentContext = {
  pageContent: PageContent;
  /** 支出のカテゴリ */
  categories: CategoryWithGenres[];
  accounts: AccountForPrompt[];
  places: PlaceForPrompt[];
};

/**
 * 抽出された 1 品目分のスキーマ。明細行 1 つに対応する。
 *
 * `genreId` は品目ごとに推論する（同じ会計でも商品ごとにジャンルが変わり得るため）。
 *
 * OpenAI Structured Outputs の strict モードは object に `additionalProperties: false`
 * を要求する。`v.strictObject` を使うと `@valibot/to-json-schema` が自動で付けてくれる。
 */
const ExtractedPaymentItemSchema = v.strictObject({
  name: v.nullable(v.string()),
  amount: v.nullable(v.number()),
  memo: v.nullable(v.string()),
  genreId: v.nullable(v.number()),
});

/**
 * LLM に強制させる出力スキーマ。不明な項目は `null` を返させる。
 *
 * 1 回の支払い全体に共通する属性（日付・口座・店舗）はトップレベルに、
 * 品目ごとに変わり得る属性（名称・金額・内訳等）は `items` 配列に格納する。
 * カテゴリは内訳から一意に決まるため LLM には推論させない。
 */
export const ExtractedPaymentSchema = v.strictObject({
  date: v.nullable(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
  accountId: v.nullable(v.number()),
  placeName: v.nullable(v.string()),
  items: v.array(ExtractedPaymentItemSchema),
  confidence: v.picklist(["high", "medium", "low"]),
  reasoning: v.string(),
});

export type ExtractedPayment = v.InferOutput<typeof ExtractedPaymentSchema>;

/** 店舗の一覧の別名とヒントの読み方。店舗の一覧を渡すプロンプトで共通に使う */
export const PLACE_NOTES_RULE =
  "A store line may add `aka:` (other names the same store goes by; answer with the store name, not the alias) and `hint:` (the user's note on how to recognize or treat the store; follow it).";

/** 口座の一覧のヒントの読み方。口座の一覧を渡すプロンプトで共通に使う */
export const ACCOUNT_NOTES_RULE =
  "An account line may add `hint:` (the user's note on how to recognize or when to choose the account; follow it).";

const ARIA_SNAPSHOT_MAX_CHARS = 16000;
const RECENT_PLACES_LIMIT = 20;

/**
 * カテゴリ一覧を 1 カテゴリ 1 行のコンパクトな形式にまとめる。
 */
export const formatCategoriesForPrompt = (categories: CategoryWithGenres[]): string => {
  if (categories.length === 0) return "(none)";
  return categories
    .map((category) => {
      const genres =
        category.genres.map((genre) => `${genre.id}=${genre.name}`).join(", ") || "(none)";
      return `${category.id}=${category.name}: ${genres}`;
    })
    .join("\n");
};

/**
 * 口座一覧をプロンプト用に 1 口座 1 行でフォーマットする。ヒントに読点やカンマが入っても区切りと紛れないようにするため。
 */
export const formatAccountsForPrompt = (accounts: ExtractPaymentContext["accounts"]): string => {
  if (accounts.length === 0) return "(none)";
  return accounts
    .map((account) =>
      [
        `${account.id}=${account.name}`,
        ...((account.aiHint ?? null) !== null ? [`hint: ${account.aiHint}`] : []),
      ].join("; "),
    )
    .join("\n");
};

/** 別名かヒントが設定してあれば true を返す */
const hasPlaceNotes = (place: PlaceForPrompt): boolean =>
  (place.aliases?.length ?? 0) > 0 || (place.aiHint ?? null) !== null;

/**
 * 店舗 1 件をプロンプトの 1 行にする。
 */
const formatPlaceForPrompt = (place: PlaceForPrompt): string => {
  const aliases = place.aliases ?? [];
  return [
    `${place.name} [${place.useCount}x, ${place.lastUsedOn ?? "never"}]`,
    ...(aliases.length > 0 ? [`aka: ${aliases.join(" / ")}`] : []),
    ...((place.aiHint ?? null) !== null ? [`hint: ${place.aiHint}`] : []),
  ].join("; ");
};

/**
 * 最近使った店舗をプロンプト用にフォーマットする。使ったことのない店舗は候補にしない。
 *
 * 別名やヒントのある店舗は、古くても未使用でも候補に入れる。ユーザーがわざわざ設定した手がかりが、
 * 最近使った店舗の上限で切られて効かなくならないようにするため。
 */
export const formatRecentPlacesForPrompt = (
  places: PlaceForPrompt[],
  limit: number = RECENT_PLACES_LIMIT,
): string => {
  const recent = places.filter((place) => place.lastUsedOn !== null).slice(0, limit);
  const noted = places.filter((place) => hasPlaceNotes(place) && !recent.includes(place));
  const candidates = [...recent, ...noted];
  if (candidates.length === 0) return "(none)";
  return candidates.map(formatPlaceForPrompt).join("\n");
};

/** 表記ゆれを比べるための形にする。半角カナや全角英数、大文字小文字の違いは同じと見なす */
const normalizePlaceName = (name: string): string => name.normalize("NFKC").trim().toLowerCase();

/**
 * 名前か別名が一致する店舗の正式な名前を返す。なければ undefined を返す。別名より店舗名の一致を優先する。
 */
export const findPlaceName = (name: string, places: PlaceForPrompt[]): string | undefined => {
  if (places.some((place) => place.name === name)) return name;
  const wanted = normalizePlaceName(name);
  return places.find((place) =>
    place.aliases?.some((alias) => normalizePlaceName(alias) === wanted),
  )?.name;
};

/**
 * AI が返した店舗名が別名なら、その店舗の正式な名前に直す。別名でなければそのまま返す。
 *
 * AI が別名をそのまま返すと、登録のときに同じ表記の新しい店舗が作られてしまうため。
 */
export const resolvePlaceAlias = (
  placeName: string | null,
  places: PlaceForPrompt[],
): string | null => (placeName === null ? null : (findPlaceName(placeName, places) ?? placeName));

/**
 * LLM へ渡す system / prompt を構築する。
 */
export const buildPrompt = (input: ExtractPaymentContext): { system: string; prompt: string } => {
  const system = [
    "Extract payment info from a web page accessibility snapshot (receipt, order confirmation, invoice, transaction history, etc.) for a household ledger.",
    "",
    "Rules:",
    `- \`accountId\` must be one of the provided account IDs; otherwise null. ${ACCOUNT_NOTES_RULE}`,
    '- `date`: "YYYY-MM-DD"; prefer the order/purchase date when several exist.',
    `- \`placeName\`: use a recent store name as is when it clearly fits, else extract the merchant name from the page. ${PLACE_NOTES_RULE}`,
    "- `confidence`: high/medium/low based on how clearly the page conveys the payment.",
    "- `reasoning`: 1-3 sentences justifying your choices.",
    "",
    "`items` (one per line item):",
    "- Split itemized receipts/orders into one entry per product; single payments → one item.",
    "- `amount` is the per-item subtotal in JPY (integer); items should sum to the page total when shown. Discounts are separate items with negative amounts.",
    "- `name` is the product/service name; `memo` is a short note (e.g. quantity, variant) only when helpful.",
    "- `genreId` is the per-item genre. Must be one of the provided genre IDs; otherwise null.",
    "  Pick the genre by its parent category context — the listing shows `categoryId=name: genreId=name, ...` so you can see which genres belong to which category.",
    "  Choose the most fitting genre for each item independently; different items in the same purchase may have different genres.",
    "  Do NOT output a category ID; only the per-item `genreId` is required.",
    "  A discount item takes the same `genreId` as the item it discounts. When it applies to the whole purchase, use the genre of the largest item.",
    "- Use null for fields that cannot be determined.",
    "- `items` is never empty; include at least one entry even if every field is null.",
  ].join("\n");

  const ariaSnapshot = truncate(input.pageContent.ariaSnapshot, ARIA_SNAPSHOT_MAX_CHARS);

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
    "## Recent stores (format: `name [count, lastUsedOn]`)",
    formatRecentPlacesForPrompt(input.places),
    "",
    "## Page accessibility snapshot",
    "```",
    ariaSnapshot,
    "```",
  ].join("\n");

  return { system, prompt };
};

/**
 * AI で支払い情報を抽出する。
 */
export const runExtractPayment = (params: {
  ai: ModelProvider;
  model: string;
  /** 推論量。受け付ける値はモデルごとに違うので、未指定ならモデルの既定に任せる */
  reasoningEffort?: ReasoningEffort;
  input: ExtractPaymentContext;
  abortSignal?: AbortSignal;
}): Promise<{ object: ExtractedPayment; usage: LanguageModelUsage; timing: ExtractTiming }> =>
  runStructuredChat({
    ai: params.ai,
    model: params.model,
    buildPrompt: () => buildPrompt(params.input),
    schemaName: "ExtractedPayment",
    schema: ExtractedPaymentSchema,
    reasoningEffort: params.reasoningEffort,
    abortSignal: params.abortSignal,
  }).then((result) => ({
    ...result,
    object: {
      ...result.object,
      placeName: resolvePlaceAlias(result.object.placeName, params.input.places),
    },
  }));

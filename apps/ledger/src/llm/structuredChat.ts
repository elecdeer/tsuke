/**
 * AI SDK で出力スキーマを強制した chat を投げ、valibot で検証した結果を返す。
 *
 * モデルは `agents/models/ai-sdk` の `createAI` が作る。Workers AI binding（Worker の外では REST API）
 * から AI Gateway のカタログのモデル（`google/...` など）を OpenAI 互換の形で呼び、
 * `response_format.json_schema` に `name` と `strict` を付けて送ってくれる。
 * `workers-ai-provider` を使わないのは、同パッケージが非推奨になり `createAI` へ移るよう案内しているため。
 */
import { toJsonSchema } from "@valibot/to-json-schema";
import {
  generateText,
  jsonSchema,
  Output,
  streamText,
  type LanguageModel,
  type LanguageModelUsage,
  type Schema,
  type UserContent,
} from "ai";
import * as v from "valibot";

/** 各処理フェーズの所要時間（ms）。ボトルネック切り分け用にハンドラ側でログする */
export type ExtractTiming = {
  /** プロンプト構築にかかった時間 */
  promptMs: number;
  /** AI の往復時間。LLM 推論 + ネットワーク + ゲートウェイに、応答の JSON の解析と検証を含む */
  aiMs: number;
};

/** 推論モデルの推論量。受け付ける値はモデルごとに違う */
export type ReasoningEffort = "low" | "medium" | "high";

/**
 * モデル ID から AI SDK のモデルを作るもの。`createAI` の戻り値がこれを満たす。
 *
 * `createAI` の戻り値の型をそのまま使わないのは、テストで偽のモデルを返すものに差し替えるため。
 */
export type ModelProvider = {
  languageModel: (
    modelId: string,
    options?: { reasoningEffort?: ReasoningEffort },
  ) => LanguageModel;
};

/**
 * プロンプトに入れる長い文字列を max 文字で切り、切ったことを書き添える。
 */
export const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`;

/** LLM に渡すプロンプト。`images` は画像の data URL で、user メッセージの本文の後に添える */
export type StructuredPrompt = { system: string; prompt: string; images?: string[] };

/**
 * user メッセージの content を作る。画像がなければ文字列のまま、あれば本文と画像の parts にする。
 */
export const buildUserContent = (prompt: string, images: string[] = []): UserContent =>
  images.length === 0
    ? prompt
    : [
        { type: "text", text: prompt },
        // 細かい種類（image/jpeg など）は AI SDK が data URL から読み取る
        ...images.map((image) => ({
          type: "file" as const,
          mediaType: "image",
          data: new URL(image),
        })),
      ];

/** 変換した出力スキーマ。同じスキーマを呼び出しのたびに JSON Schema へ変換しないよう持っておく */
const outputSchemas = new WeakMap<v.GenericSchema, Schema<unknown>>();

/**
 * valibot のスキーマを、JSON Schema と検証を持つ AI SDK のスキーマにする。
 *
 * `@valibot/to-json-schema` の `toStandardJsonSchema` を渡さないのは、valibot の Standard Schema の検証結果が
 * 失敗のときも `value` を持ち、AI SDK がそれを成功と見なして検証に通してしまうため。
 */
const toOutputSchema = <TSchema extends v.GenericSchema>(
  schema: TSchema,
): Schema<v.InferOutput<TSchema>> => {
  const cached = outputSchemas.get(schema);
  // 同じ schema から作ったものなので、出力の型は schema の型と一致する
  if (cached !== undefined) return cached as Schema<v.InferOutput<TSchema>>;
  const created = jsonSchema(toJsonSchema(schema), {
    validate: (value) => {
      const result = v.safeParse(schema, value);
      return result.success
        ? { success: true, value: result.output }
        : { success: false, error: new v.ValiError(result.issues) };
    },
  });
  outputSchemas.set(schema, created);
  return created;
};

/** 出力スキーマを強制した chat の共通の引数 */
type StructuredChatParams = {
  ai: ModelProvider;
  model: string;
  buildPrompt: () => StructuredPrompt;
  /** `response_format.json_schema.name` に入れる名前。OpenAI 互換のモデルは名前がないと受け付けない */
  schemaName: string;
  /** 未指定ならパラメータごと送らずモデルの既定に任せる */
  reasoningEffort?: ReasoningEffort;
  abortSignal?: AbortSignal;
};

/**
 * プロンプトを AI SDK の system と messages にする。
 */
const toModelInput = ({ system, prompt, images }: StructuredPrompt) => ({
  system,
  messages: [{ role: "user" as const, content: buildUserContent(prompt, images) }],
});

/**
 * 出力スキーマを強制して chat を投げ、スキーマで検証した結果を返す。
 */
export const runStructuredChat = async <TSchema extends v.GenericSchema>(
  params: StructuredChatParams & { schema: TSchema },
): Promise<{
  object: v.InferOutput<TSchema>;
  usage: LanguageModelUsage;
  timing: ExtractTiming;
}> => {
  const tStart = performance.now();
  const input = toModelInput(params.buildPrompt());
  const tAfterPrompt = performance.now();

  const { output, usage } = await generateText({
    model: params.ai.languageModel(params.model, { reasoningEffort: params.reasoningEffort }),
    ...input,
    output: Output.object({ schema: toOutputSchema(params.schema), name: params.schemaName }),
    abortSignal: params.abortSignal,
  });
  const tAfterAi = performance.now();

  return {
    object: output,
    usage,
    timing: {
      promptMs: Math.round(tAfterPrompt - tStart),
      aiMs: Math.round(tAfterAi - tAfterPrompt),
    },
  };
};

/**
 * 出力スキーマを強制して chat を Stream で投げ、配列の要素が届くたびに検証して渡す。
 *
 * 出力は `{"elements":[...]}` の形になる（AI SDK の `Output.array` が包む）。
 * 形式に合わない要素は飛ばすので、渡されなかった要素は呼び出し側で未処理として扱う。
 * Stream で応答しないモデルなら、全体が届いてから順に渡す。
 */
export const streamStructuredItems = async <TSchema extends v.GenericSchema>(
  params: StructuredChatParams & {
    itemSchema: TSchema;
    onItem: (item: v.InferOutput<TSchema>) => void;
  },
): Promise<void> => {
  // streamText は失敗を投げずに onError へ渡すので、受け取って最後に投げ直す
  let streamError: unknown = undefined;
  const result = streamText({
    model: params.ai.languageModel(params.model, { reasoningEffort: params.reasoningEffort }),
    ...toModelInput(params.buildPrompt()),
    output: Output.array({
      element: toOutputSchema(params.itemSchema),
      name: params.schemaName,
    }),
    abortSignal: params.abortSignal,
    onError: ({ error }) => {
      streamError = error;
    },
  });
  for await (const item of result.elementStream) params.onItem(item);
  if (streamError !== undefined) throw streamError;
};

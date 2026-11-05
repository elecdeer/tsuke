/**
 * Workers AI に JSON Schema を強制した chat を投げ、valibot で検証した結果を返す。
 *
 * Cloudflare Workers AI binding (`env.AI.run`) を直接叩く。`workers-ai-provider` を
 * 経由しないのは、同プロバイダが OpenAI 互換モデル（例: `openai/gpt-5.4-mini`）に対して
 * `response_format.json_schema.name` を埋めず OpenAI 側で `Missing required parameter`
 * エラーになるためで、ここでは valibot スキーマを `@valibot/to-json-schema` で
 * JSON Schema に変換したものを受け取り、`json_schema.name`/`strict` を明示して送る。
 */
import * as v from "valibot";

/** 各処理フェーズの所要時間（ms）。ボトルネック切り分け用にハンドラ側でログする */
export type ExtractTiming = {
  /** プロンプト構築にかかった時間 */
  promptMs: number;
  /** `env.AI.run` の往復時間。LLM 推論 + ネットワーク + ゲートウェイの合計 */
  aiMs: number;
  /** レスポンスから JSON を抜き出して JSON.parse する時間 */
  parseMs: number;
  /** 抽出結果を valibot で v.parse する時間 */
  validateMs: number;
};

/** Workers AI の binding のうち、ここで使う部分 */
export type AiRunner = {
  run: (
    model: string,
    inputs: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>;
};

/**
 * プロンプトに入れる長い文字列を max 文字で切り、切ったことを書き添える。
 */
export const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`;

type WorkersAiChatResponse = {
  response?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: unknown;
};

/**
 * Workers AI の chat 系レスポンスから assistant メッセージ本体を取り出す。
 */
const extractAssistantPayload = (output: WorkersAiChatResponse): unknown => {
  const choiceContent = output.choices?.[0]?.message?.content;
  if (choiceContent != null && choiceContent !== "") {
    if (typeof choiceContent === "string") {
      return JSON.parse(choiceContent);
    }
    return choiceContent;
  }
  if ("response" in output) {
    const response = output.response;
    if (typeof response === "string") return JSON.parse(response);
    if (response !== null && response !== undefined) return response;
  }
  throw new Error(`Workers AI returned no usable content: ${JSON.stringify(output)}`);
};

/** LLM に渡すプロンプト。`images` は画像の data URL で、user メッセージの本文の後に添える */
export type StructuredPrompt = { system: string; prompt: string; images?: string[] };

/**
 * user メッセージの content を作る。画像がなければ文字列のまま、あれば OpenAI 互換の content parts にする。
 */
export const buildUserContent = (
  prompt: string,
  images: string[] = [],
): string | Array<Record<string, unknown>> =>
  images.length === 0
    ? prompt
    : [
        { type: "text", text: prompt },
        ...images.map((url) => ({ type: "image_url", image_url: { url } })),
      ];

/**
 * 出力スキーマを強制して chat を投げ、スキーマで検証した結果を返す。
 */
export const runStructuredChat = async <TSchema extends v.GenericSchema>(params: {
  ai: AiRunner;
  model: string;
  buildPrompt: () => StructuredPrompt;
  schemaName: string;
  /** `schema` を `toJsonSchema` で変換したもの。呼び出しごとに変換しないよう呼び出し側で持つ */
  jsonSchema: unknown;
  schema: TSchema;
  /** 推論モデルの推論量。受け付ける値はモデルごとに違うので、未指定ならパラメータごと送らずモデルの既定に任せる */
  reasoningEffort?: string;
  abortSignal?: AbortSignal;
}): Promise<{ object: v.InferOutput<TSchema>; usage: unknown; timing: ExtractTiming }> => {
  const tStart = performance.now();
  const { system, prompt, images } = params.buildPrompt();
  const tAfterPrompt = performance.now();

  const inputs: Record<string, unknown> = {
    messages: [
      { role: "system", content: system },
      { role: "user", content: buildUserContent(prompt, images) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: params.schemaName,
        strict: true,
        schema: params.jsonSchema,
      },
    },
    ...(params.reasoningEffort === undefined ? {} : { reasoning_effort: params.reasoningEffort }),
  };
  // chat 系モデルは choices か response を持つオブジェクトを返す（取り出しは extractAssistantPayload が確かめる）
  const output = (await params.ai.run(params.model, inputs, {
    signal: params.abortSignal,
  })) as WorkersAiChatResponse;
  const tAfterAi = performance.now();

  const payload = extractAssistantPayload(output);
  const tAfterParse = performance.now();

  const object = v.parse(params.schema, payload);
  const tAfterValidate = performance.now();

  return {
    object,
    usage: output.usage,
    timing: {
      promptMs: Math.round(tAfterPrompt - tStart),
      aiMs: Math.round(tAfterAi - tAfterPrompt),
      parseMs: Math.round(tAfterParse - tAfterAi),
      validateMs: Math.round(tAfterValidate - tAfterParse),
    },
  };
};

/**
 * `{"entries":[{...},{...}]}` の形の JSON を少しずつ読み、配列の要素が閉じるたびにその文字列を渡す関数を作る。
 *
 * LLM の応答はトークンごとに届き、要素の途中で切れるので、文字列の中かどうかと括弧の深さを追う。
 */
export const createArrayItemScanner = (onItem: (itemText: string) => void) => {
  /** 最上位のオブジェクトと配列の中、つまり要素が始まる深さ */
  const ITEM_DEPTH = 2;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let item = "";
  return (text: string): void => {
    for (const char of text) {
      if (depth > ITEM_DEPTH) item += char;
      else if (depth === ITEM_DEPTH && char === "{") item = char;

      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') {
        inString = true;
      } else if (char === "{" || char === "[") {
        depth += 1;
      } else if (char === "}" || char === "]") {
        depth -= 1;
        if (depth === ITEM_DEPTH && char === "}") onItem(item);
      }
    }
  };
};

/** Stream の 1 つの出来事。OpenAI 互換のモデルは delta で、他の Workers AI のモデルは response で本文を返す */
const StreamChunkSchema = v.looseObject({
  choices: v.optional(
    v.array(
      v.looseObject({ delta: v.optional(v.looseObject({ content: v.nullish(v.string()) })) }),
    ),
  ),
  response: v.nullish(v.string()),
});

/**
 * Server-Sent Events の本文を読み、届いた本文の文字列を順に渡す。読めない行は飛ばす。
 */
const readStreamContent = async (
  body: ReadableStream<Uint8Array>,
  onContent: (content: string) => void,
): Promise<void> => {
  const decoder = new TextDecoder();
  let buffer = "";
  /**
   * SSE の 1 行から本文を取り出して渡す。
   */
  const readLine = (line: string): void => {
    if (!line.startsWith("data:")) return;
    const data = line.slice("data:".length).trim();
    if (data === "" || data === "[DONE]") return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const chunk = v.safeParse(StreamChunkSchema, json);
    if (!chunk.success) return;
    const content = chunk.output.choices?.[0]?.delta?.content ?? chunk.output.response;
    if (content != null) onContent(content);
  };
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(readLine);
    }
    readLine(buffer);
  } finally {
    reader.releaseLock();
  }
};

/**
 * 出力スキーマを強制して chat を Stream で投げ、配列の要素が届くたびに検証して渡す。
 *
 * 形式に合わない要素は飛ばすので、渡されなかった要素は呼び出し側で未処理として扱う。
 * Stream で応答しないモデルなら、全体が届いてから順に渡す。
 */
export const streamStructuredItems = async <TSchema extends v.GenericSchema>(params: {
  ai: AiRunner;
  model: string;
  buildPrompt: () => StructuredPrompt;
  schemaName: string;
  jsonSchema: unknown;
  itemSchema: TSchema;
  abortSignal?: AbortSignal;
  onItem: (item: v.InferOutput<TSchema>) => void;
}): Promise<void> => {
  const { system, prompt, images } = params.buildPrompt();
  const scan = createArrayItemScanner((itemText) => {
    const item = v.safeParse(params.itemSchema, JSON.parse(itemText));
    if (item.success) params.onItem(item.output);
  });
  const output = await params.ai.run(
    params.model,
    {
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: buildUserContent(prompt, images) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: params.schemaName, strict: true, schema: params.jsonSchema },
      },
    },
    { signal: params.abortSignal },
  );
  if (output instanceof ReadableStream) {
    await readStreamContent(output, scan);
    return;
  }
  // chat 系モデルは choices か response を持つオブジェクトを返す（取り出しは extractAssistantPayload が確かめる）
  scan(JSON.stringify(extractAssistantPayload(output as WorkersAiChatResponse)));
};

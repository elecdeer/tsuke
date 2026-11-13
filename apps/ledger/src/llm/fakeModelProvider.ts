/**
 * テストで AI の代わりに使う、決まった本文を返す ModelProvider。
 */
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import type { ModelProvider, ReasoningEffort } from "./structuredChat.ts";

/** AI SDK がモデルに渡す呼び出しの引数 */
type CallOptions = Parameters<MockLanguageModelV4["doGenerate"]>[0];

/** モデルが Stream で返す 1 つの出来事 */
type StreamPart =
  Awaited<ReturnType<MockLanguageModelV4["doStream"]>>["stream"] extends ReadableStream<infer T>
    ? T
    : never;

/** 偽のモデルが受けた 1 回の呼び出し */
export type FakeModelCall = {
  modelId: string;
  /** 一度に応答させたか（generate）、Stream で応答させたか（stream） */
  method: "generate" | "stream";
  reasoningEffort: ReasoningEffort | undefined;
  /** `response_format.json_schema.name` に入る名前。出力スキーマがなければ undefined */
  schemaName: string | undefined;
  options: CallOptions;
};

/**
 * 応答の本文。文字列の配列か `ReadableStream` なら、Stream ではその塊を順に流す。
 * `ReadableStream` を返すと、届く時機や途中の失敗をテストから操れる
 */
type FakeResponse = string | string[] | ReadableStream<string>;

/** 応答の本文を返す関数。投げるとモデルの呼び出しが失敗する */
type Respond = (call: FakeModelCall) => FakeResponse | Promise<FakeResponse>;

const USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const FINISH_REASON = { unified: "stop" as const, raw: "stop" };

/**
 * 応答の本文を、本文の塊の Stream にする。
 */
const toTextStream = (response: FakeResponse): ReadableStream<string> =>
  response instanceof ReadableStream ? response : convertArrayToReadableStream([response].flat());

/**
 * 応答の本文を最後まで読み、1 つの文字列にする。
 */
const readAll = async (response: FakeResponse): Promise<string> => {
  let text = "";
  for await (const chunk of toTextStream(response)) text += chunk;
  return text;
};

/**
 * 呼び出しごとに respond の返す本文で応答する偽の ModelProvider と、受けた呼び出しの記録を作る。
 */
export const createFakeModelProvider = (
  respond: Respond,
): { ai: ModelProvider; calls: FakeModelCall[] } => {
  const calls: FakeModelCall[] = [];
  /**
   * 呼び出しを記録して応答の本文を返す。
   */
  const record = (
    call: Omit<FakeModelCall, "schemaName">,
  ): FakeResponse | Promise<FakeResponse> => {
    const format = call.options.responseFormat;
    const recorded = { ...call, schemaName: format?.type === "json" ? format.name : undefined };
    calls.push(recorded);
    return respond(recorded);
  };
  const ai: ModelProvider = {
    languageModel: (modelId, settings) => {
      const reasoningEffort = settings?.reasoningEffort;
      return new MockLanguageModelV4({
        modelId,
        doGenerate: async (options) => ({
          content: [
            {
              type: "text",
              text: await readAll(
                await record({ modelId, method: "generate", reasoningEffort, options }),
              ),
            },
          ],
          finishReason: FINISH_REASON,
          usage: USAGE,
          warnings: [],
        }),
        doStream: async (options) => {
          const response = await record({ modelId, method: "stream", reasoningEffort, options });
          return {
            stream: toTextStream(response).pipeThrough(
              new TransformStream<string, StreamPart>({
                start: (controller) => {
                  controller.enqueue({ type: "stream-start", warnings: [] });
                  controller.enqueue({ type: "text-start", id: "text" });
                },
                transform: (delta, controller) => {
                  controller.enqueue({ type: "text-delta", id: "text", delta });
                },
                flush: (controller) => {
                  controller.enqueue({ type: "text-end", id: "text" });
                  controller.enqueue({ type: "finish", finishReason: FINISH_REASON, usage: USAGE });
                },
              }),
            ),
          };
        },
      });
    },
  };
  return { ai, calls };
};

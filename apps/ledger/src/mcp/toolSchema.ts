import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { toJsonSchema } from "@valibot/to-json-schema";
import type * as v from "valibot";

/** JSON Schema の出力先として @valibot/to-json-schema が受け付けるもの */
type SupportedTarget = "draft-07" | "draft-2020-12" | "openapi-3.0";

/**
 * MCP SDK が指定した JSON Schema の出力先を、@valibot/to-json-schema の型に絞る。
 */
const toSupportedTarget = (target: string): SupportedTarget => {
  switch (target) {
    case "draft-07":
    case "draft-2020-12":
    case "openapi-3.0":
      return target;
    default:
      throw new Error(`Unsupported target: ${target}`);
  }
};

/**
 * valibot のスキーマを、MCP の tool の inputSchema に渡せる形（Standard Schema + Standard JSON Schema）にする。
 *
 * `toStandardJsonSchema` を使わないのは、v.trim や v.safeInteger のような JSON Schema にできないアクションがあると
 * 例外を投げ、tools/list が失敗するため。ここでは変換できないアクションを無視し、検証は valibot 自身に任せる。
 * 入力として受け付ける形を伝えたいので、変換の後の型ではなく入力の型（typeMode: "input"）で書き出す。
 */
export const toolSchema = <TSchema extends v.GenericSchema>(
  schema: TSchema,
): StandardSchemaWithJSON<v.InferInput<TSchema>, v.InferOutput<TSchema>> => ({
  "~standard": {
    ...schema["~standard"],
    jsonSchema: {
      input: (options) => ({
        ...toJsonSchema(schema, {
          typeMode: "input",
          errorMode: "ignore",
          target: toSupportedTarget(options.target),
        }),
      }),
      output: (options) => ({
        ...toJsonSchema(schema, {
          typeMode: "output",
          errorMode: "ignore",
          target: toSupportedTarget(options.target),
        }),
      }),
    },
  },
});

import * as v from "valibot";
import { defineHandler } from "void";
import { db } from "void/db";
import {
  listAccounts,
  listCategories,
  listPlacesForExtraction,
} from "../../../src/ledger/masters.ts";
import { PageContentSchema, runExtractPayment } from "../../../src/llm/extractPayment.ts";
import { READ_SETTINGS, ReadQualitySchema } from "../../../src/llm/readQuality.ts";

const ExtractBodySchema = v.object({
  pageContent: PageContentSchema,
  quality: v.optional(ReadQualitySchema, "fast"),
});

/**
 * ページの内容から支出の入力値を推論する。候補の口座・カテゴリ・店舗は台帳から読む。
 */
export const POST = defineHandler.withValidator({ body: ExtractBodySchema })(async (
  c,
  { body },
) => {
  const [categories, accounts, places] = await Promise.all([
    listCategories(db, "payment"),
    listAccounts(db),
    listPlacesForExtraction(db),
  ]);
  const { model, reasoningEffort } = READ_SETTINGS[body.quality];
  try {
    const { object, usage, timing } = await runExtractPayment({
      ai: c.env.AI,
      model,
      reasoningEffort,
      input: { pageContent: body.pageContent, categories, accounts, places },
    });
    console.info("LLM extract-payment completed", {
      model,
      quality: body.quality,
      usage,
      confidence: object.confidence,
      ...timing,
    });
    return object;
  } catch (error) {
    console.error("LLM extract-payment failed", {
      quality: body.quality,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "ページから支払い情報を読み取れませんでした" }, 502);
  }
});

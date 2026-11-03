import * as v from "valibot";
import { defineHandler } from "void";
import { db } from "void/db";
import { env } from "void/env";
import { todayInTokyo } from "../../../src/ledger/dates.ts";
import {
  listAccounts,
  listCategories,
  listPlacesForExtraction,
} from "../../../src/ledger/masters.ts";
import { ReceiptImageSchema, runExtractReceipt } from "../../../src/llm/extractReceipt.ts";

const ExtractBodySchema = v.object({ image: ReceiptImageSchema });

/**
 * レシートの写真から支出の入力値を推論する。画像は AI に渡すだけで保存しない。
 *
 * ページのアクションは値を返せない（loader を走らせ直すかリダイレクトするだけ）ので、
 * 読み取った結果を画面に返すために API にしている。
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
  try {
    const { object, usage, timing } = await runExtractReceipt({
      ai: c.env.AI,
      model: env.LLM_MODEL,
      input: { image: body.image, today: todayInTokyo(), categories, accounts, places },
    });
    console.info("LLM extract-receipt completed", {
      model: env.LLM_MODEL,
      usage,
      confidence: object.confidence,
      ...timing,
    });
    return object;
  } catch (error) {
    console.error("LLM extract-receipt failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "レシートを読み取れませんでした" }, 502);
  }
});

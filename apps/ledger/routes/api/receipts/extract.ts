import * as v from "valibot";
import { defineHandler } from "void";
import { db } from "void/db";
import { todayInTokyo } from "../../../src/ledger/dates.ts";
import {
  listAccountsWithHint,
  listCategories,
  listPlacesForExtraction,
} from "../../../src/ledger/masters.ts";
import { ReceiptImageSchema, runExtractReceipt } from "../../../src/llm/extractReceipt.ts";
import { READ_SETTINGS, ReadQualitySchema } from "../../../src/llm/readQuality.ts";

const ExtractBodySchema = v.object({
  image: ReceiptImageSchema,
  quality: v.optional(ReadQualitySchema, "fast"),
});

/**
 * レシートの写真から支出の入力値を推論する。ここでは画像を AI に渡すだけで、保存は登録のとき
 * （`POST /api/transactions`）に行う。登録しなかった写真をサーバーに残さないため。
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
    listAccountsWithHint(db),
    listPlacesForExtraction(db),
  ]);
  try {
    const { object, usage, timing } = await runExtractReceipt({
      ai: c.env.AI,
      quality: body.quality,
      input: { image: body.image, today: todayInTokyo(), categories, accounts, places },
    });
    console.info("LLM extract-receipt completed", {
      model: READ_SETTINGS[body.quality].model,
      quality: body.quality,
      usage,
      confidence: object.confidence,
      ...timing,
    });
    // 登録のときに推測の記録へ残せるよう、読み取ったモデルも返す
    return { ...object, model: READ_SETTINGS[body.quality].model };
  } catch (error) {
    console.error("LLM extract-receipt failed", {
      quality: body.quality,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "レシートを読み取れませんでした" }, 502);
  }
});

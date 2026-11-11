import * as v from "valibot";
import { defineHandler } from "void";
import { db } from "void/db";
import {
  listAccountsWithHint,
  listCategories,
  listPlacesForExtraction,
} from "../../../src/ledger/masters.ts";
import { PageContentSchema } from "../../../src/llm/extractPayment.ts";
import { runExtractStatement } from "../../../src/llm/extractStatement.ts";
import { READ_SETTINGS } from "../../../src/llm/readQuality.ts";

const ExtractBodySchema = v.object({ pageContent: PageContentSchema });

/**
 * カード明細などのページから利用行の一覧を読み取る。候補の口座・カテゴリ・店舗は台帳から読む。
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
  const { model, reasoningEffort } = READ_SETTINGS.fast;
  try {
    const { object, usage, timing } = await runExtractStatement({
      ai: c.env.AI,
      model,
      reasoningEffort,
      input: { pageContent: body.pageContent, categories, accounts, places },
    });
    console.info("LLM extract-statement completed", {
      model,
      usage,
      confidence: object.confidence,
      rowCount: object.rows.length,
      ...timing,
    });
    // 登録のときに推測の記録へ残せるよう、読み取ったモデルも返す
    return { ...object, model };
  } catch (error) {
    console.error("LLM extract-statement failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ error: "ページから明細を読み取れませんでした" }, 502);
  }
});

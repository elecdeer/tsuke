import * as v from "valibot";
import { defineHandler } from "void";
import { db } from "void/db";
import { storage } from "void/storage";
import { readReceiptImage } from "../../../../src/ledger/receiptImages.ts";

const ParamsSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.safeInteger()),
});

/**
 * 取引に結びついたレシートの写真を返す。
 *
 * カード番号の下 4 桁や購入内容が写っているので、R2 を公開せず、Access のミドルウェアの後ろのここからだけ読ませる。
 * キーを URL で受けると保存先の別のものを読まれかねないので、取引の ID から DB でキーを引く。
 */
export const GET = defineHandler.withValidator({ params: ParamsSchema })(async (c, { params }) => {
  const response = await readReceiptImage(db, storage, params.id);
  return response ?? c.notFound();
});

import { defineHandler } from "void";
import { db } from "void/db";
import { storage } from "void/storage";
import { registerPayment, RegisterPaymentSchema } from "../../../src/ledger/receiptImages.ts";

/**
 * 支出を登録する。レシートの写真が付いていれば、取引に結びつけて保存する。
 *
 * 作成でも 200 を返す（Void では c.status(201) を指定しても値を返すと 200 になり、
 * c.json(x, 201) にするとレスポンスの型が推論されなくなるため）。
 */
export const POST = defineHandler.withValidator({ body: RegisterPaymentSchema })(async (
  c,
  { body },
) => {
  const result = await registerPayment(db, storage, body);
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return { id: result.id };
});

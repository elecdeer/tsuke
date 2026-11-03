/**
 * レシートの写真の保存（R2）と、取引との結びつけ。
 *
 * 写真は支出の登録と一緒に保存する。読み取りの時点で保存すると、捨てたレシートの写真を消す仕組みが要るため。
 * 写真は取引がある限り残し、取引を消すときに一緒に消す。
 */
import { eq } from "drizzle-orm";
import * as v from "valibot";
import { transactions } from "../../db/schema.ts";
import type { LedgerDb } from "../db.ts";
import { ReceiptImageSchema } from "../llm/extractReceipt.ts";
import { createPayment, PaymentInputSchema } from "./payments.ts";

/** 使う R2 の操作だけに絞った型。テストでは Map で置き換える */
export type ReceiptImageBucket = {
  put: (
    key: string,
    value: Uint8Array,
    options: { httpMetadata: { contentType: string } },
  ) => Promise<unknown>;
  get: (key: string) => Promise<{
    body: ReadableStream;
    httpEtag: string;
    writeHttpMetadata: (headers: Headers) => void;
  } | null>;
  delete: (key: string) => Promise<unknown>;
};

/** 支出の登録の入力。レシートの写真から登録するときだけ写真（data URL）が付く */
export const RegisterPaymentSchema = v.object({
  ...PaymentInputSchema.entries,
  receiptImage: v.optional(ReceiptImageSchema),
});

export type RegisterPaymentInput = v.InferOutput<typeof RegisterPaymentSchema>;

/**
 * `ReceiptImageSchema` を通った data URL を、保存する形に戻す。
 */
export const decodeReceiptImage = (
  image: string,
): { bytes: Uint8Array; contentType: string; extension: string } => {
  const contentType = image.slice("data:".length, image.indexOf(";"));
  const base64 = image.slice(image.indexOf(",") + 1);
  return {
    bytes: Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
    contentType,
    extension: contentType.slice("image/".length),
  };
};

/**
 * レシートの写真を消す。
 *
 * 取引の処理は終わっているので、消せなくても失敗にはしない。残った写真を後から探せるようキーをログに出す。
 */
export const removeReceiptImage = async (
  bucket: Pick<ReceiptImageBucket, "delete">,
  key: string,
): Promise<void> => {
  try {
    await bucket.delete(key);
  } catch (error) {
    console.error("receipt image delete failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * 支出を登録し、写真が付いていれば取引に結びつけて保存する。
 *
 * 取引が存在しない写真を指さないよう、先に写真を保存する。登録に失敗したら写真を消す。
 * 写真を保存できなければ登録もしない。写真は端末のキューに残っているので、登録し直せる。
 */
export const registerPayment = async (
  db: LedgerDb,
  bucket: Pick<ReceiptImageBucket, "put" | "delete">,
  { receiptImage, ...payment }: RegisterPaymentInput,
): Promise<{ ok: true; id: number } | { ok: false; status: 400 | 502; error: string }> => {
  if (receiptImage === undefined) {
    const result = await createPayment(db, payment);
    return result.ok ? result : { ...result, status: 400 };
  }

  const { bytes, contentType, extension } = decodeReceiptImage(receiptImage);
  const key = `receipts/${crypto.randomUUID()}.${extension}`;
  try {
    await bucket.put(key, bytes, { httpMetadata: { contentType } });
  } catch (error) {
    console.error("receipt image put failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, status: 502, error: "レシートの写真を保存できませんでした" };
  }

  try {
    const result = await createPayment(db, payment, key);
    if (result.ok) return result;
    await removeReceiptImage(bucket, key);
    return { ...result, status: 400 };
  } catch (error) {
    await removeReceiptImage(bucket, key);
    throw error;
  }
};

/**
 * 取引に結びついた写真のレスポンスを作る。写真がなければ null を返す。
 *
 * 保存するのは検証した JPEG・PNG・WebP だけで、ページとして動く内容にはならないので、別のタブで開いて
 * 大きく見られるよう attachment にはしない。ブラウザに残すと取引を消した後や Access からログアウトした後も
 * サーバーを通らずに見えてしまうので、`private` ではなく `no-store` にする。
 */
export const readReceiptImage = async (
  db: LedgerDb,
  bucket: Pick<ReceiptImageBucket, "get">,
  transactionId: number,
): Promise<Response | null> => {
  const [transaction] = await db
    .select({ receiptImageKey: transactions.receiptImageKey })
    .from(transactions)
    .where(eq(transactions.id, transactionId));
  const key = transaction?.receiptImageKey ?? null;
  if (key === null) return null;
  const object = await bucket.get(key);
  if (object === null) return null;

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
};

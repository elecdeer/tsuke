import type { DatabaseSync } from "node:sqlite";
import * as v from "valibot";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createTestLedgerDb, insert } from "../../db/testing.ts";
import type { LedgerDb } from "../db.ts";
import {
  decodeReceiptImage,
  readReceiptImage,
  registerPayment,
  RegisterPaymentSchema,
  removeReceiptImage,
  type ReceiptImageBucket,
  type RegisterPaymentInput,
} from "./receiptImages.ts";

/** "abc" の JPEG という体の data URL。中身は読まないので画像でなくてよい */
const IMAGE = `data:image/jpeg;base64,${btoa("abc")}`;

/** Map に写真を溜める R2 の代わり */
const createBucket = () => {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const bucket: ReceiptImageBucket = {
    put: async (key, bytes, { httpMetadata: { contentType } }) => {
      objects.set(key, { bytes, contentType });
    },
    get: async (key) => {
      const object = objects.get(key);
      if (object === undefined) return null;
      return {
        body: new Blob([new Uint8Array(object.bytes)]).stream(),
        httpEtag: `"${key}"`,
        writeHttpMetadata: (headers) => headers.set("Content-Type", object.contentType),
      };
    },
    delete: async (key) => {
      objects.delete(key);
    },
  };
  return { objects, bucket };
};

let db: LedgerDb;
let sqlite: DatabaseSync;
let groceryId: number;

beforeEach(() => {
  ({ db, sqlite } = createTestLedgerDb());
  const foodId = insert(sqlite, "INSERT INTO categories (mode, name) VALUES ('payment', '食費')");
  groceryId = insert(sqlite, "INSERT INTO genres (category_id, name) VALUES (?, '食料品')", foodId);
});

const payment = (overrides: Partial<RegisterPaymentInput> = {}): RegisterPaymentInput => ({
  date: "2026-10-27",
  fromAccountId: null,
  placeName: null,
  items: [{ genreId: groceryId, name: "牛乳", memo: null, amount: 200 }],
  ...overrides,
});

/** 取引に保存された写真のキーを返す */
const storedKey = (id: number): unknown =>
  sqlite.prepare("SELECT receipt_image_key AS k FROM transactions WHERE id = ?").get(id)?.["k"];

const transactionCount = (): unknown =>
  sqlite.prepare("SELECT count(*) AS n FROM transactions").get()?.["n"];

describe("RegisterPaymentSchema", () => {
  test("写真のない登録（拡張機能）も通す", () => {
    expect(v.safeParse(RegisterPaymentSchema, payment()).success).toBe(true);
  });

  test("画像でない data URL は通さない", () => {
    const body = payment({ receiptImage: "data:text/html;base64,PGh0bWw+" });

    expect(v.safeParse(RegisterPaymentSchema, body).success).toBe(false);
  });
});

describe("decodeReceiptImage", () => {
  test("data URL を中身と種類に戻す", () => {
    const { bytes, contentType, extension } = decodeReceiptImage(
      `data:image/webp;base64,${btoa("abc")}`,
    );

    expect(new TextDecoder().decode(bytes)).toBe("abc");
    expect(contentType).toBe("image/webp");
    expect(extension).toBe("webp");
  });
});

describe("registerPayment", () => {
  test("写真を保存し、そのキーを取引に結びつける", async () => {
    const { objects, bucket } = createBucket();

    const result = await registerPayment(db, bucket, payment({ receiptImage: IMAGE }));

    expect(result).toEqual({ ok: true, id: 1 });
    const [[key, object] = []] = [...objects];
    expect(key).toMatch(/^receipts\/[0-9a-f-]{36}\.jpeg$/);
    expect(storedKey(1)).toBe(key);
    expect(object?.contentType).toBe("image/jpeg");
    expect(new TextDecoder().decode(object?.bytes)).toBe("abc");
  });

  test("写真がなければ何も保存しない", async () => {
    const { objects, bucket } = createBucket();

    expect(await registerPayment(db, bucket, payment())).toEqual({ ok: true, id: 1 });
    expect(objects.size).toBe(0);
    expect(storedKey(1)).toBeNull();
  });

  test("登録の入力が誤っていたら 400 を返し、写真を残さない", async () => {
    const { objects, bucket } = createBucket();

    const result = await registerPayment(
      db,
      bucket,
      payment({
        receiptImage: IMAGE,
        items: [{ genreId: groceryId + 1, name: null, memo: null, amount: 1 }],
      }),
    );

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(objects.size).toBe(0);
  });

  test("DB への書き込みで例外が起きても写真を残さない", async () => {
    const { objects, bucket } = createBucket();
    sqlite.exec("DROP TABLE transaction_items");

    await expect(registerPayment(db, bucket, payment({ receiptImage: IMAGE }))).rejects.toThrow();
    expect(objects.size).toBe(0);
  });

  test("写真を保存できなければ登録せず 502 を返す", async () => {
    const { bucket } = createBucket();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await registerPayment(
      db,
      { ...bucket, put: () => Promise.reject(new Error("r2 down")) },
      payment({ receiptImage: IMAGE }),
    );

    expect(result).toEqual({
      ok: false,
      status: 502,
      error: "レシートの写真を保存できませんでした",
    });
    expect(transactionCount()).toBe(0);
  });
});

describe("readReceiptImage", () => {
  test("取引の写真を、ブラウザにも残らないレスポンスで返す", async () => {
    const { bucket } = createBucket();
    await registerPayment(db, bucket, payment({ receiptImage: IMAGE }));

    const response = await readReceiptImage(db, bucket, 1);

    expect(await response?.text()).toBe("abc");
    expect(response?.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(response?.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("写真のない取引・ない取引・R2 から消えた写真には null を返す", async () => {
    const { objects, bucket } = createBucket();
    await registerPayment(db, bucket, payment());
    await registerPayment(db, bucket, payment({ receiptImage: IMAGE }));
    objects.clear();

    expect(await readReceiptImage(db, bucket, 1)).toBeNull();
    expect(await readReceiptImage(db, bucket, 2)).toBeNull();
    expect(await readReceiptImage(db, bucket, 99)).toBeNull();
  });
});

describe("removeReceiptImage", () => {
  test("写真を消す", async () => {
    const { objects, bucket } = createBucket();
    await registerPayment(db, bucket, payment({ receiptImage: IMAGE }));
    const [key = ""] = objects.keys();

    await removeReceiptImage(bucket, key);

    expect(objects.size).toBe(0);
  });

  test("消せなくても例外にせず、キーをログに出す", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await removeReceiptImage({ delete: () => Promise.reject(new Error("r2 down")) }, "receipts/a");

    expect(error).toHaveBeenCalledWith(
      "receipt image delete failed",
      expect.objectContaining({ key: "receipts/a" }),
    );
  });
});

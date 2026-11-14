import type { MiddlewareHandler } from "hono";

/** ログに書く例外の中身。cause をたどって原因の例外も入れる */
export type ErrorFields = {
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorFields | typeof CAUSE_OMITTED;
};

/** cause をたどる深さの上限。cause が自分を指すような例外でも止まるようにする */
const MAX_CAUSE_DEPTH = 5;

/** 深さの上限を超えた cause の代わりに書く値 */
export const CAUSE_OMITTED = "(cause omitted: too deep)";

/**
 * 例外をログに書ける形にする。
 *
 * Error をそのまま console.error に渡すと、Workers Logs ではメッセージの行が落ちてスタックだけが残ることがある
 * （D1 の失敗で、何のエラーか分からなくなった）。名前・メッセージ・スタックを別の項目に分けて書く。
 * D1 は元の SQLite のエラーを cause に入れるので、cause もたどる。
 */
export const describeError = (error: unknown, depth = 0): ErrorFields => {
  if (!(error instanceof Error)) return { name: typeof error, message: String(error) };
  const fields: ErrorFields = { name: error.name, message: error.message };
  if (error.stack !== undefined) fields.stack = error.stack;
  if (error.cause !== undefined) {
    fields.cause =
      depth + 1 >= MAX_CAUSE_DEPTH ? CAUSE_OMITTED : describeError(error.cause, depth + 1);
  }
  return fields;
};

/**
 * ハンドラやミドルウェアで捕まえられなかった例外を、リクエストの情報と一緒にログに書く。
 *
 * Hono は例外を onError に渡したあと c.error に残すので、next() の後で読む。レスポンスは Void の onError が
 * 作ったものをそのまま返す。リクエストの本文は個人の情報やレシートの写真を含むので書かない。
 */
export const logUnhandledErrors: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.error === undefined) return;
  console.error("Unhandled error", {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    error: describeError(c.error),
  });
};

/**
 * ページのアクションが返したエラーから、画面に出す文言を取り出す。
 *
 * アクションは失敗の理由を `{ error: string }` で返すので、それがあれば使う。
 * なければ（入力の検証の失敗など）エラーの message を使う。
 */
export const actionErrorMessage = (error: { body: unknown; message: string }): string => {
  const { body } = error;
  if (typeof body === "object" && body !== null && "error" in body) {
    const message: unknown = body.error;
    if (typeof message === "string") return message;
  }
  return error.message || "保存できませんでした";
};

/** ページのアクションの結果。失敗したときの error は Void のアクションのエラーの形 */
export type ActionResult = { ok: true } | { ok: false; error: { body: unknown; message: string } };

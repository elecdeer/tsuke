import { defineMiddleware } from "void";
import { isAllowedWriteRequest } from "../src/corsOrigin.ts";

/**
 * 別サイトからの書き込みを拒否する。
 *
 * Access の Cookie は SameSite=None で別サイトからのリクエストにも付くので、認証だけでは防げない。
 * Void のデプロイ時の準備確認（/__void/*）は 02.access.ts と同じく対象にしない。
 */
export default defineMiddleware(async (c, next) => {
  const allowed =
    c.req.path.startsWith("/__void/") ||
    isAllowedWriteRequest({
      method: c.req.method,
      url: c.req.url,
      origin: c.req.header("Origin"),
    });
  if (!allowed) {
    console.warn("Cross-origin write rejected", { path: c.req.path, method: c.req.method });
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

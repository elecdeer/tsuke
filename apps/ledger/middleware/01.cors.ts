import { cors } from "hono/cors";
import { defineMiddleware } from "void";
import { isAllowedCorsOrigin } from "../src/corsOrigin.ts";

/**
 * 拡張機能（chrome-extension://）とローカル開発からのクロスオリジンリクエストを許可する。
 * 拡張機能は Access のセッション Cookie を送るので credentials を許可する。
 */
export default defineMiddleware(
  cors({
    origin: (origin) => (isAllowedCorsOrigin(origin) ? origin : null),
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

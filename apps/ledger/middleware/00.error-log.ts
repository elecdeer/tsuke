import { defineMiddleware } from "void";
import { logUnhandledErrors } from "../src/errorLog.ts";

/**
 * 捕まえられなかった例外を、メッセージと原因が読める形でログに書く。
 *
 * 後ろのミドルウェアで起きた例外も拾えるよう、最初に置く。
 */
export default defineMiddleware(logUnhandledErrors);

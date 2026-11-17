import { createMcpHandler } from "agents/mcp/server";
import { defineHandler } from "void";
import { db } from "void/db";
import { storage } from "void/storage";
import { createLedgerMcpServer } from "../src/mcp/server.ts";

/**
 * MCP の Streamable HTTP（ステートレス）のハンドラー。リクエストごとに MCP サーバーを作り直す。
 *
 * 認証は他のルートと同じく Cloudflare Access に任せる。MCP クライアントは Access の Managed OAuth で
 * ログインし、Access が付けた JWT を middleware/02.access.ts が確かめるので、ここでは確かめない。
 * CORS とブラウザからの書き込みの拒否も middleware に任せるので、ハンドラーの CORS は切る。
 */
const mcpHandler = createMcpHandler(() => createLedgerMcpServer({ db, storage }), {
  route: "/mcp",
  corsOptions: false,
});

/**
 * Void のルートから MCP のハンドラーへ渡す。セッションを持たないので、GET と DELETE はハンドラーが 405 を返す。
 *
 * Worker の ExecutionContext は渡さない。ハンドラーが使うのは @cloudflare/workers-oauth-provider が検証した
 * トークンの情報だけで、Access に認証を任せるこのアプリでは使わないため。
 */
const handle = defineHandler((c) => mcpHandler.fetch(c.req.raw));

export const POST = handle;
export const GET = handle;
export const DELETE = handle;

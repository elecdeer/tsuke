import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { D1_MAX_BOUND_PARAMETERS, type LedgerDb } from "../src/db.ts";
import * as schema from "./schema.ts";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url);

/** マイグレーションのファイル名を適用順（名前の昇順）に返す */
export const migrationFiles = (): string[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

/**
 * マイグレーションを順に適用する。省略時はすべて適用する。
 */
export const applyMigrations = (db: DatabaseSync, files: string[] = migrationFiles()): void => {
  for (const name of files) {
    db.exec(readFileSync(new URL(name, MIGRATIONS_DIR), "utf8"));
  }
};

/**
 * メモリ上に DB を作る。D1 は外部キーを常に検証するので、同じ条件になるよう foreign_keys を有効にする。
 */
export const createDb = (): DatabaseSync => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
};

/** INSERT を実行し、作られた行の id を返す */
export const insert = (
  db: DatabaseSync,
  sql: string,
  ...params: (string | number | null)[]
): number => Number(db.prepare(sql).run(...params).lastInsertRowid);

/**
 * マイグレーション済みのメモリ上の DB を Drizzle で包む。
 *
 * 本番は D1 だが、テストでは Workers の実行環境を立ち上げずに済むよう node:sqlite を sqlite-proxy で使う。
 * D1 の batch はトランザクションで流れるので、ここでも BEGIN と COMMIT で包む。
 */
export const createTestLedgerDb = (): { db: LedgerDb; sqlite: DatabaseSync } => {
  const sqlite = createDb();
  applyMigrations(sqlite);
  const execute = (
    sql: string,
    params: unknown[],
    method: "run" | "all" | "values" | "get",
  ): { rows: unknown[] } => {
    // node:sqlite は変数を 3 万個以上受け付けるので、D1 の上限を超える文がテストで通らないよう同じ上限で止める
    if (params.length > D1_MAX_BOUND_PARAMETERS) {
      throw new Error(`too many SQL variables: ${params.length}`);
    }
    const statement = sqlite.prepare(sql);
    // sqlite-proxy は行を列の配列で受け取る
    statement.setReturnArrays(true);
    // sqlite-proxy が渡す値は SQLite に入れられる値（数値・文字列・null など）に限られる
    const values = params as SQLInputValue[];
    if (method === "run") {
      statement.run(...values);
      return { rows: [] };
    }
    if (method === "get") {
      // setReturnArrays(true) なので行は配列になる（node:sqlite の型はオブジェクトのまま）
      const row: unknown = statement.get(...values);
      return { rows: Array.isArray(row) ? row : [] };
    }
    const rows: unknown[] = statement.all(...values);
    return { rows };
  };
  const db = drizzle(
    async (sql, params, method) => execute(sql, params, method),
    async (queries) => {
      sqlite.exec("BEGIN");
      try {
        const results = queries.map((query) => execute(query.sql, query.params, query.method));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    { schema },
  );
  return { db, sqlite };
};

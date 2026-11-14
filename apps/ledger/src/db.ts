import { getTableColumns } from "drizzle-orm";
import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import type { BaseSQLiteDatabase, SQLiteTable } from "drizzle-orm/sqlite-core";
import type * as schema from "../db/schema.ts";

/**
 * 台帳の DB。本番では void/db の D1、テストでは node:sqlite を使うので、どちらも受け取れる非同期の SQLite の型にする。
 *
 * batch は D1 と sqlite-proxy のドライバがそれぞれ同じ形で持っていて、共通の型にはないので足す。
 */
export type LedgerDb = BaseSQLiteDatabase<"async", unknown, typeof schema> & {
  batch<U extends BatchItem<"sqlite">, T extends Readonly<[U, ...U[]]>>(
    batch: T,
  ): Promise<BatchResponse<T>>;
};

/** D1 が 1 つの文で受け付けるバインド変数の数の上限。超えると too many SQL variables で失敗する */
export const D1_MAX_BOUND_PARAMETERS = 100;

/**
 * 複数行の INSERT が D1 のバインド変数の上限を超えないよう、行を分ける。分けた行はそれぞれ別の INSERT にして、
 * 同じ batch に並べる（batch はトランザクションで流れるので、まとめて入れたときと同じく途中で失敗しても残らない）。
 *
 * 1 行の変数の数は表の列の数を上限として見積もる。行の値ごとに数えないのは、Drizzle が値のない列を
 * default で埋めるか変数にするかを列の定義で決めるため。値に変数を含む SQL 式を入れる列があると見積もりを
 * 超えるので、その使い方はしない（取引を MAX(id) で指す式は変数を使わない）。
 */
export const chunkInsertRows = <T>(table: SQLiteTable, rows: readonly T[]): T[][] => {
  const columnCount = Object.keys(getTableColumns(table)).length;
  const size = Math.max(1, Math.floor(D1_MAX_BOUND_PARAMETERS / columnCount));
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
};

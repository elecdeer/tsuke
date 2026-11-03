import type { TransactionFilter } from "../ledger/transactions.ts";

/**
 * 取引の一覧の URL を、絞り込みの条件から作る。指定のない条件はクエリに入れない。
 * selected を渡すと、その取引を広い画面のサイドパネルで開いた一覧にする。
 */
export const transactionsHref = (filter: TransactionFilter, selected?: number): string => {
  const params = new URLSearchParams({ month: filter.month });
  if (filter.mode !== undefined) params.set("mode", filter.mode);
  if (filter.accountId !== undefined) params.set("accountId", String(filter.accountId));
  if (filter.categoryId !== undefined) params.set("categoryId", String(filter.categoryId));
  if (filter.genreId !== undefined) params.set("genreId", String(filter.genreId));
  if (filter.placeId !== undefined) params.set("placeId", String(filter.placeId));
  if (filter.chain !== undefined) params.set("chain", filter.chain);
  if (selected !== undefined) params.set("selected", String(selected));
  return `/transactions?${params}`;
};

/**
 * 月のほかに何か絞り込んでいれば true を返す。
 */
export const isFiltered = (filter: TransactionFilter): boolean =>
  filter.mode !== undefined ||
  filter.accountId !== undefined ||
  filter.categoryId !== undefined ||
  filter.genreId !== undefined ||
  filter.placeId !== undefined ||
  filter.chain !== undefined;

/** ローカル開発で許可するホスト名。前方一致だと localhost.example.com のような別のサイトも通るので完全一致で比べる */
const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

/**
 * クロスオリジンリクエストを許可する origin か判定する。
 *
 * 許可するのは拡張機能（chrome-extension://）と、http のローカル開発サーバーだけ。
 * 応答は credentials 付きで読めるので、解釈できない origin は拒否する。
 */
export const isAllowedCorsOrigin = (origin: string): boolean => {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return (
    origin.startsWith("chrome-extension://") ||
    (url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname))
  );
};

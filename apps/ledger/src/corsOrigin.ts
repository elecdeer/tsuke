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

/** サーバーの状態を変えないメソッド */
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 書き込みのリクエストを受け付けてよい送信元か判定する。
 *
 * CORS は応答を読ませないだけで送信は止めないので、別サイトからの書き込みはここで拒否する。
 * Content-Type を JSON に限る方法だと、プリフライトを Access が止めることに頼る形になるので Origin で判定する。
 * ブラウザは書き込みのリクエストに必ず Origin を付けるので、Origin がないのはブラウザ以外のクライアントとして通す。
 */
export const isAllowedWriteRequest = (request: {
  method: string;
  url: string;
  origin: string | undefined;
}): boolean => {
  if (SAFE_METHODS.has(request.method) || request.origin === undefined) return true;
  return request.origin === new URL(request.url).origin || isAllowedCorsOrigin(request.origin);
};

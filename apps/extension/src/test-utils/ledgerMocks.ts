import type { LedgerInput, LedgerOutput, LedgerPath } from "ledger/client";
import { http, HttpResponse } from "msw";

/**
 * Storybook とブラウザテストで使う、台帳 API のモックデータと MSW ハンドラー。
 * レスポンスの型を台帳のハンドラーから生成した型に合わせ、API が変わったら型エラーで気づけるようにする。
 */

export const MOCK_SERVER_URL = "http://mock-server.test";

/** モックサーバーの URL にパスを付ける */
export const mockUrl = (path: LedgerPath): string => `${MOCK_SERVER_URL}${path}`;

export const mockMe: LedgerOutput<"/me", "GET"> = {
  email: "user@example.com",
  id: "user@example.com",
};

export const mockAccounts: LedgerOutput<"/api/accounts", "GET"> = {
  accounts: [
    { id: 1, name: "現金" },
    { id: 2, name: "クレジットカード" },
    { id: 3, name: "Suica" },
  ],
};

export const mockCategories: LedgerOutput<"/api/categories", "GET"> = {
  categories: [
    {
      id: 101,
      name: "食費",
      genres: [
        { id: 1001, name: "食料品" },
        { id: 1002, name: "外食" },
      ],
    },
    { id: 102, name: "交通費", genres: [{ id: 1003, name: "電車・バス" }] },
  ],
};

export const mockPlaces: LedgerOutput<"/api/places", "GET"> = {
  places: [
    { id: 1, name: "スーパーA", lastUsedOn: "2024-01-10", useCount: 5 },
    { id: 2, name: "コンビニB", lastUsedOn: "2024-01-05", useCount: 3 },
    { id: 3, name: "カフェC", lastUsedOn: "2024-01-01", useCount: 1 },
  ],
};

export const meHandler = http.get(mockUrl("/me"), () => HttpResponse.json(mockMe));
export const unauthenticatedHandler = http.get(
  mockUrl("/me"),
  () => new HttpResponse(null, { status: 401 }),
);
export const accountsHandler = http.get(mockUrl("/api/accounts"), () =>
  HttpResponse.json(mockAccounts),
);
export const categoriesHandler = http.get(mockUrl("/api/categories"), () =>
  HttpResponse.json(mockCategories),
);
export const placesHandler = http.get(mockUrl("/api/places"), () => HttpResponse.json(mockPlaces));
/** 品目ごとに重複の候補なしを返す */
export const noDuplicatesHandler = http.post<
  never,
  LedgerInput<"/api/transactions/duplicates", "POST">["body"]
>(mockUrl("/api/transactions/duplicates"), async ({ request }) => {
  const { items } = await request.json();
  const response: LedgerOutput<"/api/transactions/duplicates", "POST"> = {
    duplicates: items.map(() => []),
  };
  return HttpResponse.json(response);
});

/** メイン画面の表示に使うマスタの一覧と重複チェックのハンドラー */
export const masterHandlers = [
  accountsHandler,
  categoriesHandler,
  placesHandler,
  noDuplicatesHandler,
];

/** 明細の一括登録で使う店舗。明細の利用先名と表記がずれる店舗を含む */
export const mockStatementPlaces: LedgerOutput<"/api/places", "GET"> = {
  places: [
    { id: 1, name: "スーパーA", lastUsedOn: "2026-04-10", useCount: 5 },
    { id: 3, name: "カフェC 駅前店", lastUsedOn: "2026-03-01", useCount: 2 },
  ],
};

/** 読み取れる行が 3 件、日付と金額を読み取れない行が 1 件の明細 */
export const mockStatement: LedgerOutput<"/api/statements/extract", "POST"> = {
  model: "test-model",
  accountId: 2,
  rows: [
    { date: "2026-05-01", place: "ｽｰﾊﾟｰA", placeName: "スーパーA", amount: 1200, genreId: 1001 },
    { date: "2026-05-02", place: "JR東日本", placeName: null, amount: 300, genreId: 1003 },
    { date: "2026-05-03", place: "カフェC", placeName: null, amount: 450, genreId: 1002 },
    { date: null, place: "読み取れない行", placeName: null, amount: null, genreId: null },
  ],
  confidence: "high",
  reasoning: "",
};

/** 2 行目（JR東日本）だけ登録済みとして返す */
export const mockStatementMatches: LedgerOutput<"/api/statements/registered", "POST"> = {
  matches: [null, { transactionId: 50, date: "2026-05-02", amount: 300, placeName: null }, null],
};

/** 明細の一括登録画面の読み取りと登録に使うハンドラー */
export const statementHandlers = [
  accountsHandler,
  categoriesHandler,
  http.get(mockUrl("/api/places"), () => HttpResponse.json(mockStatementPlaces)),
  http.post(mockUrl("/api/statements/extract"), () => HttpResponse.json(mockStatement)),
  http.post(mockUrl("/api/statements/registered"), () => HttpResponse.json(mockStatementMatches)),
  http.post(mockUrl("/api/transactions"), () => HttpResponse.json({ id: 999 })),
];

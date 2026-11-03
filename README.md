# Vite+ Monorepo Starter

A starter for creating a Vite+ monorepo.

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run -r test
```

- Build the monorepo:

```bash
vp run -r build
```

- Run the development server:

```bash
vp run dev
```

## ledger

支払いは自前の台帳 `apps/ledger` に記録する（Zaim API が 2026-12-07 に提供を終えるため、Zaim から移行した）。[Void](https://void.cloud/) で作り、Cloudflare Workers 上の D1 と Drizzle を使う。Worker `tsuke` にデプロイする。

- URL: `https://tsuke.<subdomain>.workers.dev`
- 拡張機能を台帳に切り替えた後に、Zaim と Cloudflare に残っているもの（`quick-zaim-server`・KV・Zaim のアプリなど）を消す。手順は [phase4-design.md](apps/ledger/docs/phase4-design.md) の「切り替えの後の手順」。2027-01-07 までに済ませる
- API は `routes/`、Web 画面は `pages/`、スキーマは `db/schema.ts`（`void db generate` でマイグレーションを作る）
- 拡張機能は台帳の API を `ledger/client` の `createLedgerClient` で型付きで呼ぶ。Void の `void/client` の fetch は `credentials` を指定できず Access の Cookie を送れないため使わない
- 拡張機能向けの型は `vp run ledger#build:types` で `dist/types` に出す（`vp pack` だと Void が生成する型を読めず `any` になる）。拡張機能の `build` は先にこれを実行する。型チェックの前にも必要なので、CI では `vp check` の前に実行している

### Web 画面

台帳の URL をブラウザで開くと、月ごとの集計（`/`）、取引の一覧と編集（`/transactions`）、口座の残高（`/accounts`）が見られる。設計は [phase3-design.md](apps/ledger/docs/phase3-design.md)。

紙のレシートは `/receipts/new` で撮影して登録する。AI が読み取った内容を確かめてから登録する。スマートフォンではホーム画面に追加すると、この画面から開く（PWA）。設計は [phase5-design.md](apps/ledger/docs/phase5-design.md)。

店舗の入力欄の地図のボタンから、現在地の周りの店舗を地図で選べる。店舗は [OpenPOI API](https://docs.openpoiapi.com/)（キー不要・CORS 可）をブラウザから直接呼んで探し、地図は Leaflet と OpenStreetMap のタイルで出す。OpenPOI のデータを出すときは「OpenPOI API」と書いて[出典のページ](https://openpoiapi.com/attribution.html)へリンクする決まりなので、地図の帰属表示に入れている。

新しい店舗を入れると、入力欄の下に登録済みの似た店舗と OpenPOI の候補を出す。候補は押したときだけ反映し、押さなければ入れた名前のまま登録する。OpenPOI には施設の ID がなく、同じチェーンでも表記が揺れるので、自動ではまとめない。店舗は支店ごとに持ち、`places.chain` で支店をまとめて見る（取引の一覧をチェーンで絞り込める）。登録済みの店舗の整理と、拡張機能からの登録は対象外。

- UI 部品は拡張機能と同じ shadcn（base-ui 版）と Tailwind CSS。`apps/ledger` で `pnpm exec shadcn add <名前>` を実行すると `src/components/ui/` に入る。shadcn の CLI が `cn` パッケージを入れて `from "cn"` と書くので、`@/lib/utils` に直して `cn` パッケージは外す
- 表示するデータはページの `loader`、変更はページの `actions` で扱い、`/api/*`（拡張機能のための API）には足さない
- ローカルの D1 に本物の記録を取り込んでいる場合は、架空のデータで画面を確かめられる。`LEDGER_PERSIST_TO` に別の場所を指定して開発サーバーを起動すると、ローカルの D1 などがそこに作られる（マイグレーションも適用される）。そこに `scripts/sample-data.sql` を入れる

```bash
LEDGER_PERSIST_TO=/tmp/ledger-sample pnpm -F ledger exec vp dev
sqlite3 "$(ls /tmp/ledger-sample/v3/d1/miniflare-D1DatabaseObject/*.sqlite | grep -v metadata)" < apps/ledger/scripts/sample-data.sql
```

- 開発サーバーが新しい依存を見つけて最適化し直すと、React が 2 つ読み込まれて `Invalid hook call` で画面が出なくなることがある。開発サーバーを起動し直すと直る

### デプロイ

`main` に push すると、Worker `tsuke` に接続した Workers Builds が `pnpm -F ledger exec void deploy --platform cloudflare` でデプロイする（Workers Builds のプレビューは無効にしている）。

- API トークンは Workers Builds のビルド用トークンが使われる。D1 の書き込み権限がないとマイグレーションと復元ポイントの作成で失敗する
- デプロイ最後の準備確認を Access に通すため、ビルドのシークレットに Access のサービストークン（`CF_ACCESS_CLIENT_ID`・`CF_ACCESS_CLIENT_SECRET`）を入れている。Access アプリケーションには、そのトークンを許可する Service Auth のポリシーを付けている

手元からデプロイするときは次のコマンドを使う。

```bash
pnpm -F ledger exec void deploy
```

- 初回はチェックアウトごとに `pnpm -F ledger exec void connect --platform cloudflare` でデプロイ先を選ぶ（選択は `.void/` に保存され Git には入らない）
- デプロイ時に D1 のマイグレーションが適用される。適用前の復元ポイントと `void db restore` のコマンドが表示される
- Void は Workers Previews に対応していないため、ブランチごとの Preview はない
- Void は Worker の公開設定（`workers_dev`・`preview_urls`・`routes`）がダッシュボード側とずれているとデプロイを止めるので、`void.config.ts` に今の値を書いている
- 破壊的なマイグレーション（`DROP TABLE` など）は、ファイルに `-- void:allow-destructive` の行がないと適用されない
- デプロイの最後に Void が新しい版の準備確認をするが、Access に止められる。手元からデプロイするときは Access の短期トークンを渡す（取れないときは新しい版が有効にならず、前の版のまま動く）

```bash
cf access login https://tsuke.<subdomain>.workers.dev
CF_ACCESS_TOKEN="$(cf access token https://tsuke.<subdomain>.workers.dev)" pnpm -F ledger exec void deploy
```

### 認証

- 認証は Worker の手前の [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/) が行う。Access アプリケーションは Worker 単位（destination の type が `worker`）で作り、ポリシーで自分のメールアドレスだけを許可する
- 拡張機能は Access のセッション Cookie（`CF_Authorization`）を送り、未ログイン時の Access のログイン画面へのリダイレクトを 401 として扱う（`apps/extension/src/lib/serverClient.ts`）
- ログインは拡張機能の設定オーバーレイから行う（`/auth/launch` を開くと Access のログインを経て拡張機能に戻る）。ログアウトは `/logout` から Access のログアウトへリダイレクトする
- Void のアプリは静的アセットを持つため、Access のルーターが `ctx.access` を Worker に渡さない。本番では常に `Cf-Access-Jwt-Assertion` の JWT 検証で認証するので、`ACCESS_AUD` シークレットが必須（未設定だと全リクエストが 401 になる）

```bash
pnpm -F ledger exec void secret put ACCESS_AUD
```

- ローカル開発では、開発サーバー（`import.meta.env.DEV`）のときだけ `dev@example.com` として通す。`void.config.ts` に `cloudflare.access.dev` を書く方法は、デプロイ時に Worker の設定としてアップロードされ、シークレットと一緒に送れずに失敗するため使わない
- コンテキスト変数の `user` は Void の認証機能（Better Auth）が型を予約しているため、`accessUser` を使う
- 自動入力（`POST /api/transactions/extract`）が使う Workers AI にはローカルの模擬環境がなく、開発サーバーは Access の後ろにある `tsuke` 経由でリモートの AI につなぐ。そのため Access のサービストークン（`CLOUDFLARE_ACCESS_CLIENT_ID` と `CLOUDFLARE_ACCESS_CLIENT_SECRET`）がないと開発サーバーが起動しない。AI 以外を試すだけなら、`void.config.ts` に一時的に `inference: { bindings: { ai: false } }` を足す

### 自動入力の評価

`scripts/eval-fixtures/` の事例を複数のモデルで台帳の抽出に通し、項目ごとの一致率・時間・トークン数を比べる。Workers AI は Cloudflare の AI の REST API で呼ぶので、Workers AI の権限を持つ API トークンとアカウント ID が要る。Workers AI の利用枠を実際に使う。

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... pnpm -F ledger run eval:extract-payment -- --models openai/gpt-5.4-mini,@cf/moonshotai/kimi-k2.5
```

# フェーズ1 設計: 台帳のスキーマと Zaim CSV の取り込み

## 前提

- 利用者は自分だけ。家計簿は世帯で共有しないので、テーブルにユーザー ID は持たない（Worker の手前の Cloudflare Access が本人以外を通さない）
- 金額は日本円の整数。外貨は扱わない（Zaim の記録もすべて JPY だった）
- 拡張機能の登録フォームは「日付・口座・店舗を 1 つずつ、品目を複数」（[MainScreen.tsx](../../extension/src/entrypoints/sidepanel/screens/MainScreen.tsx)）。品目ごとに名前・金額・メモ・カテゴリを持つ
- Zaim の過去データは CSV（ファイル入出力）から取り込む。API で取得したデータは 2027-01-07 までに削除する義務があるので使わない

## テーブル

```text
accounts            口座
  id                integer PK
  name              text  unique
  sort              integer default 0
  archived          boolean default false
  created_at / updated_at

categories          カテゴリ（大分類）
  id                integer PK
  mode              'payment' | 'income'
  name              text
  sort / archived / created_at / updated_at
  unique(mode, name)

genres              カテゴリの内訳（今の拡張機能の「サブカテゴリ」）
  id                integer PK
  category_id       → categories.id
  name              text
  sort / archived / created_at / updated_at
  unique(category_id, name)

places              店舗・取引先（支出のお店、収入の支払元）
  id                integer PK
  name              text  unique
  sort / archived / created_at / updated_at

transactions        取引（拡張機能の 1 回の登録、CSV のレシート 1 枚）
  id                integer PK
  date              text 'YYYY-MM-DD'
  mode              'payment' | 'income' | 'transfer' | 'adjustment'
  from_account_id   → accounts.id  null 可（支払元・振替元・残高を減らす口座）
  to_account_id     → accounts.id  null 可（入金先・振替先・残高を増やす口座）
  place_id          → places.id  null 可（お店。収入では支払元）
  aggregation       'always' | 'never' | 'yearly_only'  default 'always'（集計の設定）
  source            'manual' | 'zaim_csv'
  import_batch_id   → import_batches.id  null 可
  created_at / updated_at

transaction_items   品目
  id                integer PK
  transaction_id    → transactions.id  on delete cascade
  category_id       → categories.id  null 可
  genre_id          → genres.id  null 可
  name              text null 可（品目名）
  memo              text null 可
  amount            integer（符号付き。値引きは負）
  sort              integer

import_batches      取り込みの記録
  id                integer PK
  source            'zaim_csv'
  file_name         text
  imported_at       text
  row_count         integer
```

### 決めたこと

- **取引と品目を分ける。** 日付・口座・店舗は取引に、カテゴリ・金額・名前・メモは品目に置く。合計は品目の和で、取引には持たない
- **品目はカテゴリと内訳の両方を持つ。** 収入には内訳がなく、Zaim の記録には内訳のない支出やカテゴリのない収入もあるため。内訳を持つときは、その内訳の親カテゴリを入れる
- **メモは品目に置く。** 今の拡張機能が品目ごとにメモ（Zaim の comment）を持っているため
- **店舗はマスタ（`places`）にする。** Zaim では店舗が取引ごとの文字列だったが、台帳では口座・カテゴリと同じくマスタとして持つ。Zaim の `place_uid` は引き継がない
  - 表記ゆれ（実物の CSV で全角・半角や空白の違いだけのものが 6 組）の統合や名前の変更が、取引を書き換えずに 1 か所で済む
  - 1 回しか使っていない店舗（実物で 494 件中 172 件）をアーカイブして候補から外せる
  - 名前を変えても店舗別の集計が分かれない
  - 後から「この店ならこのカテゴリ・この口座」の既定値を足せる（LLM のヒントや自動入力に使う。フェーズ1 では持たない）
  - 収入の支払元（実物で 385 行）も同じテーブルに入れる。支出と収入で同じ相手が出ても 1 件にまとまる
  - 拡張機能は店舗を自由入力できるので、登録時に名前が完全に一致する店舗を探し、なければ作る。表記ゆれの吸収はせず、統合は Web 画面で行う
- **品目の金額は符号付き。** レシートの値引きやクーポンが負の金額の品目として入っている。取引の種類（支出・収入など）の向きは `mode` で表し、品目の符号はその中での加減だけを表す
- **集計の設定は 3 値。** Zaim の「常に集計に含める」「集計に含めない」「年の集計にのみ含める」をそのまま持つ
- **残高調整は差額として持つ。** 増やすときは `to_account`、減らすときは `from_account` に口座を入れ、金額は正にする。振替と同じ向きの表し方なので、口座の残高は「入ってきた額 − 出ていった額」の 1 本の式で出せる
- **マスタは削除せずアーカイブする。** 取引から参照されている口座・カテゴリ・店舗は消せない（外部キーは restrict）。店舗の統合は、取引の `place_id` を付け替えてから統合元を消す（理由は [places-design.md](places-design.md)）
- **種類ごとの組み合わせはアプリ側で検証する。** SQLite の CHECK 制約は Drizzle のマイグレーションで変えにくいので、valibot のスキーマで保証する。取り込みは Zaim の記録を欠けたまま受け入れ、拡張機能・Web 画面からの入力だけ必須項目を課す

| mode       | from_account | to_account   | 品目     | カテゴリ・内訳                         |
| ---------- | ------------ | ------------ | -------- | -------------------------------------- |
| payment    | 任意         | なし         | 1 件以上 | 支出のカテゴリと内訳（手入力では必須） |
| income     | なし         | 任意         | 1 件     | 収入のカテゴリ（任意）。内訳なし       |
| transfer   | 必須         | 必須         | 1 件     | 任意                                   |
| adjustment | どちらか一方 | どちらか一方 | 1 件     | なし                                   |

### インデックス

- `transactions(date)`: 月ごとの一覧・集計、重複チェック
- `transactions(place_id)`: 店舗の候補（最終利用日・回数）、店舗別の集計
- `transaction_items(transaction_id)`, `transaction_items(genre_id)`

### 今の機能との対応

| 今（Zaim API 経由）                          | 台帳                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| カテゴリ一覧                                 | `categories` + `genres`（`archived = false`）                            |
| 口座一覧                                     | `accounts`（`archived = false`）                                         |
| 店舗の候補                                   | `places`（`archived = false`）に取引から最終利用日・回数を集計して付ける |
| 重複チェック（日付 ±1 日・金額・内訳が一致） | `transactions` と `transaction_items` の結合を 1 本の SQL で             |
| 支払いの登録（品目ごとに POST）              | 店舗を名前で探すか作り、取引 1 件 + 品目 n 件を `db.batch` で 1 回に     |

## Zaim CSV の取り込み

### 実物の CSV（2026-10-26 に出力したもの）

- UTF-8（BOM なし）、7,939 行、2020-02 から 2026-10 まで、日付の昇順、セル内の改行なし
- 見出しは `日付,方法,カテゴリ,カテゴリの内訳,支払元,入金先,品目,メモ,お店,通貨,収入,支出,振替,残高調整,通貨変換前の金額,集計の設定`
- 「なし」は空文字ではなく `-` で入っている

| 方法     | 行数  | 金額の列 | 口座                                    | カテゴリ・内訳                                                           |
| -------- | ----- | -------- | --------------------------------------- | ------------------------------------------------------------------------ |
| payment  | 7,302 | 支出     | 支払元（55 行は `-`）                   | ほぼすべてあり。内訳 `-` が 9 行、カテゴリだけ `-` で内訳がある行が 1 行 |
| income   | 390   | 収入     | 入金先                                  | 内訳は常に `-`。カテゴリ `-` が 143 行                                   |
| transfer | 212   | 振替     | 支払元と入金先                          | 21 行だけカテゴリあり（支出のカテゴリ）                                  |
| balance  | 35    | 残高調整 | 支払元だけ（9 行）か入金先だけ（26 行） | なし                                                                     |

- 支出の 483 行が負の金額（大半はレシート内の値引き）、42 行が 0 円
- 集計の設定は「常に集計に含める」7,428 行、「集計に含めない」510 行、「年の集計にのみ含める」1 行
- 通貨はすべて JPY。通貨変換前の金額は使わない
- 内容がまったく同じ行が 71 行ある（同じ日に同じ店で同じものを買った記録）

### 列の対応

| CSV                           | 台帳                                                                      |
| ----------------------------- | ------------------------------------------------------------------------- |
| 日付                          | `transactions.date`                                                       |
| 方法                          | `transactions.mode`（payment / income / transfer / balance → adjustment） |
| カテゴリ / カテゴリの内訳     | `transaction_items.category_id` / `genre_id`（名前で引く。`-` は null）   |
| 支払元                        | `from_account_id`（`-` は null）                                          |
| 入金先                        | `to_account_id`（`-` は null）                                            |
| 品目                          | `transaction_items.name`                                                  |
| メモ                          | `transaction_items.memo`                                                  |
| お店                          | `transactions.place_id`（名前で引く。`-` は null）                        |
| 支出 / 収入 / 振替 / 残高調整 | `transaction_items.amount`（方法に応じた列を使う）                        |
| 通貨                          | JPY 以外はエラーにする                                                    |
| 通貨変換前の金額              | 使わない                                                                  |
| 集計の設定                    | `transactions.aggregation`                                                |

- **マスタは CSV に出てくる名前から作る。** 一度も使っていないカテゴリや口座は出てこないので、取り込み後に Web 画面で足す（実物では支出のカテゴリ 15・内訳 57、収入のカテゴリ 5、口座 16、店舗 494）
- 店舗の表記ゆれは取り込み時にはまとめず、CSV の名前のまま作る。統合は Web 画面で行う
- 同じ名前のカテゴリが支出と収入の両方にあっても別のカテゴリとして作る
- 振替のカテゴリは、Zaim では支出のカテゴリから選ぶので支出のカテゴリとして扱う
- カテゴリが `-` で内訳だけある行は、その内訳がほかの行でただ 1 つのカテゴリの下にしか出てこなければ、そのカテゴリを補う。決められなければエラーにする
- マスタの名前（口座・カテゴリ・内訳・店舗）は前後の空白を取り除く。品目名とメモはそのまま残す

### レシートのまとめ方

CSV にはレシートのまとまりがないが、Zaim でレシートとして入れた記録は連続した行になっている。お店のある支出で「日付・お店・支払元」が同じ行は 946 組あり、そのうち 932 組は連続していた。

**連続する支出の行で日付・お店・支払元が同じなら、1 つの取引の品目としてまとめる。** お店のない行はまとめない。

- 別々の買い物を 1 枚のレシートとしてまとめてしまうことはありうるが、品目ごとにカテゴリと金額を持つので、集計の結果は変わらない
- まとめないと、今の Zaim と同じく品目ごとに別の取引になる。後から台帳で編集するとき、レシート単位で直せなくなる

### 取り込みの流れ

```bash
# 手元で変換（DB には触れない）。--summary には方法・月ごとの件数と合計を出す
pnpm -F ledger exec vpx scripts/import-zaim-csv.ts <CSV の絶対パス> --out <SQL> --summary <JSON> --batch-dir <dir>

# ローカルの D1 で確かめる
pnpm -F ledger exec void db execute --file <SQL>

# 本番の D1 に入れる（バッチを番号順に 1 つずつ）
for f in <dir>/batch-*.json; do cf d1 raw <D1 の ID> --batch "@$f" > /dev/null || break; done
```

- 本番では `void db execute --remote --file` を使わない。Void がファイルの中身をコマンドの引数で `cf` に渡すため、4MB ほどの SQL では引数の長さの上限を超えて起動できない（E2BIG）
- バッチは 1 つずつトランザクションで流れる。途中のバッチで失敗しても、取り込みは総入れ替えなので最初から流し直せばよい

1. スクリプトが CSV を読み（UTF-8 と Shift_JIS の両方に対応）、行ごとに valibot で検証する。1 行でもエラーがあれば行番号と理由を出して SQL を出力しない
2. マスタは名前で `INSERT OR IGNORE` するので、何度流しても ID は変わらない
3. 取引は `source = 'zaim_csv'` と `import_batch_id` を付けて入れる。品目は直前に入れた取引を `MAX(id)` で参照する（2 件目以降の品目では `last_insert_rowid()` が品目の ID になるため使わない）
4. 本番に入れる前の時刻を控えておけば、`void db restore --timestamp` で戻せる（Time Travel）

- 家計のデータをサーバーの API に送らずに済むよう、変換は手元のスクリプトで行う
- SQL の文字列は自前でエスケープする（シングルクォートを重ねる）
- 取り込み後に、`--summary` の JSON と、台帳で `SUMMARY_SQL`（[zaimCsv.ts](../src/import/zaimCsv.ts)）を流した結果を突き合わせて確かめる

### ローカルの D1 で確かめた結果（2026-10-27）

- 7,939 行が取引 3,591 件・品目 7,939 件になった。複数の品目をまとめたレシートは 946 件（品目 5,294 件）。SQL は約 4.3MB で、ローカルへの投入は 4 秒ほど
- マスタは口座 15、カテゴリ 18、内訳 55、店舗 494
- 方法・月ごとの件数と合計（232 組）が CSV とすべて一致した。外部キーの違反はなく、カテゴリ・内訳・店舗・口座・集計の設定・品目名・メモの件数も CSV と一致した
- 同じ SQL をもう一度流しても件数は変わらず、口座の ID も変わらなかった

### 本番の D1 に入れた結果（2026-10-27）

- 12,114 文を 500 文ずつ 25 個のバッチに分け、`cf d1 raw --batch` ですべて流した（1 バッチは最大 196KB）
- 件数・マスタの数はローカルと同じで、方法・月ごとの件数と合計（232 組）も CSV とすべて一致した。外部キーの違反もなかった
- 取り込む直前の時刻は 2026-10-26T16:49:56Z。この時点へは `void db restore --timestamp` で戻せる（Workers Free では 7 日間）

### 切り替え時の再取り込み

拡張機能を台帳に切り替えるまでは Zaim に記録し続けるので、切り替える日にもう一度 CSV を出して入れ直す。

- **差分ではなく総入れ替えにする。** `source = 'zaim_csv'` の取引を消してから全件を入れる。Zaim 側で過去の記録を直していても追従でき、内容がまったく同じ行（実物で 71 行）を重複と取り違えることもない
- 拡張機能で手入力した取引（`source = 'manual'`）は消さない
- **マスタの整理（名前の変更・統合）は切り替えの後にやる。** 切り替え前に台帳側でカテゴリ・口座・店舗の名前を変えると、総入れ替えのときに CSV の名前と結びつかず、元の名前のマスタがまた作られるため。「Zaim の名前 → 台帳のマスタ」の対応表は持たない

## フェーズ1 の範囲外

- 拡張機能向けの API（`/api/ledger/*`）と拡張機能の切り替え（フェーズ2）
- Web 画面（フェーズ3）。口座の残高は、残高調整を差額として取り込むので計算できる。Zaim の画面に出ている残高と一致するかはそのときに確かめる
- Zaim 関連の撤去とデータ削除（フェーズ4）

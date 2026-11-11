FROM mcr.microsoft.com/playwright:v1.64.1-jammy

WORKDIR /app

# Node 26 同梱のイメージには corepack が無いので npm で入れる
RUN npm install -g pnpm@12.14.0

# lockfileのみでパッケージをvirtual storeにダウンロード
# lockfileとworkspace設定が変わらない限りこのレイヤーはキャッシュされる
# pnpm 12 は fetch 時にカタログ定義を lockfile と照合するため pnpm-workspace.yaml も必要
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# package.jsonをコピーしてオフラインインストール
# CI=true: prepare スクリプト内のlefthookとwxt prepareをスキップする
COPY package.json ./
COPY apps/extension/package.json apps/extension/
COPY apps/ledger/package.json apps/ledger/

RUN CI=true pnpm install --offline --frozen-lockfile

# ソースファイルをコピーしてwxt prepareを実行
COPY . .

RUN cd apps/extension && CI=true pnpm exec wxt prepare

WORKDIR /app/apps/extension

CMD ["pnpm", "run", "test:browser"]

FROM mcr.microsoft.com/playwright:v1.64.1-jammy

WORKDIR /app

# Node 26 同梱のイメージには corepack が無いので、vp を入れて pnpm は vp に取得させる
# （vp は package.json の packageManager から pnpm を取得する）。VP_VERSION は lockfile の vite-plus に合わせる
RUN curl -fsSL https://vite.plus | VP_VERSION=1.4.0 bash
ENV PATH="/root/.local/share/vite-plus/bin:${PATH}"

# 依存定義だけを先にコピーしてインストールする。これらが変わらない限りこのレイヤーはキャッシュされる
# pnpm 12 はカタログ定義を lockfile と照合するため pnpm-workspace.yaml も必要
# CI=true: prepare スクリプト内のlefthookとwxt prepareをスキップする
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/extension/package.json apps/extension/
COPY apps/ledger/package.json apps/ledger/

RUN CI=true vp install --frozen-lockfile

# ソースファイルをコピーしてwxt prepareを実行
COPY . .

RUN cd apps/extension && CI=true vp exec wxt prepare

WORKDIR /app/apps/extension

CMD ["vp", "run", "test:browser"]

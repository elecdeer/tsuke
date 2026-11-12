# vp 入りの公式イメージ。タグは lockfile の vite-plus に合わせる
# pnpm は vp が package.json の packageManager から取得する
FROM ghcr.io/voidzero-dev/vite-plus:1.4.0

WORKDIR /app

# 依存定義だけを先にコピーしてインストールする。これらが変わらない限りこのレイヤーはキャッシュされる
# pnpm 12 はカタログ定義を lockfile と照合するため pnpm-workspace.yaml も必要
# CI=true: prepare スクリプト内のlefthookとwxt prepareをスキップする
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=vp:vp apps/extension/package.json apps/extension/
COPY --chown=vp:vp apps/ledger/package.json apps/ledger/

RUN CI=true vp install --frozen-lockfile

# CI と同じく、lockfile の Playwright が期待するブラウザを入れる（root が要る部分は sudo で実行される）
RUN cd apps/extension && vp exec playwright install --with-deps chromium

# ソースファイルをコピーしてwxt prepareを実行
COPY --chown=vp:vp . .

RUN cd apps/extension && CI=true vp exec wxt prepare

WORKDIR /app/apps/extension

CMD ["vp", "run", "test:browser"]

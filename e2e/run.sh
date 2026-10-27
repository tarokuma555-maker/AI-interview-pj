#!/bin/bash
# 模擬サーバー(Google の代わり)と、AI を固定の文面にしたアプリを立ち上げて、画面を通しで確かめる。
# 先にリポジトリのルートで npm run build を済ませておく。画面は e2e/out/ に保存する。
set -eu
E2E="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$E2E")"
# 他の開発サーバーが同じポートを使っていたら触らず終了する。
for port in 3100 4200; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "確認用ポート $port は使用中です" >&2
    exit 1
  fi
done
mkdir -p "$E2E/out"
FAKE=""
SERVER=""
cleanup() {
  [ -z "$SERVER" ] || kill "$SERVER" 2>/dev/null || true
  [ -z "$FAKE" ] || kill "$FAKE" 2>/dev/null || true
}
trap cleanup EXIT
node "$E2E/fake-google.mjs" > "$E2E/out/fake-google.log" 2>&1 &
FAKE=$!
cd "$ROOT"
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= VERCEL_ENV=preview AI_PROVIDER=mock POC_ACCESS_CODE=test-code GOOGLE_TTS_API_KEY=test-google-key \
  GOOGLE_TTS_BASE_URL=http://localhost:4200 GOOGLE_STT_BASE_URL=http://localhost:4200/closing \
  node "$ROOT/node_modules/next/dist/bin/next" start -p 3100 > "$E2E/out/server.log" 2>&1 &
SERVER=$!
for _ in $(seq 1 30); do curl -s -o /dev/null http://localhost:3100/ && break; sleep 1; done
STATUS=0
for test in product mic-denied history-retry agent-login agent-seekers practice-link agent-results; do
  if [ -z "${E2E_ONLY:-}" ] || [ "$E2E_ONLY" = "$test" ]; then
    node "$E2E/$test.mjs" || STATUS=1
  fi
done
exit $STATUS

#!/bin/bash
# 模擬サーバー(Google の代わり)と、AI を固定の文面にしたアプリを立ち上げて、画面を通しで確かめる。
# 先にリポジトリのルートで npm run build を済ませておく。画面は e2e/out/ に保存する。
set -u
E2E="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$E2E")"
rm -rf "$E2E/out" && mkdir -p "$E2E/out"
node "$E2E/fake-google.mjs" > "$E2E/out/fake-google.log" 2>&1 &
FAKE=$!
cd "$ROOT"
AI_PROVIDER=mock POC_ACCESS_CODE=test-code GOOGLE_TTS_API_KEY=test-google-key \
  GOOGLE_TTS_BASE_URL=http://localhost:4200 GOOGLE_STT_BASE_URL=http://localhost:4200/closing \
  npx next start -p 3100 > "$E2E/out/server.log" 2>&1 &
SERVER=$!
for _ in $(seq 1 30); do curl -s -o /dev/null http://localhost:3100/ && break; sleep 1; done
STATUS=0
node "$E2E/product.mjs" || STATUS=1
node "$E2E/mic-denied.mjs" || STATUS=1
node "$E2E/history-retry.mjs" || STATUS=1
node "$E2E/agent-login.mjs" || STATUS=1
# next start が立ち上げた next-server も止める
for pid in $(ps -eo pid,args | awk '$2=="next-server" {print $1}'); do kill "$pid"; done
kill $SERVER $FAKE 2>/dev/null
exit $STATUS

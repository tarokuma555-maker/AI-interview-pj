<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# このプロジェクトで作業するとき

- 作業を始める前に [docs/handoff.md](docs/handoff.md)(引き継ぎ書)を読む。要件は [docs/requirements.md](docs/requirements.md)、設計は [docs/design.md](docs/design.md)。
- 依頼者への返事は日本語で、専門用語を避けて書く。
- push の前に `npm run lint`、`npm run typecheck`、`npm test`、`npm run build` を通す。画面を変えたら `e2e/` の確認も実行する。
- 動きを変えたら、要件定義書・基本設計書と改訂履歴も更新する。

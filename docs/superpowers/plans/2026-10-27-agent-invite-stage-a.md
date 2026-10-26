# 段階A:データベースの定義・保存先の切り替え・エージェントのログイン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** エージェントがメールの確認コード(またはリンク)でログインし、`/agent` を開ける。Supabase がない環境では、代わりの保存先で同じ流れが動く。

**Architecture:** Supabase の URL とキーがあれば Supabase Auth を使い、なければサーバーのメモリに置く代わりの方式で動く(`lib/backend/mode.ts` が決める)。ログインの確認は `lib/auth/agent.ts` の1か所に集め、`proxy.ts`(ログイン状態の更新と `/agent` の入口)と `app/agent/layout.tsx`(サーバーでの確認)から使う。データベースの定義は `supabase/migrations/` に置き、RLS を PGlite で単体テストする。

**Tech Stack:** Next.js 16.3(App Router、`proxy.ts`、async `cookies()`)、`@supabase/ssr` 0.12、`@supabase/supabase-js` 2.118、`@electric-sql/pglite` 0.5(テストのみ)、Vitest 5、Playwright(e2e)

**Spec:** [docs/superpowers/specs/2026-10-27-agent-invite-design.md](../specs/2026-10-27-agent-invite-design.md)(5章・7章・8章・9章の段階A)

## Global Constraints

- Next.js 16 は学習データと違う。書く前に `node_modules/next/dist/docs/` の該当ページを読む。Middleware は `proxy.ts`(既定で Node.js ランタイム。`runtime` は指定しない)。`cookies()` は async。
- 環境変数:`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。両方あれば Supabase、なければ代わりの方式。`VERCEL_ENV=production` で代わりの方式になる場合はエラーにする。値はコード・ログに書かない。`.env.example` と README の表に追記する。
- 一般の新規登録はしない(`shouldCreateUser: false`、`supabase/config.toml` の `enable_signup = false`)。
- 権限は `advisor` / `admin` の2つ。求職者は Auth のユーザーにしない。
- 画面の言葉は利用者の言葉(要件 8.5 UX-01〜08)。「OTP」「認証」「セッション」などの言葉、エラーの番号は出さない。
- コードのコメントには根拠の番号を書く(例:`設計 2026-10-27 7章`)。
- コミットメッセージは日本語で「機能名: 〇〇を実装」。本文に理由。末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。push はしない。
- 各タスクの最後に `npm run lint && npm run typecheck && npm test` を通す。タスク5で `npm run build` と e2e も通す。

## Review Focus

1. スマホで確認コードを全角数字・空白入りで入れる → 半角6桁として受け付ける(タスク2のテスト)。
2. メールアドレスの前後の空白・大文字 → 同じ人として扱う(タスク2のテスト)。
3. 登録されていないメールアドレスでログインしようとする → 「このメールアドレスは登録されていません。管理者にお問い合わせください」と出す(タスク3のテスト)。
4. 期限切れ・使用済みのメールのリンクを開く → `/agent/login` に戻り「リンクの期限が切れています。もう一度メールを送ってください」と出す(タスク4のテスト)。
5. 利用を止めたエージェント(`is_active = false`)がログインしたままの端末で開く → データは一切読めず、ログインの画面に戻る(タスク1の RLS テスト、タスク3のテスト)。

---

### Task 1: データベースの定義と RLS

**Files:**
- Create: `supabase/migrations/20261027000000_agent_invite.sql`
- Create: `tests/db/supabase-stub.sql`(Supabase が持っているものの代わり:ロール `anon`・`authenticated`・`service_role`(bypassrls)、スキーマ `auth`、`auth.users(id uuid primary key, email text, raw_user_meta_data jsonb)`、`auth.uid()` は `current_setting('request.jwt.claim.sub', true)` を uuid にして返す)
- Create: `tests/unit/db-schema.test.ts`
- Modify: `supabase/templates/invite.html`(宛先をエージェントにする:「AI面接練習のエージェント用の画面に招待されました」)

**Interfaces:**
- Produces(テーブル。設計 5章):
  - `user_profiles(id uuid pk → auth.users on delete cascade, role user_role not null default 'advisor', display_name text not null, is_active boolean not null default true, created_at)`。`user_role` は `('advisor','admin')`
  - `seekers(id uuid pk default gen_random_uuid(), advisor_id uuid not null → user_profiles, name text not null ≤100字, occupation text not null default '' ≤100字, career_summary text not null default '' ≤20000字, reason_for_change text not null default '' ≤5000字, created_at, updated_at)`
  - `practice_links(id uuid pk, seeker_id uuid not null → seekers on delete cascade, key_hash text not null unique, company_name text not null ≤200字, position text not null default '' ≤200字, job_description text not null default '' ≤20000字, stage text not null check in ('first','second','final'), style text not null check in ('gentle','standard','strict'), duration_min smallint not null check in (5,15,30), disabled_at timestamptz, created_at, updated_at)`
  - `interview_sessions(id uuid pk, link_id uuid not null → practice_links on delete cascade, seeker_id uuid not null → seekers on delete cascade, settings jsonb not null, context jsonb not null, plan jsonb, history jsonb not null default '[]', started_at timestamptz not null default now(), finished_at timestamptz)`、index `(seeker_id, started_at desc)`、`(link_id, started_at desc)`
  - `evaluations(session_id uuid pk → interview_sessions on delete cascade, status text not null default 'pending' check in ('pending','done','failed'), result jsonb, error text, attempts smallint not null default 0, updated_at)`
  - 関数 `public.current_user_role() returns user_role`(security definer、`search_path = ''`。利用を止めた人・プロフィールのない人は null)
  - トリガー `on_auth_user_created`(`auth.users` に追加されたら `user_profiles` を `advisor`・`display_name` = `raw_user_meta_data->>'display_name'`、なければメールの「@」より前で作る)
  - RLS(全テーブルで有効):`user_profiles` は本人の行を参照のみ。`seekers` は `advisor_id = auth.uid()` かつ `current_user_role() is not null`、または `current_user_role() = 'admin'` のとき、参照・追加・更新・削除(追加・更新では `advisor_id = auth.uid()` を必須にする。admin は除く)。`practice_links` は親の `seekers` を同じ条件で見られるときに参照・追加・更新・削除。`interview_sessions`・`evaluations` は同じ条件で参照のみ(書き込みはサーバーの管理用キーだけ)。`role` を本人が変えられる経路を作らない。
  - 権限:`authenticated` に上の操作に必要な `grant`、`anon` には何も与えない。

- [ ] **Step 1: 失敗するテストを書く** — `tests/unit/db-schema.test.ts`。`beforeEach` で新しい `PGlite` に `supabase-stub.sql` とマイグレーションを流し、`auth.users` に A(advisor)・B(advisor)・M(admin。作成後に `role` を管理者として更新)を入れる。ヘルパー `as(userId)` は `set role authenticated; set request.jwt.claim.sub = '<id>'`、`asServer()` は `reset role`。テスト:
  - `auth.users` に入れると `user_profiles` が `advisor`・メールの「@」の前の表示名でできる
  - A は自分の求職者を追加でき、B の求職者は `select` で0件、`update`/`delete` で0行
  - A が `advisor_id` を B にして追加すると RLS のエラーになる
  - M(admin)は A と B の求職者を両方見られる
  - A は B の求職者のリンクを見られず、B の求職者にリンクを追加できない
  - A は自分の求職者の `interview_sessions`・`evaluations` を見られるが、追加はエラー(サーバー `asServer()` では追加できる)
  - A は `update user_profiles set role = 'admin'` ができない(0行かエラー)
  - A の `is_active` を false にすると、A は自分の求職者も0件
  - `anon` では全テーブル0件かエラー
  - 求職者を消すと、リンク・練習・評価も消える
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/unit/db-schema.test.ts` / Expected: マイグレーションのファイルがなく FAIL
- [ ] **Step 3: マイグレーションを書く**(上の Produces のとおり)
- [ ] **Step 4: 通ることを確かめる** — Run: `npx vitest run tests/unit/db-schema.test.ts` / Expected: PASS
- [ ] **Step 5: lint・型・全テスト → コミット** — `データベース: エージェントと招待リンクのテーブルとアクセス制限を実装`

### Task 2: 保存先の切り替えと、代わりの方式のログイン

**Files:**
- Create: `lib/backend/mode.ts`
- Create: `lib/auth/login-input.ts`
- Create: `lib/auth/memory-auth.ts`
- Test: `tests/unit/agent-auth.test.ts`

**Interfaces:**
- Produces:
  - `type BackendMode = "supabase" | "memory"`;`backendMode(env = process.env): BackendMode` — URL とキーが両方あれば `"supabase"`。なければ `"memory"`。ただし `env.VERCEL_ENV === "production"` で `"memory"` になるときは `Error("Supabase の設定がありません")` を投げる
  - `type Agent = { id: string; email: string; displayName: string; role: "advisor" | "admin" }`(`lib/auth/types.ts` に置く)
  - `normalizeEmail(input: string): string` — 前後の空白を除き小文字にする
  - `normalizeCode(input: string): string | null` — 全角数字を半角にし、空白・ハイフンを除き、6桁の数字でなければ null
  - `memoryAuth`(`globalThis` に1つだけ置く。開発サーバーでルートごとに読み込み直されても共有する):
    - `issueCode(email: string): string` — 6桁のコードを作って覚える(10分有効)。同じメールで作り直したら前のコードは無効
    - `verifyCode(email: string, code: string): string | null` — 合えば新しいセッションID(推測できない乱数)を返し、コードを無効にする
    - `agentForSession(sessionId: string): Agent | null` — メールごとに同じ `id` の advisor を返す。表示名はメールの「@」より前
    - `endSession(sessionId: string): void`
  - `MEMORY_SESSION_COOKIE = "agent-dev-session"`
- [ ] **Step 1: 失敗するテストを書く** — `backendMode`:両方あり→supabase、片方だけ→memory、なし+`VERCEL_ENV=production`→throw、なし+`VERCEL_ENV=preview`→memory。`normalizeEmail(" Taro@Example.COM ")` → `"taro@example.com"`。`normalizeCode("１２３ ４５６")` → `"123456"`、`"12-34-56"` → `"123456"`、`"12345"` → null、`"abcdef"` → null。`memoryAuth`:正しいコードでセッションIDが返り、2回目は null、違うコードは null、作り直したら古いコードは null、11分後(`vi.useFakeTimers`)は null、同じメールの2つのセッションの `agentForSession(...).id` が同じ、`endSession` 後は null。
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/unit/agent-auth.test.ts` / Expected: FAIL(モジュールがない)
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通ることを確かめる** — 同じコマンドで PASS
- [ ] **Step 5: lint・型・全テスト → コミット** — `エージェントのログイン: 保存先の切り替えと開発用のログインを実装`

### Task 3: ログインの窓口(Supabase と代わりの方式をまとめる)

**Files:**
- Create: `lib/supabase/server.ts`
- Create: `lib/auth/agent.ts`
- Create: `lib/auth/messages.ts`
- Test: `tests/unit/agent-auth.test.ts`(追記)

**Interfaces:**
- Consumes: タスク2の `backendMode`、`memoryAuth`、`normalizeEmail`、`normalizeCode`、`Agent`、`MEMORY_SESSION_COOKIE`
- Produces:
  - `createSupabaseServerClient(): Promise<SupabaseClient>` — `@supabase/ssr` の `createServerClient`。`cookies()` の `getAll` / `setAll`(Server Component から呼ばれて書けない場合は握りつぶす。proxy が更新するため)
  - `getAgent(): Promise<Agent | null>` — supabase:`auth.getUser()` → `user_profiles` の本人の行(`role`、`display_name`、`is_active`)。行がない・`is_active = false` なら null。memory:Cookie のセッションIDから `memoryAuth.agentForSession`
  - `sendLoginCode(email: string, origin: string): Promise<{ ok: true; devCode?: string } | { ok: false; message: string }>` — supabase:`signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: origin + "/auth/confirm" } })`。memory:`devCode` にコードを入れて返す(画面に開発用として出す)
  - `verifyLoginCode(email: string, code: string): Promise<{ ok: true } | { ok: false; message: string }>` — supabase:`verifyOtp({ email, token, type: "email" })`。memory:成功したら Cookie(httpOnly、sameSite lax、本番は secure、30日)を置く
  - `signOutAgent(): Promise<void>`
  - `loginErrorMessage(error: { code?: string; status?: number; message?: string }): string`(`lib/auth/messages.ts`)— 登録されていない(`code` が `otp_disabled` / `signup_disabled` / `user_not_found`、またはメッセージに "Signups not allowed")→「このメールアドレスは登録されていません。管理者にお問い合わせください」。送りすぎ(`status` 429 / `over_email_send_rate_limit`)→「メールを続けて送ることはできません。1分ほど待ってからお試しください」。コードの誤り・期限切れ(`otp_expired`)→「確認コードが違うか、期限が切れています。もう一度メールを送ってください」。それ以外→「うまくいきませんでした。時間をおいてもう一度お試しください」
  - 入力の誤り:メールアドレスの形でない→「メールアドレスを確かめてください」、`normalizeCode` が null →「メールに書かれた6桁の数字を入れてください」
- [ ] **Step 1: 失敗するテストを書く** — `loginErrorMessage` の4種類(上の値をそのまま使う)。
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/unit/agent-auth.test.ts` で FAIL
- [ ] **Step 3: 実装する** — `getAgent` などの Cookie を使う関数は、ファイルの先頭に `import "server-only"` を置かない(パッケージが入っていない)。代わりに `next/headers` を使うことでサーバー専用になる
- [ ] **Step 4: 通ることを確かめる** — PASS
- [ ] **Step 5: lint・型・全テスト → コミット** — `エージェントのログイン: ログインの窓口とエラーの言葉を実装`

### Task 4: ログイン状態の更新と、メールのリンクの受け口

**Files:**
- Create: `lib/auth/routes.ts`
- Create: `proxy.ts`
- Create: `app/auth/confirm/route.ts`
- Test: `tests/unit/agent-routes.test.ts`

**Interfaces:**
- Consumes: タスク2・3のすべて
- Produces:
  - `agentRedirect(pathname: string, signedIn: boolean): string | null`(`lib/auth/routes.ts`)— `/agent/login` 以外の `/agent` 以下で未ログイン →`/agent/login`。`/agent/login` でログイン済み →`/agent`。それ以外は null
  - `confirmResult(ok: boolean): string` — 成功 →`/agent`、失敗 →`/agent/login?error=link`
  - `LOGIN_NOTICES: Record<"link", string>` — `link` →「リンクの期限が切れています。もう一度メールを送ってください」
  - `proxy.ts`:`config.matcher = ["/agent/:path*", "/auth/:path*"]`。supabase:`createServerClient` を request / response の Cookie で作り、`auth.getUser()` で更新し、`agentRedirect` に従う。memory:Cookie があるかだけで判断する(本当の確認は `app/agent/layout.tsx`)
  - `GET /auth/confirm?token_hash=…&type=email|invite|magiclink`:`verifyOtp({ token_hash, type })` → `confirmResult` へ移す。memory では常に失敗扱い
- [ ] **Step 1: 失敗するテストを書く** — `agentRedirect("/agent", false)` → `"/agent/login"`、`("/agent/seekers/1", false)` → `"/agent/login"`、`("/agent/login", false)` → null、`("/agent/login", true)` → `"/agent"`、`("/agent", true)` → null、`("/", false)` → null、`("/agentx", false)` → null。`confirmResult(true)` → `"/agent"`、`(false)` → `"/agent/login?error=link"`。`LOGIN_NOTICES.link` の文言。
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/unit/agent-routes.test.ts` で FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通ることを確かめる** — PASS
- [ ] **Step 5: lint・型・全テスト → コミット** — `エージェントのログイン: ログイン状態の更新とメールのリンクの受け口を実装`

### Task 5: ログインの画面と、エージェントの入口

**Files:**
- Create: `app/agent/login/page.tsx`、`components/agent/login-form.tsx`(client)、`app/agent/actions.ts`(Server Actions:`requestCode`、`submitCode`、`logout`)
- Create: `app/agent/(signed-in)/layout.tsx`(`getAgent()` が null なら `redirect("/agent/login")`。ヘッダーに「AI面接練習」「エージェント」とログアウト)、`app/agent/(signed-in)/page.tsx`(「担当の求職者」。段階Bまでは「まだ求職者がいません」と、表示名)
- Create: `e2e/agent-login.mjs`
- Modify: `e2e/run.sh`(`agent-login.mjs` を加える)、`e2e/README.md`(表に1行)、`.env.example`、`README.md`(環境変数の表、「エージェントの画面」の節)
- 画面部品は `components/app/ui.tsx` の `PageHeader`・`Card`・`TextInput`・`PrimaryButton`・`SecondaryButton`・`Notice` を使う

**Interfaces:**
- Consumes: タスク3の `sendLoginCode`・`verifyLoginCode`・`signOutAgent`・`getAgent`、タスク4の `LOGIN_NOTICES`
- 画面の流れ:メールアドレス →「ログインのメールを送る」→「メールを送りました。メールのボタンを押すか、6桁の確認コードを入れてください」+ コードの入力 +「ログインする」+「メールアドレスを入れ直す」。memory では「開発用の確認コード:123456」を出す。`?error=link` なら `LOGIN_NOTICES.link` を出す。ログインできたら `/agent`
- [ ] **Step 1: 失敗する e2e を書く** — `e2e/agent-login.mjs`(`browser.mjs` の `openPhone` を使う):`/agent` を開くと `/agent/login` に移る → メールアドレスを入れて送る → 開発用の確認コードを読み取り、全角で入れる → `/agent` で「担当の求職者」が出る → 再読み込みしてもログインしたまま → ログアウトで `/agent/login` に戻る → `/agent/login?error=link` で期限切れの案内が出る
- [ ] **Step 2: 失敗を確かめる** — `npm run build && cd e2e && npm test` / Expected: `agent-login` が FAIL(画面がない)
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通ることを確かめる** — `npm run lint && npm run typecheck && npm test && npm run build && (cd e2e && npm test)` / Expected: すべて成功(既存の product・mic-denied・history-retry も)
- [ ] **Step 5: コミット** — `エージェントのログイン: ログインの画面とエージェントの入口を実装`

# 段階B:エージェントの画面(求職者と応募先の登録、招待リンク)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログインしたエージェントが、求職者を登録・編集・削除し、求職者ごとに応募先を追加して招待リンクを作り、コピー・編集・停止できる(見本の①②③)。

**Architecture:** データの読み書きは `lib/agent-data/` の `AgentRepo`(エージェントの権限の範囲だけを扱う)に集め、Supabase 版(ログインしている人の権限で動き RLS が効く)とメモリ版を同じ形で用意する。一覧の点数・回数は共通の関数 `summarize*` で計算する。リンクの鍵は、サーバーの秘密の値とリンクのIDから HMAC で作り直せるようにし、データベースにはハッシュだけを置く。画面は Server Components で読み、書き込みは Server Actions(ログインの確認 → zod で検証 → `AgentRepo`)。

**Tech Stack:** Next.js 16.3(App Router、async `params`、Server Actions、`revalidatePath`)、zod 4、`@supabase/ssr`、Vitest、Playwright

**Spec:** [docs/superpowers/specs/2026-10-27-agent-invite-design.md](../specs/2026-10-27-agent-invite-design.md)(4.1、5章、9章の段階B)

## Global Constraints

- 段階Aの Global Constraints をそのまま守る(Next.js 16 の資料を読む、利用者の言葉、コメントに根拠の番号、日本語のコミット、push しない)。
- 上限は DB と同じ:名前 1〜100字、職種 ≤100字、経歴 ≤20000字、転職理由 ≤5000字、応募先の名前 1〜200字、職種・配属先 ≤200字、求人票 ≤20000字、選考段階 `first|second|final`、雰囲気 `gentle|standard|strict`、時間 `5|15|30`。
- 選考段階・雰囲気・時間の画面の言葉は、既存の `STAGE_CHOICES`・`STYLE_CHOICES`・`DURATION_CHOICES`(`features/app/interview-setup.ts`)を使う。
- リンクの URL は `<origin>/i#<鍵>`。鍵は 22 文字の base64url(128 ビット以上)。
- 新しい環境変数 `PRACTICE_LINK_SECRET`(32文字以上の乱数)。Supabase のときは必須、メモリ版のときは未設定ならサーバーを起動するたびに作る。`.env.example` と README に追記する。
- 画面は `components/app/ui.tsx` の部品を使い、スマホの幅で横にはみ出さない。
- 各タスクの最後に `npm run lint && npm run typecheck && npm test`。タスク4で `npm run build` と e2e(既存4本+新規)も通す。

## Review Focus

1. ほかのエージェントの求職者の URL を直接開く → 「この求職者は見つかりません」と出て、名前などは一切出ない(タスク2のテスト、タスク4の e2e)。
2. 保存ボタンを続けて押す → 求職者・リンクが2つできない(処理中はボタンを押せない。タスク3)。
3. コピーできない環境(LINE の中のブラウザ、http)→ リンクの文字を選べる形で出し、「長押ししてコピーしてください」と案内する(タスク3の `CopyLinkButton`)。
4. 求職者の削除 → 確認を挟み、リンクと練習の記録も消えることを書く(タスク3、タスク4の e2e)。
5. 止めたリンク → 一覧で「停止中」と分かり、コピーのボタンは出さず、「使えるようにする」で戻せる(タスク2のテスト、タスク4の e2e)。

---

### Task 1: リンクの鍵と入力の検証

**Files:**
- Create: `lib/practice-link/key.ts`
- Create: `lib/agent-data/schemas.ts`
- Test: `tests/unit/practice-link.test.ts`

**Interfaces:**
- Produces:
  - `linkSecret(env = process.env): string` — `PRACTICE_LINK_SECRET` があればそれ(32文字未満なら `Error("PRACTICE_LINK_SECRET が短すぎます")`)。なければ、`backendMode(env)` が `"supabase"` なら `Error("PRACTICE_LINK_SECRET が設定されていません")`、`"memory"` ならプロセスごとに1つ作った乱数(`globalThis` で共有)
  - `linkKey(linkId: string, secret: string): string` — HMAC-SHA256(secret, linkId) の先頭 16 バイトを base64url(22文字)
  - `hashLinkKey(key: string): string` — SHA-256 の16進
  - `linkUrl(origin: string, key: string): string` — `${origin}/i#${key}`
  - `seekerInputSchema`(zod)→ `SeekerInput = { name: string; occupation: string; careerSummary: string; reasonForChange: string }`(前後の空白を除く。名前が空 →「名前を入れてください」)
  - `linkInputSchema` → `LinkInput = { companyName: string; position: string; jobDescription: string; stage: Stage; style: Style; durationMin: 5 | 15 | 30 }`(応募先の名前が空 →「病院・会社の名前を入れてください」)
  - `firstIssue(error: z.ZodError): string` — 最初の問題の言葉
- [ ] **Step 1: 失敗するテストを書く** — 同じIDと秘密なら同じ鍵、IDか秘密が違えば違う鍵、鍵は `/^[A-Za-z0-9_-]{22}$/`。`hashLinkKey` は鍵と違う64文字の16進で、同じ鍵なら同じ。`linkUrl("https://x.example", "k")` → `"https://x.example/i#k"`。`linkSecret`:設定あり→その値、短い→throw、Supabase で未設定→throw、メモリで未設定→2回呼んで同じ値。`seekerInputSchema` は `" 山田 花子 "` → `"山田 花子"`、空の名前は「名前を入れてください」、101字は失敗。`linkInputSchema` は `durationMin: 20` で失敗、`stage: "fourth"` で失敗、空の応募先名は「病院・会社の名前を入れてください」。
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/unit/practice-link.test.ts` / Expected: FAIL(モジュールがない)
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通ることを確かめる** — PASS
- [ ] **Step 5: lint・型・全テスト → コミット** — `招待リンク: リンクの鍵の作り方と入力の検証を実装`

### Task 2: エージェントのデータの読み書き(AgentRepo)

**Files:**
- Create: `lib/agent-data/types.ts`、`lib/agent-data/summary.ts`、`lib/agent-data/memory-repo.ts`、`lib/agent-data/supabase-repo.ts`、`lib/agent-data/index.ts`
- Test: `tests/unit/agent-repo.test.ts`

**Interfaces:**
- Consumes: タスク1の `linkKey`・`hashLinkKey`・`linkSecret`・`SeekerInput`・`LinkInput`、段階Aの `Agent`・`backendMode`・`createSupabaseServerClient`
- Produces(`lib/agent-data/types.ts`):
  - `Seeker = SeekerInput & { id: string; advisorId: string; updatedAt: string }`
  - `PracticeLink = LinkInput & { id: string; seekerId: string; disabled: boolean; createdAt: string }`
  - `SessionRow = { id: string; linkId: string; seekerId: string; startedAt: string; score: number | null }`(`score` は評価が済んだときの `overall_score`)
  - `SeekerSummary = { id: string; name: string; occupation: string; linkCount: number; latestScore: number | null; latestAt: string | null }`
  - `LinkSummary = PracticeLink & { key: string; practiceCount: number; latestScore: number | null }`
  - `interface AgentRepo { listSeekers(): Promise<SeekerSummary[]>; getSeeker(id: string): Promise<Seeker | null>; createSeeker(input: SeekerInput): Promise<string>; updateSeeker(id: string, input: SeekerInput): Promise<boolean>; deleteSeeker(id: string): Promise<boolean>; listLinks(seekerId: string): Promise<LinkSummary[]>; getLink(seekerId: string, linkId: string): Promise<PracticeLink | null>; createLink(seekerId: string, input: LinkInput): Promise<string | null>; updateLink(seekerId: string, linkId: string, input: LinkInput): Promise<boolean>; setLinkDisabled(seekerId: string, linkId: string, disabled: boolean): Promise<boolean> }`(真偽値・null は「見つからない、または担当でない」)
  - `summarizeSeekers(seekers, links, sessions): SeekerSummary[]`(新しく登録した順。`latestScore`・`latestAt` は評価の済んだ最新の練習)、`summarizeLinks(links, sessions, keyFor: (linkId) => string): LinkSummary[]`(作った順。`practiceCount` は練習の数)
  - `agentRepo(agent: Agent): Promise<AgentRepo>`(`index.ts`。`backendMode()` で選ぶ)
  - メモリ版:`createMemoryRepo(agent: Agent, store?: MemoryData)`。`MemoryData = { seekers: Seeker[]; links: (PracticeLink & { keyHash: string })[]; sessions: SessionRow[] }`、既定は `globalThis` で共有する1つ。担当(`advisorId === agent.id`、admin はすべて)だけを扱う。求職者を消したらリンク・練習も消す
  - Supabase 版:`createSupabaseRepo(client: SupabaseClient, agent: Agent)`。RLS に任せて担当を絞り、`createSeeker` は `advisor_id: agent.id`、`createLink` は `id` を先に `randomUUID()` で作り `key_hash: hashLinkKey(linkKey(id, secret))` を入れる。練習の点数は `interview_sessions` と `evaluations(status, result)` から読む
- [ ] **Step 1: 失敗するテストを書く** — メモリ版で(テストごとに新しい `MemoryData`):A が求職者を作ると一覧に出て、B の一覧には出ない/B は A の求職者を `getSeeker` で null、`updateSeeker`・`deleteSeeker` で false、`listLinks` で空、`createLink` で null/A のリンクの `key` は `linkKey(id, secret)` と同じで、`keyHash` は `hashLinkKey(key)`/`setLinkDisabled(true)` で `disabled: true`、false で戻る/`updateLink` で内容が変わり `key` は変わらない/求職者を消すとリンクと練習も消える/admin は A と B の求職者を両方見られる。`summarizeSeekers`:練習なし→`latestScore: null`、評価済み2件と未評価の新しい1件→評価済みの新しい方の点数と日時、`linkCount` が正しい。`summarizeLinks`:`practiceCount` と `latestScore`。
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/unit/agent-repo.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通ることを確かめる** — PASS
- [ ] **Step 5: lint・型・全テスト → コミット** — `エージェントの画面: 求職者と招待リンクの読み書きを実装`

### Task 3: 画面(①②③)と Server Actions

**Files:**
- Create: `app/agent/(signed-in)/seekers/actions.ts`(Server Actions)
- Modify: `app/agent/(signed-in)/page.tsx`(①)
- Create: `app/agent/(signed-in)/seekers/new/page.tsx`、`app/agent/(signed-in)/seekers/[id]/page.tsx`(②)、`app/agent/(signed-in)/seekers/[id]/edit/page.tsx`、`app/agent/(signed-in)/seekers/[id]/links/new/page.tsx`、`app/agent/(signed-in)/seekers/[id]/links/[linkId]/edit/page.tsx`(③)
- Create: `components/agent/seeker-form.tsx`、`components/agent/link-form.tsx`、`components/agent/copy-link-button.tsx`、`components/agent/link-card-actions.tsx`、`components/agent/delete-seeker.tsx`(いずれも client)
- Create: `lib/agent-data/origin.ts` — `requestOrigin(): Promise<string>`(`headers()` の `x-forwarded-host`/`host` と `x-forwarded-proto`。`app/agent/actions.ts` の同じ処理もこれに置き換える)

**Interfaces:**
- Consumes: タスク1・2のすべて、段階Aの `getAgent`
- Server Actions(すべて最初に `getAgent()`。null なら `redirect("/agent/login")`。入力は zod で検証し、失敗なら `{ ok: false, message }` を返す。成功したら `revalidatePath("/agent", "layout")` して移る):
  - `saveSeeker(id: string | null, input: unknown)` → 新規は `/agent/seekers/<id>`、編集は同じ求職者の詳細へ
  - `removeSeeker(id: string)` → `/agent`
  - `saveLink(seekerId: string, linkId: string | null, input: unknown)` → `/agent/seekers/<seekerId>?created=<linkId>`(新規)/`/agent/seekers/<seekerId>`(編集)
  - `toggleLink(seekerId: string, linkId: string, disabled: boolean)` → `{ ok: true }`
  - 見つからない・担当でない → `{ ok: false, message: "この求職者は見つかりません" }`
- 画面:
  - ①:見本どおり。求職者のカード(名前・職種・「応募先 N件」・最新の点数と日付/「まだ練習していません」)は②へのリンク。「+ 求職者を追加」。0人なら「まだ求職者がいません。」
  - 求職者の追加・編集:名前・職種(`TextInput`)・経歴・転職理由(`TextArea`)。保存中はボタンを押せない
  - ②:求職者の情報(職種・経歴・転職理由の先頭。「直す」)、「応募先ごとの招待リンク」のカード(応募先・職種・選考段階・雰囲気・時間の言葉、「練習 N回・最新 M点」/「まだ練習していません」、止めたものは「停止中」)。止めていないカードに `CopyLinkButton` と「直す」「使えないようにする」、止めたカードに「使えるようにする」。`?created=<linkId>` のときは上に「招待リンクを作りました。LINE やメールで求職者に送ってください。」とそのリンクの URL・`CopyLinkButton`。「+ 応募先を追加してリンクを作る」。一番下に `DeleteSeeker`(「この求職者を削除」→「〇〇さんと、応募先・招待リンク・練習の記録をすべて削除します。元に戻せません。」→「削除する」/「やめる」)。見つからなければ「この求職者は見つかりません」と①へのリンク
  - ③:応募先の名前・職種・配属先・求人票(`TextArea`、ヒント「仕事内容・求める人物像など。求人サイトの文章をそのまま貼り付けて大丈夫です」)、選考段階・雰囲気・時間(`ChoiceGroup`、既定は二次・ふつう・15分)。ボタンは新規「招待リンクを作る」/編集「保存する」。編集では「直しても、リンクは変わりません。次の練習から新しい内容を使います」
  - `CopyLinkButton({ url })`:押すと `navigator.clipboard.writeText`。成功で「コピーしました」(2秒)。失敗・使えないときは URL を選べる文字で出し「長押ししてコピーしてください」
- [ ] **Step 1: 実装する**(画面のテストはタスク4の e2e で行う)
- [ ] **Step 2: 型・lint を通す** — `npm run lint && npm run typecheck` / Expected: エラーなし
- [ ] **Step 3: コミット** — `エージェントの画面: 求職者と応募先の登録、招待リンクの画面を実装`

### Task 4: e2e と資料

**Files:**
- Create: `e2e/agent-seekers.mjs`
- Modify: `e2e/run.sh`、`e2e/README.md`、`.env.example`、`README.md`(エージェントの画面の節と環境変数)
- Test: `e2e/agent-seekers.mjs`

**Interfaces:**
- Consumes: タスク3の画面。ログインは `e2e/agent-login.mjs` と同じ手順(開発用の確認コード)を `e2e/browser.mjs` に `agentLogin(page, email)` として切り出して使う
- [ ] **Step 1: e2e を書く** — エージェント A でログイン → 「+ 求職者を追加」で名前・職種・経歴・転職理由 → ②に移る → 「+ 応募先を追加してリンクを作る」で応募先・職種・求人票・二次・ふつう・15分 → ②で「招待リンクを作りました」と `/i#` + 22文字の URL、コピーで「コピーしました」(クリップボードの権限を与える) → 「直す」で職種を変えて保存、カードに反映され URL は同じ → 「使えないようにする」で「停止中」、コピーのボタンが消える → 「使えるようにする」で戻る → ①に「応募先 1件」 → 求職者を直す → 別のブラウザでエージェント B がログインし、A の求職者の URL を開くと「この求職者は見つかりません」で名前が出ない → A で求職者を削除(確認を挟む)→ ①が「まだ求職者がいません。」。各画面を `shot` で保存(はみ出し確認)
- [ ] **Step 2: 実行する** — `npm run build && (cd e2e && npm test)` / Expected: 新規を含む5本すべて OK(失敗したら systematic-debugging で原因を直す)
- [ ] **Step 3: 全体を確かめる** — `npm run lint && npm run typecheck && npm test` / Expected: エラーなし
- [ ] **Step 4: コミット** — `エージェントの画面: 求職者と招待リンクの e2e と資料を追加`

## 実行結果（2026-10-27、再開後）

- Task 1〜4の実装・検証完了。221件の単体テスト、lint・typecheck・build、e2e 5本成功。
- 前回のTask 1失敗を再現してから実装。Task 2のテストとUIのe2eは実装後に追加して検証した（当初のTDD順とは異なる）。
- `Seeker.createdAt`を追加し、編集で一覧の登録順が変わらないようにした。停止リンクは画面への鍵の受け渡しも省いた。
- Supabase接続形式の模擬テストを5件追加。RLSは段階AのPGliteテストを再実行。本物のSupabaseへの接続は未確認。
- e2eの終了処理は、この実行が起動したサーバーだけを停止する方式へ修正した。使用中のポートでは実行を中断する。
- 要件・基本設計もv0.16へ更新。リンク先の `/i` は段階Cであり未実装・未公開。
- コミットはタスクごとではなく段階Bをまとめる。外部へのpushは行わない。

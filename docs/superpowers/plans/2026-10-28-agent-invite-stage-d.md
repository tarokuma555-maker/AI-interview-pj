# 段階D:エージェントの結果画面と、結果の作り直し Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** エージェントが、求職者×応募先ごとの練習の一覧と、それぞれの結果・会話の記録を見られる(見本④)。結果の作成に失敗した練習や、作成中のまま止まった練習は、エージェントの④と求職者の画面の両方から作り直せる。

**Architecture:** エージェントの読み取りは `AgentRepo` に `listPractices` / `getPractice` を足す(ログインしている人の権限で読み、RLS が効く)。評価の書き込みはこれまでどおりサーバーの管理用の接続(`PracticeRepo`)だけが行い、`reopen`(作り直しの権利を1回だけ取る)を足す。評価を作って保存する処理は `lib/practice-link/evaluate.ts` の1か所にまとめ、終了時(`/api/practice` の finish)・求職者の作り直し(同 retry)・エージェントの作り直し(Server Action)の3か所から `after()` で呼ぶ。

**Tech Stack:** Next.js 16.3(`after`、Server Actions、async `params`)、Supabase(PostgREST・RPC)、PGlite(テスト)、Vitest、Playwright

**Spec:** [docs/superpowers/specs/2026-10-27-agent-invite-design.md](../specs/2026-10-27-agent-invite-design.md)(4.1 ④、6章、9章の段階D)

## Global Constraints

- 段階A〜Cの Global Constraints をそのまま守る(Next.js 16 の資料を読む、利用者の言葉、コメントに根拠の番号、日本語のコミット、push しない)。
- 「作成中のまま止まった」は、評価の状態が作成中で、最後の更新から **6分** 以上たったもの(評価の処理の上限 300 秒+余裕)。定数 `STALE_EVALUATION_MS = 6 * 60 * 1000`。
- 作り直せるのは、終了済み(会話を保存済み)で、評価が「失敗」または「止まった作成中」の練習だけ。同時に2回押しても、評価の処理は1回だけ動く。
- 評価の書き込みは管理用の接続だけ(RLS で一般のログインからは書けないまま)。エージェントの作り直しは、先に `AgentRepo.getPractice` で担当であることを確かめてから行う。
- 求職者の画面に「失敗」「エラー」などの言葉は出さない。「結果をまとめられませんでした」「もう一度まとめる」を使う。
- 各タスクの最後に `npm run lint && npm run typecheck && npm test`。タスク4で `npm run build` と e2e 全本も通す。

## Review Focus

1. 途中で画面を閉じた練習(会話を保存していない)→ エージェントの一覧に「途中で終わった練習」と出て、結果を作り直すボタンは出ない(タスク2のテスト、タスク3)。
2. 「結果を作り直す」を続けて2回押す/エージェントと求職者が同時に押す → 評価の処理は1回だけ(タスク1の `reopen` のテスト)。
3. 作成中になって間もない練習(6分未満)→ 作り直せない(タスク1のテスト)。
4. ほかのエージェントの求職者の練習の URL を直接開く → 「この練習は見つかりません」で中身は出ない(タスク2のテスト、タスク4の e2e)。
5. 回答がなかった練習(評価は済み・結果なし)→「回答がなかったため、結果はありません」と出て、作り直すボタンは出ない(タスク2・3)。

---

### Task 1: 評価の作り直しの権利(reopen)と、評価の処理の共通化

**Files:**
- Create: `supabase/migrations/20261028000000_reopen_evaluation.sql`
- Create: `lib/practice-link/evaluate.ts`
- Modify: `lib/practice-link/types.ts`、`lib/practice-link/memory-repo.ts`、`lib/practice-link/supabase-repo.ts`、`app/api/practice/route.ts`
- Test: `tests/unit/practice-db.test.ts`(追記)、`tests/unit/practice-session.test.ts`(追記)

**Interfaces:**
- Produces:
  - SQL 関数 `public.reopen_evaluation(p_link uuid, p_session uuid, p_stale_before timestamptz) returns boolean`(security invoker、`search_path = ''`、service_role だけが実行できる)。練習が `p_link` のもので `finished_at is not null`、評価が `failed`、または `pending` かつ `updated_at < p_stale_before` のときだけ、`status = 'pending'`・`attempts = attempts + 1`・`error = null`・`result = null` にして true。それ以外は false
  - `PracticeRepo.reopen(linkId: string, sessionId: string, now?: Date): Promise<boolean>`(メモリ版は同じ条件。メモリ版の `PracticeSession` に評価の更新日時 `evaluatedAt: string | null` を持たせる。Supabase 版は RPC)
  - `STALE_EVALUATION_MS = 6 * 60 * 1000`(`lib/practice-link/evaluate.ts`)
  - `canRetry(session: Pick<PracticeSession, "finishedAt" | "evaluation" | "evaluatedAt">, now?: Date): boolean` — 画面でボタンを出すかの判断(SQL と同じ条件)
  - `evaluatePractice(repo: PracticeRepo, linkId: string, session: PracticeSession, history: TurnRecord[], plan: QuestionPlan | null): Promise<void>` — いまの route の `after()` の中身(模擬AI/本物の評価 → `repo.complete`、回答なしは結果なしで完了、それ以外の失敗は failed)をそのまま移す
  - `/api/practice` の POST に `{ action: "retry", sessionId: uuid }` を足す:`repo.get` → なければ 404、`repo.reopen` が true なら `after(() => evaluatePractice(repo, target.id, session, session.history, session.plan))` して 202、false なら 409 `{ code: "NOT_RETRYABLE", message: "いまは作り直せません。少し待ってから開き直してください" }`。応答は `{ session }`(最新)
  - `PracticeSession` に `evaluatedAt: string | null` を足す(Supabase 版は `evaluations.updated_at`)
- [ ] **Step 1: 失敗するテストを書く** — `practice-db.test.ts`(PGlite):失敗した評価は reopen で true になり状態が pending・attempts が 2・result が null/続けてもう一度 reopen すると false(同時押し)/pending で更新が新しいものは false、`p_stale_before` を未来にすると true/終了していない練習は false/別のリンクの ID を渡すと false/done は false/authenticated のロールでは実行できない。`practice-session.test.ts`(メモリ版):同じ条件を `createMemoryPracticeRepo(store, clock)` で確かめる。`canRetry`:失敗→true、pending で5分→false、7分→true、未終了→false、done→false。route:`retry` で reopen できたら 202、できなければ 409 の文言
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/unit/practice-db.test.ts tests/unit/practice-session.test.ts tests/unit/practice-route.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通ることを確かめる** — 同じコマンドで PASS
- [ ] **Step 5: lint・型・全テスト → コミット** — `結果の作り直し: 止まった評価・失敗した評価を作り直す仕組みを実装`

### Task 2: エージェントの練習の読み取り(AgentRepo)

**Files:**
- Modify: `lib/agent-data/types.ts`、`lib/agent-data/memory-repo.ts`、`lib/agent-data/supabase-repo.ts`
- Test: `tests/unit/agent-repo.test.ts`(追記)、`tests/unit/agent-supabase-repo.test.ts`(追記)

**Interfaces:**
- Consumes: タスク1の `PracticeSession`(`evaluatedAt` つき)、`canRetry`
- Produces:
  - `PracticeSummary = { id: string; startedAt: string; finishedAt: string | null; score: number | null; status: "unfinished" | "preparing" | "done" | "no_answers" | "failed"; retryable: boolean }`(`unfinished`:会話を保存していない、`preparing`:作成中、`no_answers`:評価済みで結果なし)
  - `PracticeDetail = PracticeSummary & { linkId: string; history: TurnRecord[]; result: FeedbackResult | null; previousScore: number | null }`(`previousScore` は同じリンクで、それより前に結果が出た最新の練習の点数)
  - `AgentRepo.listPractices(seekerId: string, linkId: string): Promise<PracticeSummary[] | null>`(新しい順。担当でない・リンクがない → null)
  - `AgentRepo.getPractice(seekerId: string, linkId: string, sessionId: string): Promise<PracticeDetail | null>`
  - Supabase 版はログインしている人の接続で `interview_sessions`(`id,link_id,seeker_id,started_at,finished_at,history,evaluations(status,result,updated_at)`)を `seeker_id` と `link_id` で絞って読む(RLS が担当を絞る)。不正な ID は null
- [ ] **Step 1: 失敗するテストを書く** — メモリ版:A の練習(未終了・作成中・結果あり・回答なし・失敗)を入れて `listPractices` の `status`・`score`・`retryable` と並び順/B からは null/別の求職者の ID とリンクの組み合わせは null/`getPractice` の `history`・`result`・`previousScore`(結果のある1つ前の点数。間の失敗は飛ばす)/B からは null。Supabase 版:既存の模擬の書き方で、送る絞り込み(`seeker_id`・`link_id`・`id`)と、行から `PracticeSummary` への変換
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/unit/agent-repo.test.ts tests/unit/agent-supabase-repo.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通ることを確かめる** — PASS
- [ ] **Step 5: lint・型・全テスト → コミット** — `エージェントの画面: 練習の一覧と結果の読み取りを実装`

### Task 3: 画面(④と練習の結果)と作り直しの操作

**Files:**
- Create: `app/agent/(signed-in)/seekers/[id]/links/[linkId]/page.tsx`(④ 練習の一覧)、`app/agent/(signed-in)/seekers/[id]/links/[linkId]/practices/[sessionId]/page.tsx`(練習の結果)、`components/agent/retry-evaluation.tsx`(client)
- Modify: `app/agent/(signed-in)/seekers/actions.ts`(`retryEvaluation` を足す)、`app/agent/(signed-in)/seekers/[id]/page.tsx`(練習が1回以上あるカードに「結果を見る」)、`components/practice/practice-screen.tsx`(求職者の過去の練習で `canRetry` なら「もう一度まとめる」)、`features/practice/api.ts`(`retryPractice(key, sessionId)`)
- Test: タスク4の e2e

**Interfaces:**
- Consumes: タスク1の `practiceRepo().reopen`・`evaluatePractice`・`canRetry`、タスク2の `listPractices`・`getPractice`
- `retryEvaluation(seekerId: string, linkId: string, sessionId: string): Promise<{ ok: true } | { ok: false; message: string }>` — `requireAgentRepo()` → `getPractice` が null なら「この練習は見つかりません」/ `practiceRepo()` の `get(linkId, sessionId)` → `reopen` が false なら「いまは作り直せません。少し待ってから開き直してください」/ true なら `after(() => evaluatePractice(...))`、`revalidatePath` して `{ ok: true }`
- ④:見出し「〇〇さん・〇〇総合病院」、応募先の設定の言葉、練習のカード(日時(日本時間)・状態の言葉:`done` は「N点」、`preparing`「結果をまとめています」、`failed`「結果をまとめられませんでした」、`no_answers`「回答なし」、`unfinished`「途中で終わった練習」)。`unfinished` 以外は結果へのリンク。0件なら「まだ練習していません」。②へ戻るリンク
- 練習の結果:`done` は `ResultView`(前回との差つき)。`preparing`・`failed` は案内と会話の記録(開いた状態)、`retryable` なら `RetryEvaluation`(「結果を作り直す」→ 押したら「結果をまとめています。1分ほどしてから、この画面を開き直してください」と「開き直す」)。`no_answers` は「回答がなかったため、結果はありません」と会話の記録。`unfinished` は「途中で終わった練習のため、会話は保存されていません」。見つからなければ「この練習は見つかりません」と②へのリンク
- 求職者の画面:過去の練習の結果を開いて結果がなく `canRetry` のとき、「結果をまとめられませんでした」と「もう一度まとめる」。押したら同じ案内を出し、一覧を読み込み直す
- [ ] **Step 1: e2e を先に書く**(タスク4の Step 1)→ 失敗を確かめる
- [ ] **Step 2: 実装する**
- [ ] **Step 3: 型・lint を通す** — `npm run lint && npm run typecheck` / Expected: エラーなし
- [ ] **Step 4: コミット** — `エージェントの画面: 練習の一覧と結果、結果の作り直しの画面を実装`

### Task 4: e2e と資料

**Files:**
- Create: `e2e/agent-results.mjs`
- Modify: `e2e/run.sh`、`e2e/README.md`、`README.md`、`docs/design.md`・`docs/requirements.md`(段階Dの内容と改訂履歴)、`docs/handoff.md`、`T3_RESUME.md`

**Interfaces:**
- Consumes: `e2e/browser.mjs` の `agentLogin`、`e2e/practice-link.mjs` の求職者側の進め方(文字で答える面接)
- [ ] **Step 1: e2e を書く** — エージェント A がログインし、求職者と応募先を作ってリンクを得る → 別のブラウザでリンクを開き、文字で答える面接を1回終える(結果が出るまで待つ)→ もう1回始めて、回答の前に画面を閉じる(途中で終わった練習)→ A の②に「結果を見る」→ ④に2件(「N点」と「途中で終わった練習」)→ 結果を開くと点数・良かった点・会話の記録 → 途中で終わった練習には結果へのリンクがない → エージェント B でログインし、A の練習の結果の URL を開くと「この練習は見つかりません」。各画面を `shot` で保存(はみ出し確認)
- [ ] **Step 2: 実行する** — `npm run build && (cd e2e && npm test)` / Expected: 新規を含む全本 OK
- [ ] **Step 3: 資料を更新する** — 設計書・要件定義書の段階Dの記述と改訂履歴、README のエージェントの画面の節、引き継ぎ書、`T3_RESUME.md`
- [ ] **Step 4: 全体を確かめる** — `npm run lint && npm run typecheck && npm test` / Expected: エラーなし
- [ ] **Step 5: コミット** — `エージェントの画面: 結果画面の e2e と資料を追加`

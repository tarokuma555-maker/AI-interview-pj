import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

/** データベースの定義とアクセス制限(設計 2026-10-27 5章)を、PGlite で確かめる */

const STUB = readFileSync(new URL("../db/supabase-stub.sql", import.meta.url), "utf8");
const MIGRATION = readFileSync(new URL("../../supabase/migrations/20261027000000_agent_invite.sql", import.meta.url), "utf8");
const ACCESS_LOG = readFileSync(new URL("../../supabase/migrations/20261028000001_agent_access_logs.sql", import.meta.url), "utf8");

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const M = "00000000-0000-0000-0000-00000000000c";

let db: PGlite;

async function as(userId: string) {
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${userId}';`);
}
async function asAnon() {
  await db.exec(`reset role; set role anon; set request.jwt.claim.sub = '';`);
}
async function asServer() {
  await db.exec(`reset role; set request.jwt.claim.sub = '';`);
}
async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows;
}
async function addSeeker(advisorId: string, name = "山田 花子") {
  const [row] = await rows("insert into seekers (advisor_id, name) values ($1, $2) returning id", [advisorId, name]);
  return row.id as string;
}
async function addLink(seekerId: string, keyHash = `hash-${Math.random()}`) {
  const [row] = await rows(
    "insert into practice_links (seeker_id, key_hash, company_name, stage, style, duration_min) values ($1, $2, '〇〇総合病院', 'second', 'standard', 15) returning id",
    [seekerId, keyHash],
  );
  return row.id as string;
}
async function addSession(linkId: string, seekerId: string) {
  const [row] = await rows(
    "insert into interview_sessions (link_id, seeker_id, settings, context) values ($1, $2, '{}', '{}') returning id",
    [linkId, seekerId],
  );
  await rows("insert into evaluations (session_id) values ($1)", [row.id]);
  return row.id as string;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(MIGRATION);
  await db.exec(ACCESS_LOG);
  await rows("insert into auth.users (id, email) values ($1, 'agent-a@example.com'), ($2, 'agent-b@example.com')", [A, B]);
  await rows("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'manager@example.com', '{\"display_name\":\"管理 太郎\"}')", [M]);
  await rows("update user_profiles set role = 'admin' where id = $1", [M]);
});

describe("エージェントのプロフィール", () => {
  it("Auth にユーザーを追加すると、エージェントとして登録され、表示名はメールの「@」より前になる", async () => {
    expect(await rows("select role, display_name, is_active from user_profiles where id = $1", [A])).toEqual([
      { role: "advisor", display_name: "agent-a", is_active: true },
    ]);
    expect((await rows("select display_name from user_profiles where id = $1", [M]))[0].display_name).toBe("管理 太郎");
  });

  it("エージェントは自分の権限を管理者に変えられない", async () => {
    await as(A);
    await db.query("update user_profiles set role = 'admin' where id = $1", [A]).catch(() => undefined);
    await asServer();
    expect((await rows("select role from user_profiles where id = $1", [A]))[0].role).toBe("advisor");
  });
});

describe("求職者(担当のエージェントだけが扱える)", () => {
  it("自分の求職者は追加・参照でき、ほかのエージェントの求職者は見えず、変えられない", async () => {
    await as(A);
    const mine = await addSeeker(A);
    await as(B);
    const theirs = await addSeeker(B, "佐藤 美咲");
    await as(A);
    expect((await rows("select id from seekers")).map((r) => r.id)).toEqual([mine]);
    expect((await db.query("update seekers set name = 'x' where id = $1", [theirs])).affectedRows).toBe(0);
    expect((await db.query("delete from seekers where id = $1", [theirs])).affectedRows).toBe(0);
  });

  it("ほかのエージェントの担当として追加することはできない", async () => {
    await as(A);
    await expect(addSeeker(B)).rejects.toThrow();
  });

  it("管理者はすべての求職者を見られる", async () => {
    await as(A);
    await addSeeker(A);
    await as(B);
    await addSeeker(B);
    await as(M);
    expect(await rows("select id from seekers")).toHaveLength(2);
  });

  it("利用を止めたエージェントは、自分の求職者も見られない", async () => {
    await as(A);
    await addSeeker(A);
    await asServer();
    await rows("update user_profiles set is_active = false where id = $1", [A]);
    await as(A);
    expect(await rows("select id from seekers")).toHaveLength(0);
  });

  it("ログインしていなければ、どの表も見られない", async () => {
    await as(A);
    const seeker = await addSeeker(A);
    const link = await addLink(seeker);
    await asServer();
    await addSession(link, seeker);
    await asAnon();
    for (const table of ["user_profiles", "seekers", "practice_links", "interview_sessions", "evaluations"]) {
      const result = await db.query(`select * from ${table}`).then((r) => r.rows.length).catch(() => 0);
      expect(result, table).toBe(0);
    }
  });

  it("求職者を消すと、リンク・練習・評価も消える", async () => {
    await as(A);
    const seeker = await addSeeker(A);
    const link = await addLink(seeker);
    await asServer();
    await addSession(link, seeker);
    await as(A);
    await rows("delete from seekers where id = $1", [seeker]);
    await asServer();
    for (const table of ["practice_links", "interview_sessions", "evaluations"]) {
      expect(await rows(`select * from ${table}`), table).toHaveLength(0);
    }
  });
});

describe("招待リンクと練習の記録", () => {
  it("ほかのエージェントの求職者のリンクは見えず、リンクを追加することもできない", async () => {
    await as(B);
    const theirs = await addSeeker(B);
    await addLink(theirs);
    await as(A);
    expect(await rows("select id from practice_links")).toHaveLength(0);
    await expect(addLink(theirs)).rejects.toThrow();
  });

  it("練習の記録と評価は、担当のエージェントが見られるが、書き込めるのはサーバーだけ", async () => {
    await as(A);
    const seeker = await addSeeker(A);
    const link = await addLink(seeker);
    await expect(addSession(link, seeker)).rejects.toThrow();
    await asServer();
    await addSession(link, seeker);
    await as(A);
    expect(await rows("select id from interview_sessions")).toHaveLength(1);
    expect(await rows("select status from evaluations")).toEqual([{ status: "pending" }]);
    await as(B);
    expect(await rows("select id from interview_sessions")).toHaveLength(0);
    expect(await rows("select session_id from evaluations")).toHaveLength(0);
  });

  it("面接の設定は決まった値しか入らない", async () => {
    await as(A);
    const seeker = await addSeeker(A);
    await expect(
      rows("insert into practice_links (seeker_id, key_hash, company_name, stage, style, duration_min) values ($1, 'h', 'x', 'first', 'standard', 20)", [seeker]),
    ).rejects.toThrow();
  });
});

describe("求職者のデータを見た記録(要件 8.3)", () => {
  const log = (agent: string, seeker: string, action = "seeker_view") =>
    rows("insert into agent_access_logs (agent_id, seeker_id, action) values ($1, $2, $3)", [agent, seeker, action]);

  it("エージェントは自分の名前でだけ記録でき、記録を読めるのは管理者だけ", async () => {
    await as(A);
    const seeker = await addSeeker(A);
    await log(A, seeker);
    await expect(log(B, seeker)).rejects.toThrow();
    expect(await rows("select id from agent_access_logs")).toHaveLength(0);
    await as(M);
    expect(await rows("select agent_id, action from agent_access_logs")).toEqual([{ agent_id: A, action: "seeker_view" }]);
  });

  it("決まった種類の操作だけを記録し、記録は書き換え・削除できない", async () => {
    await as(A);
    const seeker = await addSeeker(A);
    await expect(log(A, seeker, "anything")).rejects.toThrow();
    await log(A, seeker, "seeker_view");
    await as(M);
    await expect(db.query("update agent_access_logs set action = 'practice_list'")).rejects.toThrow("permission denied");
    await expect(db.query("delete from agent_access_logs")).rejects.toThrow("permission denied");
  });

  it("求職者を削除しても、見た記録は残る", async () => {
    await as(A);
    const seeker = await addSeeker(A);
    await log(A, seeker);
    await rows("delete from seekers where id = $1", [seeker]);
    await asServer();
    expect(await rows("select seeker_id from agent_access_logs")).toEqual([{ seeker_id: seeker }]);
  });

  it("担当外・停止中・未ログインでは記録を追加できない", async () => {
    await as(A); const seeker = await addSeeker(A);
    await as(B); await expect(log(B, seeker)).rejects.toThrow();
    await asServer(); await rows("update user_profiles set is_active = false where id = $1", [A]);
    await as(A); await expect(log(A, seeker)).rejects.toThrow();
    await asAnon(); await expect(log(A, seeker)).rejects.toThrow();
  });

  it("結果の記録は同じ求職者の練習に限り、日時を偽って書けない", async () => {
    await as(A);
    const one = await addSeeker(A), two = await addSeeker(A), link = await addLink(one);
    await asServer(); const session = await addSession(link, one);
    await as(A);
    const view = (sid: string) => rows("insert into agent_access_logs (agent_id, seeker_id, session_id, action) values ($1, $2, $3, 'practice_view')", [A, sid, session]);
    await view(one);
    await expect(view(two)).rejects.toThrow();
    await expect(log(A, one, "practice_view")).rejects.toThrow();
    await expect(rows("insert into agent_access_logs (agent_id, seeker_id, action, created_at) values ($1, $2, 'seeker_view', '2000-01-01')", [A, one])).rejects.toThrow("permission denied");
    await as(M);
    await log(M, two);
    expect(await rows("select id from agent_access_logs")).toHaveLength(2);
    await asServer();
    await rows("delete from seekers where advisor_id = $1", [A]);
    await rows("delete from auth.users where id = $1", [A]);
    expect(await rows("select agent_id from agent_access_logs where session_id = $1", [session])).toEqual([{ agent_id: A }]);
  });
});

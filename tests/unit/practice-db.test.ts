import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, expect, it } from "vitest";
const read = (p: string) => readFileSync(new URL(p,import.meta.url),"utf8");
let db: PGlite;
const advisor = "00000000-0000-4000-8000-000000000001";
let sid: string, lid: string;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(read("../db/supabase-stub.sql"));
  await db.exec(read("../../supabase/migrations/20261027000000_agent_invite.sql"));
  await db.exec(read("../../supabase/migrations/20261027000001_practice_sessions.sql"));
  await db.query("insert into auth.users(id,email) values ($1,'a@example.com')",[advisor]);
  sid = (await db.query<{id:string}>("insert into seekers(advisor_id,name) values ($1,'架空求職者') returning id",[advisor])).rows[0].id;
  lid = (await db.query<{id:string}>("insert into practice_links(seeker_id,key_hash,company_name,stage,style,duration_min) values ($1,'hash','架空病院','second','standard',15) returning id",[sid])).rows[0].id;
});
afterEach(async () => { await db.close(); });
const start = async (n: number, hash = "hash") => (await db.query<{id:string}>("select start_practice($1,$2,'text','voice') as id",[hash,`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`])).rows[0].id;
it("開始を再送しても同じIDで、1日3回まで。別リンクの開始も制限する", async () => {
  const first = await start(1); expect(await start(1)).toBe(first);
  await start(2); await start(3); await expect(start(4)).rejects.toThrow("DAY_LIMIT");
  await db.query("insert into practice_links(seeker_id,key_hash,company_name,stage,style,duration_min) values ($1,'other','別病院','first','gentle',5)",[sid]);
  await expect(start(5,"other")).rejects.toThrow("DAY_LIMIT");
  const s = (await db.query<{settings:{stage:string};context:{companyName:string}}>("select settings,context from interview_sessions where id=$1",[first])).rows[0];
  expect(s.settings.stage).toBe("second"); expect(s.context.companyName).toBe("架空病院");
});
it("月30回を制限し、停止したリンクと無効な担当者では開始できない", async () => {
  await db.query("insert into interview_sessions(link_id,seeker_id,settings,context,started_at) select $1,$2,'{}','{}',date_trunc('month',now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo' from generate_series(1,30)",[lid,sid]);
  await expect(start(1)).rejects.toThrow("MONTH_LIMIT");
  await db.query("update practice_links set disabled_at=now() where id=$1",[lid]);
  await expect(start(1)).rejects.toThrow("INVALID_LINK");
  await db.query("update practice_links set disabled_at=null where id=$1",[lid]);
  await db.query("update user_profiles set is_active=false where id=$1",[advisor]);
  await expect(start(1)).rejects.toThrow("INVALID_LINK");
});
it("終了保存は一度だけ。違うリンクのIDでは書けない", async () => {
  const id = await start(1);
  expect((await db.query<{ok:boolean}>("select finish_practice($1,$2,'[]',null) as ok",[advisor,id])).rows[0].ok).toBe(false);
  expect((await db.query<{ok:boolean}>("select finish_practice($1,$2,'[{\"speaker\":\"candidate\",\"text\":\"回答\"}]',null) as ok",[lid,id])).rows[0].ok).toBe(true);
  expect((await db.query<{ok:boolean}>("select finish_practice($1,$2,'[]',null) as ok",[lid,id])).rows[0].ok).toBe(false);
  expect((await db.query("select * from evaluations")).rows).toHaveLength(1);
});
it("一般のログイン権限から開始・終了関数を直接呼べない", async () => {
  await db.exec("set role authenticated");
  await expect(start(1)).rejects.toThrow(/permission denied/);
  await expect(db.query("select finish_practice($1,$2,'[]',null)",[lid,advisor])).rejects.toThrow(/permission denied/);
});

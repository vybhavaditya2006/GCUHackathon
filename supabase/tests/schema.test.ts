// Runs the migrations + seed.sql in an in-process Postgres (PGlite) with a small
// stand-in for Supabase's roles and auth schema, then checks the ledger, RLS and
// the state-changing functions. It does not talk to the real Supabase project.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const P1 = "b0000000-0000-4000-8000-000000000001";
const P2 = "b0000000-0000-4000-8000-000000000002";
const M1 = "c0000000-0000-4000-8000-000000000001";
const M2 = "c0000000-0000-4000-8000-000000000002";
const M3 = "c0000000-0000-4000-8000-000000000003";
const user = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ANJALI = user(1), KIRAN = user(2), PRIYA = user(3), ARJUN = user(4), MEERA = user(5);
const ROHAN = user(6), ADMIN = user(7), SANA = user(8), DEV = user(9), ANANYA = user(10);
const SHA = "ab".repeat(32);

let db: PGlite;

/** Run a query the way the browser would: as `authenticated`, with RLS, as this user. */
async function asUser<T>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await db.exec("set local role authenticated");
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("rollback");
  }
}

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const verify = () =>
  one<{ ok: boolean; broken_at: number | null; checked: number }>("select * from ledger_verify()");

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(read("./supabase_stub.sql"));
  await db.exec(read("../migrations/001_schema.sql"));
  await db.exec(read("../migrations/002_work_functions.sql"));
  await db.exec(read("../migrations/003_agent_functions.sql"));
  await db.exec(read("../migrations/004_corner_cases.sql"));
  await db.exec(read("../migrations/005_tasks_versions.sql"));
  await db.exec(read("../seed.sql"));
}, 120_000);

describe("seed", () => {
  it("creates the demo story and a valid chain", async () => {
    const counts = await one<{ users: number; projects: number; entries: number }>(
      `select (select count(*)::int from profiles) as users,
              (select count(*)::int from projects) as projects,
              (select count(*)::int from ledger) as entries`,
    );
    expect(counts).toEqual({ users: 13, projects: 2, entries: 46 });
    expect(await verify()).toMatchObject({ ok: true, broken_at: null, checked: 46 });
  });

  it("has reviewed impacts 5 / 3 / 2 for Priya / Arjun / Meera on milestone 1", async () => {
    const { rows } = await db.query<{ author_id: string; impact: number }>(
      `select c.author_id, sum(r.impact)::int as impact
         from reviews r join contributions c on c.id = r.contribution_id
        where c.milestone_id = $1 group by c.author_id`,
      [M1],
    );
    expect(Object.fromEntries(rows.map((r) => [r.author_id, r.impact]))).toEqual({
      [PRIYA]: 5, [ARJUN]: 3, [MEERA]: 2,
    });
  });

  it("keeps ledger time moving forwards and links rows to their entries", async () => {
    const order = await one<{ bad: number }>(
      `select count(*)::int as bad from (select ts, lag(ts) over (order by seq) as prev from ledger) t where ts < prev`,
    );
    expect(order.bad).toBe(0);
    const unlinked = await one<{ n: number }>(
      `select (select count(*) from contributions where ledger_seq is null)::int
            + (select count(*) from reviews where ledger_seq is null)::int as n`,
    );
    expect(unlinked.n).toBe(0);
  });

  it("splits the milestones into owned tasks, closed by contributions", async () => {
    const { rows } = await db.query<{ status: string; n: number }>(
      "select status, count(*)::int as n from tasks where project_id = $1 group by status", [P1]);
    expect(Object.fromEntries(rows.map((r) => [r.status, r.n]))).toEqual({ todo: 3, in_review: 1, done: 4 });
    const stray = await one<{ n: number }>(
      `select count(*)::int as n from tasks t left join contributions c on c.id = t.contribution_id
        where (t.status = 'done') <> (c.id is not null) or c.author_id <> t.owner_id or c.milestone_id <> t.milestone_id`,
    );
    expect(stray.n).toBe(0); // done means a contribution by the task's owner on the same milestone
  });

  it("records Meera's training run as v2 replacing her flagged notes, in the table and the ledger", async () => {
    const row = await one<{ version: number; parent: string; parent_version: number; payload: Record<string, unknown> }>(
      `select c.version, p.artefact_name as parent, p.version as parent_version, l.payload
         from contributions c join contributions p on p.id = c.builds_on join ledger l on l.seq = c.ledger_seq
        where c.artefact_name = 'train_v2.ipynb'`,
    );
    expect(row).toMatchObject({ version: 2, parent: "cnn_notes.md", parent_version: 1 });
    expect(row.payload).toMatchObject({ version: 2, builds_on_title: "Baseline CNN notes", builds_on_version: 1 });
    const others = await one<{ n: number }>("select count(*)::int as n from contributions where version <> 1 or builds_on is not null");
    expect(others.n).toBe(1);
  });

  it("can be re-run without duplicating anything", async () => {
    await db.exec(read("../migrations/005_tasks_versions.sql"));
    await db.exec(read("../seed.sql"));
    expect(await verify()).toMatchObject({ ok: true, checked: 46 });
    expect((await one<{ n: number }>("select count(*)::int as n from tasks")).n).toBe(11);
  });
});

describe("ledger", () => {
  it("refuses an agent entry without a human owner", async () => {
    await expect(
      db.query("select ledger_append($1, 'agent:research', null, 'AGENT_ACTION', '{}')", [P1]),
    ).rejects.toThrow(/needs a human owner/);
  });

  it("refuses an unknown event", async () => {
    await expect(
      db.query("select ledger_append($1, $2, null, 'MADE_UP', '{}')", [P1, ANJALI]),
    ).rejects.toThrow(/ledger_known_event/);
  });

  it("is append-only", async () => {
    await expect(db.exec("update ledger set payload = '{}' where seq = 1")).rejects.toThrow(/append-only/);
    await expect(db.exec("delete from ledger where seq = 1")).rejects.toThrow(/append-only/);
    await expect(db.exec("truncate ledger")).rejects.toThrow(/append-only/);
  });

  it("verify points at the exact tampered entry, then passes once restored", async () => {
    const target = await one<{ seq: number; payload: unknown }>(
      `select seq::int, payload from ledger where event = 'CONTRIBUTION_ADDED' and payload ->> 'artefact' = 'preprocess.py'`,
    );
    await db.exec("alter table ledger disable trigger ledger_append_only");
    await db.query(`update ledger set payload = jsonb_set(payload, '{ai_share}', '0.1') where seq = $1`, [target.seq]);
    await db.exec("alter table ledger enable trigger ledger_append_only");
    expect(await verify()).toMatchObject({ ok: false, broken_at: target.seq });

    await db.exec("alter table ledger disable trigger ledger_append_only");
    await db.query(`update ledger set payload = jsonb_set(payload, '{ai_share}', '0.7') where seq = $1`, [target.seq]);
    await db.exec("alter table ledger enable trigger ledger_append_only");
    expect(await verify()).toMatchObject({ ok: true });
  });
});

describe("row-level security", () => {
  const brief = (uid: string, project: string) =>
    asUser<{ content: string }>(uid, "select content from project_briefs where project_id = $1", [project]);

  it("unlocks the brief only for the sponsor and members on the latest charter", async () => {
    expect(await brief(ANJALI, P1)).toHaveLength(1);
    expect(await brief(PRIYA, P1)).toHaveLength(1);
    expect(await brief(ROHAN, P1)).toHaveLength(0); // not a member
    expect(await brief(SANA, P1)).toHaveLength(0); // member of another project
    expect(await brief(ANANYA, P2)).toHaveLength(0); // invited, not accepted
    expect(await brief(ADMIN, P1)).toHaveLength(0); // admins audit the ledger, not the brief
  });

  it("scopes the ledger to project members and admins", async () => {
    const count = async (uid: string) =>
      (await asUser<{ n: number }>(uid, "select count(*)::int as n from ledger"))[0].n;
    expect(await count(ROHAN)).toBe(0);
    expect(await count(ADMIN)).toBe(46);
    const priya = await asUser<{ project_id: string }>(PRIYA, "select distinct project_id from ledger");
    expect(priya.map((r) => r.project_id)).toEqual([P1]);
  });

  it("gives signed-in users no direct write path", async () => {
    await expect(
      asUser(PRIYA, "insert into ledger (seq, ts, actor, event, prev_hash, hash) values (999, now(), 'x', 'CORRECTION', 'x', 'x')"),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(PRIYA, "update memberships set active_fraction = 1")).rejects.toThrow(/permission denied/);
    await expect(
      asUser(PRIYA, "select ledger_append($1, $2, null, 'CORRECTION', '{}')", [P1, PRIYA]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(ANANYA, "select accept_charter($1, $2, true)", [P1, ANANYA]),
    ).rejects.toThrow(/permission denied/);
  });

  it("scopes tasks to the project team and admins, read-only", async () => {
    const projects = async (uid: string) =>
      (await asUser<{ project_id: string }>(uid, "select distinct project_id from tasks order by 1")).map((r) => r.project_id);
    expect(await projects(ROHAN)).toEqual([]); // not a member
    expect(await projects(PRIYA)).toEqual([P1]);
    expect(await projects(SANA)).toEqual([P2]);
    expect(await projects(ANANYA)).toEqual([]); // invited, not accepted
    expect(await projects(ADMIN)).toEqual([P1, P2]);
    await expect(asUser(PRIYA, "update tasks set status = 'done'")).rejects.toThrow(/permission denied/);
    await expect(
      asUser(PRIYA, "insert into tasks (project_id, milestone_id, title, owner_id) values ($1, $2, 'x', $3)", [P1, M2, PRIYA]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(MEERA, "select add_contribution($1, $2, 't', 'f', $3, '', null, 0, 0, null)", [M2, MEERA, SHA]),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets any signed-in user run verify", async () => {
    const rows = await asUser<{ ok: boolean }>(ROHAN, "select ok from ledger_verify()");
    expect(rows[0].ok).toBe(true);
  });
});

describe("state-changing functions (each writes its ledger entry)", () => {
  it("accept_charter: needs an invite and the model acknowledgement, then unlocks the brief", async () => {
    await expect(db.query("select accept_charter($1, $2, true)", [P2, ROHAN])).rejects.toThrow(/not invited/);
    await expect(db.query("select accept_charter($1, $2, false)", [P2, ANANYA])).rejects.toThrow(/must be acknowledged/);

    const res = await one<{ r: { seq: number; charter_version: number } }>(
      "select accept_charter($1, $2, true) as r", [P2, ANANYA]);
    expect(res.r.charter_version).toBe(1);

    const entry = await one<{ event: string; actor: string }>("select event, actor from ledger where seq = $1", [res.r.seq]);
    expect(entry).toEqual({ event: "CHARTER_ACCEPTED", actor: ANANYA });
    expect(
      await asUser(ANANYA, "select 1 from project_briefs where project_id = $1", [P2]),
    ).toHaveLength(1);
  });

  it("a new charter version re-locks the brief until re-accepted", async () => {
    await db.query(
      `insert into charters (project_id, version, model, terms, published_by)
       select project_id, 2, 'knowledge_sharing', terms, published_by from charters where project_id = $1 and version = 1`,
      [P2],
    );
    const locked = () => asUser(SANA, "select 1 from project_briefs where project_id = $1", [P2]);
    expect(await locked()).toHaveLength(0);
    await db.query("select accept_charter($1, $2, true)", [P2, SANA]);
    expect(await locked()).toHaveLength(1);
  });

  it("fund_escrow: sponsor only, draft milestones with an amount only", async () => {
    await expect(db.query("select fund_escrow($1, $2)", [M1, ANJALI])).rejects.toThrow(/expected draft/);
    await db.query("update milestones set amount = 0 where id = $1", [M2]);
    await expect(db.query("select fund_escrow($1, $2)", [M2, ANJALI])).rejects.toThrow(/no amount/);
    await db.query("update milestones set amount = 40000 where id = $1", [M2]);
    await expect(db.query("select fund_escrow($1, $2)", [M2, PRIYA])).rejects.toThrow(/only the project sponsor/);

    const res = await one<{ r: { seq: number; reference: string } }>("select fund_escrow($1, $2) as r", [M2, ANJALI]);
    expect(res.r.reference).toMatch(/^SIM-ESC-/);
    const ms = await one<{ status: string }>("select status from milestones where id = $1", [M2]);
    expect(ms.status).toBe("funded");
    const entry = await one<{ event: string }>("select event from ledger where seq = $1", [res.r.seq]);
    expect(entry.event).toBe("ESCROW_FUNDED");
  });

  it("add_contribution: members only, and a copied file is flagged", async () => {
    const add = (author: string, similarity: number) =>
      one<{ r: { flagged: boolean; seq: number; flag_seq: number | null } }>(
        "select add_contribution($1, $2, 'Quantised model', 'model.tflite', $3, 'No AI used.', null, 0, $4) as r",
        [M2, author, SHA, similarity],
      );
    await expect(add(ROHAN, 0)).rejects.toThrow(/active member/);
    await expect(
      db.query("select add_contribution($1, $2, 't', 'f', 'not-a-hash', '', null, 0, 0)", [M2, MEERA]),
    ).rejects.toThrow(/SHA-256/);

    const clean = await add(MEERA, 0.1);
    expect(clean.r).toMatchObject({ flagged: false, flag_seq: null });

    const copied = await add(MEERA, 0.82);
    expect(copied.r.flagged).toBe(true);
    const flag = await one<{ event: string; actor: string; on_behalf_of: string }>(
      "select event, actor, on_behalf_of from ledger where seq = $1", [copied.r.flag_seq]);
    expect(flag).toEqual({ event: "SIMILARITY_FLAGGED", actor: "agent:integrity", on_behalf_of: MEERA });
  });

  it("add_contribution: a new version builds on an earlier contribution and the ledger links them", async () => {
    const parent = await one<{ id: string }>(
      "select id from contributions where milestone_id = $1 and not flagged order by created_at limit 1", [M2]);
    const add = (buildsOn: string | null, author = ARJUN) =>
      one<{ r: { contribution_id: string; version: number; seq: number } }>(
        "select add_contribution($1, $2, 'Quantised model, smaller', 'model_v2.tflite', $3, 'No AI used.', null, 0, 0, $4) as r",
        [M2, author, SHA, buildsOn],
      );

    // Anyone on the team can build on a teammate's work: that is how pieces are combined.
    const v2 = await add(parent.id);
    expect(v2.r.version).toBe(2);
    const v3 = await add(v2.r.contribution_id, MEERA);
    expect(v3.r.version).toBe(3);

    const entry = await one<{ payload: Record<string, unknown> }>("select payload from ledger where seq = $1", [v3.r.seq]);
    expect(entry.payload).toMatchObject({
      version: 3, builds_on: v2.r.contribution_id, builds_on_title: "Quantised model, smaller", builds_on_version: 2,
    });
    // The earlier versions are still there, untouched.
    const kept = await one<{ versions: number[] }>(
      `select array_agg(version order by version) as versions from contributions
        where id in ($1, $2, $3)`, [parent.id, v2.r.contribution_id, v3.r.contribution_id]);
    expect(kept.versions).toEqual([1, 2, 3]);

    const elsewhere = await one<{ id: string }>("select id from contributions where project_id = $1 limit 1", [P2]);
    await expect(add(elsewhere.id)).rejects.toThrow(/not in this project/);
    await expect(add("d0000000-0000-4000-8000-00000000ffff")).rejects.toThrow(/not in this project/);

    const fresh = await one<{ payload: Record<string, unknown> }>(
      "select payload from ledger where seq = $1", [(await add(null)).r.seq]);
    expect(fresh.payload).toMatchObject({ version: 1 });
    expect(fresh.payload).not.toHaveProperty("builds_on");
  });

  it("agent drafts: need a human owner on the team, and only approval makes a contribution", async () => {
    const record = (owner: string, agent = "research") =>
      one<{ r: { draft_id: string; seq: number } }>(
        `select record_agent_draft($1, $2, $3, $4, 'pasted notes', '{"content":"draft"}'::jsonb, 'test-model', 120, 80, 1, 'Draft note') as r`,
        [P1, M2, agent, owner],
      );
    await expect(record(ROHAN)).rejects.toThrow(/active member who accepted/);
    await expect(record(MEERA, "made_up")).rejects.toThrow(/unknown agent/);

    const draft = await record(MEERA);
    const action = await one<{ event: string; actor: string; on_behalf_of: string }>(
      "select event, actor, on_behalf_of from ledger where seq = $1", [draft.r.seq]);
    expect(action).toEqual({ event: "AGENT_ACTION", actor: "agent:research", on_behalf_of: MEERA });
    const before = await one<{ n: number }>(
      "select count(*)::int as n from contributions where agent_used = 'research' and milestone_id = $1", [M2]);
    expect(before.n).toBe(0); // a draft is not a contribution

    const approve = (owner: string) =>
      one<{ r: { contribution_id: string } }>(
        "select approve_agent_draft($1, $2, 'Agent note', 'research_draft.md', $3, 0.8, 'Drafted by the agent; I checked it.', true) as r",
        [draft.r.draft_id, owner, SHA],
      );
    await expect(approve(ARJUN)).rejects.toThrow(/only the human who owns/);
    const approved = await approve(MEERA);
    const made = await one<{ author_id: string; agent_used: string; ai_share: number; status: string }>(
      `select c.author_id, c.agent_used, c.ai_share::float as ai_share, d.status
         from contributions c join agent_drafts d on d.contribution_id = c.id where c.id = $1`,
      [approved.r.contribution_id],
    );
    expect(made).toEqual({ author_id: MEERA, agent_used: "research", ai_share: 0.8, status: "approved" });
    await expect(approve(MEERA)).rejects.toThrow(/already approved/);
  });

  it("scoping approval and invitations are sponsor-only and land in the ledger", async () => {
    const scope = await one<{ r: { draft_id: string } }>(
      `select record_agent_draft($1, null, 'scoping', $2, 'summary + brief', '{}'::jsonb, 'test-model', 10, 10, 0, 'Proposed scope') as r`,
      [P1, ANJALI],
    );
    const milestones = JSON.stringify([{ title: "Extra milestone", requiredSkills: ["CNN"], acceptanceCriteria: "Works" }]);
    await expect(
      db.query("select approve_scoping_draft($1, $2, $3::jsonb)", [scope.r.draft_id, PRIYA, milestones]),
    ).rejects.toThrow(/only the project sponsor/);
    const ok = await one<{ r: { milestones_created: boolean; seq: number } }>(
      "select approve_scoping_draft($1, $2, $3::jsonb) as r", [scope.r.draft_id, ANJALI, milestones]);
    expect(ok.r.milestones_created).toBe(false); // the project already has milestones
    const entry = await one<{ event: string }>("select event from ledger where seq = $1", [ok.r.seq]);
    expect(entry.event).toBe("MILESTONES_APPROVED");

    await expect(db.query("select invite_member($1, $2, $3, 'student')", [P1, PRIYA, DEV])).rejects.toThrow(/only the project sponsor/);
    await expect(db.query("select invite_member($1, $2, $3, 'student')", [P1, ANJALI, MEERA])).rejects.toThrow(/already invited or on the team/);
    await expect(db.query("select invite_member($1, $2, $3, 'expert')", [P1, ANJALI, DEV])).rejects.toThrow(/not a registered expert/);
    await db.query("select invite_member($1, $2, $3, 'student')", [P1, ANJALI, DEV]);
    const invited = await one<{ status: string }>(
      "select status from memberships where project_id = $1 and user_id = $2", [P1, DEV]);
    expect(invited.status).toBe("invited");
  });

  it("review agent draft: only the expert who owns it can confirm it", async () => {
    const draft = await one<{ r: { draft_id: string } }>(
      `select record_agent_draft($1, $2, 'review', $3, 'criteria + submission', '{"criteria":[]}'::jsonb, 'test-model', 10, 10, 0, 'Criteria check') as r`,
      [P1, M2, KIRAN],
    );
    await expect(db.query("select confirm_review_draft($1, $2)", [draft.r.draft_id, PRIYA])).rejects.toThrow(/only the expert who owns/);
    const ok = await one<{ r: { seq: number } }>("select confirm_review_draft($1, $2, 'Checked.') as r", [draft.r.draft_id, KIRAN]);
    const entry = await one<{ event: string; agent: string }>(
      "select event, payload ->> 'agent' as agent from ledger where seq = $1", [ok.r.seq]);
    expect(entry).toEqual({ event: "AGENT_DRAFT_APPROVED", agent: "review" });
    await expect(db.query("select confirm_review_draft($1, $2)", [draft.r.draft_id, KIRAN])).rejects.toThrow(/already approved/);
  });

  it("add_review and submit_milestone: expert reviews, the lead submits, reviews then close", async () => {
    const clean = await one<{ id: string }>(
      "select id from contributions where milestone_id = $1 and not flagged order by created_at limit 1", [M2]);
    const review = (reviewer: string, verdict = "approved", impact = 7) =>
      one<{ r: { seq: number; impact: number } }>(
        "select add_review($1, $2, $3::review_verdict, $4, 'Solid work.') as r", [clean.id, reviewer, verdict, impact]);

    await expect(db.query("select submit_milestone($1, $2)", [M2, PRIYA])).rejects.toThrow(/nothing to submit/);
    await expect(review(PRIYA)).rejects.toThrow(/only an active expert/);
    await expect(review(KIRAN, "approved", 11)).rejects.toThrow(/between 0 and 10/);

    const done = await review(KIRAN);
    expect(done.r.impact).toBe(7);
    const entry = await one<{ event: string; actor: string; author: string }>(
      "select event, actor, payload ->> 'author_id' as author from ledger where seq = $1", [done.r.seq]);
    expect(entry).toEqual({ event: "REVIEW_DONE", actor: KIRAN, author: MEERA });
    await expect(review(KIRAN)).rejects.toThrow(/already been reviewed/);

    await expect(db.query("select submit_milestone($1, $2)", [M2, ARJUN])).rejects.toThrow(/team lead or the expert/);
    const sub = await one<{ r: { seq: number } }>("select submit_milestone($1, $2) as r", [M2, PRIYA]);
    const state = await one<{ status: string; event: string }>(
      "select (select status from milestones where id = $1) as status, (select event from ledger where seq = $2) as event",
      [M2, sub.r.seq]);
    expect(state).toEqual({ status: "submitted", event: "MILESTONE_SUBMITTED" });

    const flaggedOne = await one<{ id: string }>("select id from contributions where milestone_id = $1 and flagged", [M2]);
    await expect(
      db.query("select add_review($1, $2, 'rejected', 0, '')", [flaggedOne.id, KIRAN]),
    ).rejects.toThrow(/reviews are closed/);
  });

  it("accept_milestone: releases escrow, stores payouts with receipts, and RLS scopes them", async () => {
    const payouts = [
      { user_id: KIRAN, amount: 25500, receipt: { lines: ["Expert share: 30% of 85,000"] } },
      { user_id: PRIYA, amount: 25783, receipt: { lines: ["Equal 7,933 + weighted 17,850"] } },
      { user_id: ARJUN, amount: 18643, receipt: { lines: ["Equal 7,933 + weighted 10,710"] } },
      { user_id: MEERA, amount: 15074, receipt: { lines: ["Equal 7,934 + weighted 7,140"] } },
    ];
    const credentials = [{ user_id: PRIYA, title: "Lead contributor credential" }];
    const call = (actor: string, list: unknown, version = 1) =>
      db.query("select accept_milestone($1, $2, $3, $4::jsonb, $5::jsonb, '{}'::jsonb) as r", [
        M1, actor, version, JSON.stringify(list), JSON.stringify(credentials),
      ]);

    await expect(call(PRIYA, payouts)).rejects.toThrow(/only the project sponsor or an admin/);
    await expect(call(ANJALI, payouts, 2)).rejects.toThrow(/latest is v1/);
    await expect(call(ANJALI, [{ user_id: KIRAN, amount: 100001 }])).rejects.toThrow(/exceed/);

    await call(ANJALI, payouts);
    const state = await one<{ ms: string; escrow: string; paid: number; events: number }>(
      `select (select status from milestones where id = $1) as ms,
              (select status from escrows where milestone_id = $1) as escrow,
              (select sum(amount)::int from payouts where milestone_id = $1) as paid,
              (select count(*)::int from ledger where project_id = $2
                 and event in ('MILESTONE_ACCEPTED', 'PAYOUT_ISSUED', 'CREDENTIAL_ISSUED')) as events`,
      [M1, P1],
    );
    expect(state).toEqual({ ms: "accepted", escrow: "released", paid: 85000, events: 6 });
    await expect(call(ANJALI, payouts)).rejects.toThrow(/expected submitted/);

    const seen = async (uid: string) =>
      (await asUser<{ n: number }>(uid, "select count(*)::int as n from payouts"))[0].n;
    expect(await seen(ARJUN)).toBe(1); // own row only
    expect(await seen(ANJALI)).toBe(4); // sponsor sees the project's
    expect(await seen(ROHAN)).toBe(0);
  });

  it("accept_milestone on the non-monetary project issues credentials and no payouts", async () => {
    await db.query(
      "select accept_milestone($1, $2, 2, $3::jsonb, $4::jsonb, '{}'::jsonb)",
      [M3, ANJALI, JSON.stringify([{ user_id: SANA, amount: 0, receipt: { lines: ["No payment: knowledge-sharing project"] } }]),
       JSON.stringify([{ user_id: SANA, title: "Certificate of contribution" }, { user_id: DEV, title: "Certificate of contribution" }])],
    );
    const res = await one<{ payouts: number; creds: number }>(
      `select (select count(*)::int from payouts where milestone_id = $1) as payouts,
              (select count(*)::int from ledger where project_id = $2 and event = 'CREDENTIAL_ISSUED') as creds`,
      [M3, P2],
    );
    expect(res).toEqual({ payouts: 0, creds: 2 });
  });

  it("leaves the chain valid after all of the above", async () => {
    expect(await verify()).toMatchObject({ ok: true, broken_at: null });
  });
});

describe("corner cases (004)", () => {
  const status = (table: string, where: string, params: unknown[]) =>
    one<{ status: string }>(`select status from ${table} where ${where}`, params).then((r) => r.status);

  it("unfair rejection: must cite a criterion, can be disputed, and the dispute freezes escrow", async () => {
    const reject = (actor: string, criterion: string) =>
      db.query("select reject_milestone($1, $2, $3, 'Not convinced.')", [M2, actor, criterion]);
    await expect(reject(PRIYA, "Model < 10 MB")).rejects.toThrow(/only the project sponsor/);
    await expect(reject(ANJALI, "  ")).rejects.toThrow(/must cite the acceptance criterion/);
    await reject(ANJALI, "Model < 10 MB");
    expect(await status("milestones", "id = $1", [M2])).toBe("rejected");

    await expect(db.query("select raise_dispute($1, $2, 'Unfair')", [M2, ROHAN])).rejects.toThrow(/active team member/);
    const raised = await one<{ r: { dispute_id: string; escrow_frozen: number } }>(
      "select raise_dispute($1, $2, 'The model is 6.8 MB; the criterion was met.') as r", [M2, PRIYA]);
    expect(raised.r.escrow_frozen).toBe(40000);
    expect(await status("milestones", "id = $1", [M2])).toBe("disputed");
    expect(await status("escrows", "milestone_id = $1", [M2])).toBe("frozen");

    const resolve = (actor: string) =>
      db.query("select resolve_dispute($1, $2, 'team', 'Evidence shows the criterion was met.')", [raised.r.dispute_id, actor]);
    await expect(resolve(ANJALI)).rejects.toThrow(/only a platform admin/);
    await resolve(ADMIN);
    expect(await status("milestones", "id = $1", [M2])).toBe("submitted");
    expect(await status("escrows", "milestone_id = $1", [M2])).toBe("funded");
    await expect(resolve(ADMIN)).rejects.toThrow(/already resolved/);
  });

  it("a student quits midway: pro-rata fraction recorded and access ends at once", async () => {
    expect(await asUser(MEERA, "select 1 from project_briefs where project_id = $1", [P1])).toHaveLength(1);
    const left = await one<{ r: { seq: number; active_fraction: number } }>(
      "select exit_member($1, $2, 0.6, $3) as r", [P1, MEERA, ADMIN]);
    expect(left.r.active_fraction).toBe(0.6);
    const entry = await one<{ event: string; actor: string; demo: string }>(
      "select event, actor, payload ->> 'demo_control_by' as demo from ledger where seq = $1", [left.r.seq]);
    expect(entry).toEqual({ event: "MEMBER_EXITED", actor: MEERA, demo: ADMIN });

    expect(await asUser(MEERA, "select 1 from project_briefs where project_id = $1", [P1])).toHaveLength(0);
    expect(await asUser(MEERA, "select 1 from ledger where project_id = $1 limit 1", [P1])).toHaveLength(0);
    await expect(db.query("select exit_member($1, $2)", [P1, MEERA])).rejects.toThrow(/nothing to exit/);
  });

  it("paid to unpaid: new charter version re-locks the brief and refunds unreleased escrow", async () => {
    const publish = (actor: string) =>
      one<{ r: { charter_version: number; escrow_refunded: number } }>(
        `select publish_charter_version($1, $2, 'knowledge_sharing', '{"feePct":0,"aiReservePct":0,"expertPct":0,"equalPct":40,"weightedPct":60}'::jsonb) as r`,
        [P1, actor]);
    await expect(publish(PRIYA)).rejects.toThrow(/only the project sponsor/);
    const v2 = await publish(ANJALI);
    expect(v2.r).toMatchObject({ charter_version: 2, escrow_refunded: 40000 });
    expect(await status("escrows", "milestone_id = $1", [M2])).toBe("refunded");

    const brief = (uid: string) => asUser(uid, "select 1 from project_briefs where project_id = $1", [P1]);
    expect(await brief(ANJALI)).toHaveLength(1); // the sponsor keeps access
    expect(await brief(PRIYA)).toHaveLength(0); // re-locked until she re-accepts
    await db.query("select accept_charter($1, $2, true)", [P1, PRIYA]);
    expect(await brief(PRIYA)).toHaveLength(1);

    const accept = (payouts: unknown) =>
      db.query("select accept_milestone($1, $2, 2, $3::jsonb, $4::jsonb, '{}'::jsonb)", [
        M2, ANJALI, JSON.stringify(payouts), JSON.stringify([{ user_id: PRIYA, title: "Contributor credential" }]),
      ]);
    await expect(accept([{ user_id: PRIYA, amount: 100 }])).rejects.toThrow(/escrow was refunded/);
    await accept([{ user_id: PRIYA, amount: 0, receipt: { lines: ["No payment: the charter is now unpaid"] } }]);
    const after = await one<{ ms: string; payouts: number }>(
      "select (select status from milestones where id = $1) as ms, (select count(*)::int from payouts where milestone_id = $1) as payouts",
      [M2]);
    expect(after).toEqual({ ms: "accepted", payouts: 0 });
    expect(await verify()).toMatchObject({ ok: true, broken_at: null });
  });
});

describe("reset.sql", () => {
  it("drops everything so the schema and seed can be run again", async () => {
    await db.exec(read("../reset.sql"));
    await db.exec(read("../migrations/001_schema.sql"));
    await db.exec(read("../migrations/002_work_functions.sql"));
    await db.exec(read("../migrations/003_agent_functions.sql"));
    await db.exec(read("../migrations/004_corner_cases.sql"));
    await db.exec(read("../migrations/005_tasks_versions.sql"));
    await db.exec(read("../seed.sql"));
    expect(await verify()).toMatchObject({ ok: true, checked: 46 });
  });
});

// End-to-end rehearsal: walks the whole demo (join, scope, match, fund, work, catch, review, accept,
// credentials, verify, every corner case) over HTTP against the running dev server and the real
// Supabase project, as the seeded demo users.
//
//   npm run dev            (in another terminal)
//   npm run demo:dryrun
//
// It needs a freshly seeded database and it CHANGES demo state: afterwards, run
// "npm run db:bundle" and paste supabase/paste_me.sql into the Supabase SQL editor to reset.
// It also makes four real LLM calls.
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*([^#]*)/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
const base = "http://localhost:3000";
const P1 = "b0000000-0000-4000-8000-000000000001", P2 = "b0000000-0000-4000-8000-000000000002";
const M1 = "c0000000-0000-4000-8000-000000000001", M2 = "c0000000-0000-4000-8000-000000000002", M3 = "c0000000-0000-4000-8000-000000000003";
const uid = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MEERA = uid(5), DEV = uid(9), ANANYA = uid(10);

let failures = 0;
const plain = (html) => html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

async function session(email) {
  const jar = new Map();
  const db = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (s) => s.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const { error } = await db.auth.signInWithPassword({ email: `${email}@charter.test`, password: "demo1234" });
  if (error) throw new Error(`${email}: ${error.message}`);
  const cookie = [...jar].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
  const call = async (method, path, body, form) => {
    const res = await fetch(base + path, {
      method,
      redirect: "manual",
      headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, text, json };
  };
  return {
    db,
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body ?? null),
    upload: (path, form) => call("POST", path, null, form),
  };
}

/** Expect a status; print one line. */
function check(label, res, want, detail) {
  const ok = res.status === want;
  if (!ok) failures++;
  const info = detail ? detail(res) : res.json ? JSON.stringify(res.json).slice(0, 170) : "";
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${res.status}${ok ? "" : ` (wanted ${want})`} ${info}`);
  return res;
}
function page(label, res, needles) {
  const text = plain(res.text);
  const missing = needles.filter((n) => !text.includes(n));
  const ok = res.status === 200 && missing.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${res.status}${missing.length ? ` missing: ${missing.join(" | ")}` : ""}`);
}
const section = (t) => console.log(`\n== ${t}`);

const [anjali, kiran, priya, arjun, meera, ananya, admin] = await Promise.all(
  ["anjali", "kiran", "priya", "arjun", "meera", "ananya", "admin"].map(session),
);

section("Join: locked brief, accept the charter");
check("ananya brief before accepting", await ananya.get(`/api/projects/${P2}/brief`), 403);
check("ananya accepts the charter", await ananya.post(`/api/projects/${P2}/charter/accept`, { modelAcknowledged: true }), 200);
check("ananya brief after accepting", await ananya.get(`/api/projects/${P2}/brief`), 200, (r) => `"${String(r.json?.content).slice(0, 50)}..."`);

section("Scope and match (LLM)");
const scoping = check("anjali runs the scoping agent", await anjali.post(`/api/projects/${P1}/scoping`), 200);
if (scoping.json?.draftId) {
  const { data } = await anjali.db.from("agent_drafts").select("output, model, tokens_in, tokens_out, cost").eq("id", scoping.json.draftId).maybeSingle();
  console.log("     proposal:", (data?.output?.milestones ?? []).map((m) => `${m.title} [${m.acceptanceCriteria}]`).join(" || ").slice(0, 400));
  console.log(`     model ${data?.model}, ${data?.tokens_in}+${data?.tokens_out} tokens, cost ${data?.cost}`);
  check("anjali approves the scope", await anjali.post(`/api/agent-drafts/${scoping.json.draftId}/approve-scope`), 200);
}
const matching = check("anjali runs matching", await anjali.post(`/api/projects/${P1}/matching`), 200);
if (matching.json && !matching.json.explainedByLlm) { failures++; console.log("FAIL matching reasons came from the template, not the LLM"); }
page("anjali scope page", await anjali.get(`/projects/${P1}/scope`), [
  "Approved by the sponsor", "Dr. Kiran Shetty", "Priya Nair", "Filtered out", "Conflict of interest: affiliated with OptiScan AI",
  "Not verified yet", "Under 18 without guardian consent", "Invite", "On the team",
]);
{
  const { data } = await anjali.db.from("ledger").select("payload").eq("project_id", P1).eq("event", "MATCH_RUN").order("seq", { ascending: false }).limit(1).maybeSingle();
  for (const c of (data?.payload?.candidates ?? []).filter((c) => !c.excludedReason)) console.log(`     ${String(c.score).padStart(3)} ${c.name}: ${c.reason}`);
  for (const c of (data?.payload?.candidates ?? []).filter((c) => c.excludedReason)) console.log(`     --- ${c.name}: ${c.excludedReason}`);
}
check("anjali cannot invite dev (filtered out: too few hours)", await anjali.post(`/api/projects/${P1}/invite`, { userId: DEV, role: "student" }), 409);
check("anjali invites ananya (shortlisted)", await anjali.post(`/api/projects/${P1}/invite`, { userId: ANANYA, role: "student" }), 200);
check("ananya P1 brief before accepting", await ananya.get(`/api/projects/${P1}/brief`), 403);
check("ananya accepts the P1 charter", await ananya.post(`/api/projects/${P1}/charter/accept`, { modelAcknowledged: true }), 200);

section("Fund and work on milestone 2");
check("anjali funds milestone 2", await anjali.post(`/api/milestones/${M2}/fund`), 200);
const file = (name) => { const f = new FormData(); f.set("file", new Blob([readFileSync(`docs/demo/${name}`)]), name); return f; };
let form = file("quantisation_notes.md"); form.set("title", "Quantisation notes"); form.set("aiDeclaration", "No AI used.");
const clean = check("meera uploads original work", await meera.upload(`/api/milestones/${M2}/contributions`, form), 200);
form = file("copied_cnn_notes.md"); form.set("title", "Baseline CNN notes"); form.set("aiDeclaration", "No AI used.");
const copied = check("arjun uploads a copied file", await arjun.upload(`/api/milestones/${M2}/contributions`, form), 200);
if (clean.json?.flagged !== false || copied.json?.flagged !== true) { failures++; console.log("FAIL similarity flags are not clean=false / copied=true"); }

const agentRun = check("priya runs the research agent", await priya.post(`/api/milestones/${M2}/agent`, {
  agent: "research", request: "Outline the steps to quantise our screening model to under 10 MB for the edge board.", notes: "We use TensorFlow Lite. Baseline model is 94 MB.",
}), 200);
let agentContribution = null;
if (agentRun.json?.draftId) {
  const { data } = await priya.db.from("agent_drafts").select("output").eq("id", agentRun.json.draftId).maybeSingle();
  console.log(`     draft: "${data?.output?.title}" (${String(data?.output?.content ?? "").length} chars)`);
  const approved = check("priya approves the draft as her contribution", await priya.post(`/api/agent-drafts/${agentRun.json.draftId}/approve`, {
    content: `${data?.output?.content}\n\nChecked and edited by Priya.`, aiShare: 0.8, aiDeclaration: "Drafted by the research agent; I checked and edited it.",
  }), 200);
  agentContribution = approved.json?.contribution_id ?? null;
}
check("meera cannot approve priya's draft", await meera.post(`/api/agent-drafts/${agentRun.json?.draftId}/approve`, { content: "x".repeat(30), aiShare: 0.5, aiDeclaration: "mine" }), 409);

section("Review and submit");
const reviewRun = check("kiran runs the review agent", await kiran.post(`/api/milestones/${M2}/review-agent`), 200);
if (reviewRun.json?.draftId) {
  const { data } = await kiran.db.from("agent_drafts").select("output").eq("id", reviewRun.json.draftId).maybeSingle();
  for (const c of data?.output?.criteria ?? []) console.log(`     [${c.met}] ${c.criterion} :: ${String(c.evidence).slice(0, 110)}`);
  check("kiran confirms the check", await kiran.post(`/api/agent-drafts/${reviewRun.json.draftId}/confirm`, { note: "Checked." }), 200);
}
check("priya cannot review", await priya.post(`/api/contributions/${clean.json?.contributionId}/review`, { verdict: "approved", impact: 9 }), 409);
check("kiran approves meera's work, impact 4", await kiran.post(`/api/contributions/${clean.json?.contributionId}/review`, { verdict: "approved", impact: 4, notes: "Clear and reproducible." }), 200);
check("kiran rejects the copied file", await kiran.post(`/api/contributions/${copied.json?.contributionId}/review`, { verdict: "rejected", impact: 0, notes: "Copied from a public repository." }), 200);
if (agentContribution) check("kiran approves priya's agent-assisted note, impact 2", await kiran.post(`/api/contributions/${agentContribution}/review`, { verdict: "approved", impact: 2 }), 200);
check("arjun cannot submit (not the lead)", await arjun.post(`/api/milestones/${M2}/submit`), 409);
check("priya submits milestone 2", await priya.post(`/api/milestones/${M2}/submit`), 200);
page("priya workspace", await priya.get(`/projects/${P1}/workspace`), ["Held: ₹1,60,000", "Flagged: 97% similar", "Approved, impact 4", "80% AI (research agent)", "Ananya Gupta"]);

section("Accept milestone 1: payouts and receipts");
page("anjali payouts preview", await anjali.get(`/projects/${P1}/payouts`), ["₹25,500", "₹25,783", "₹18,643", "₹15,074", "Preview"]);
check("priya cannot accept", await priya.post(`/api/milestones/${M1}/accept`), 409);
check("anjali accepts milestone 1", await anjali.post(`/api/milestones/${M1}/accept`), 200);
page("priya payouts after acceptance (team view)", await priya.get(`/projects/${P1}/payouts?m=1`), ["₹25,500", "₹25,783", "₹18,643", "₹15,074", "Paid (simulated)", "SIM-PAY-", "Contributor credential", "Waterfall from ₹1,00,000"]);
check("anjali cannot accept twice", await anjali.post(`/api/milestones/${M1}/accept`), 409);

section("Non-monetary project: credentials");
check("anjali accepts the literature review", await anjali.post(`/api/milestones/${M3}/accept`), 200);
page("sana-view via anjali: P2 payouts", await anjali.get(`/projects/${P2}/payouts`), ["Credit without money", "Certificate of contribution", "Sana Khan", "Dev Patel", "Credentials issued"]);
page("anjali P2 record", await anjali.get(`/projects/${P2}/record`), ["Complete", "No money on this project", "Certificate of contribution"]);

section("Verify");
check("verify the chain", await priya.get("/api/ledger/verify"), 200);
page("priya ledger", await priya.get(`/projects/${P1}/ledger`), ["Paid ₹25,783 to Priya Nair", "Similarity 97% on copied_cnn_notes.md", "Funded escrow ₹60,000", "research agent", "Approved by owner", "Invited Ananya Gupta"]);

section("Corner cases from the admin demo controls (on milestone 2)");
const demo = (body) => admin.post("/api/admin/demo", { projectId: P1, ...body });
check("priya cannot use demo controls", await priya.post("/api/admin/demo", { projectId: P1, action: "silent" }), 403);
check("reject with no criterion is refused", await demo({ action: "reject", citeCriterion: false }), 409);
check("reject citing the criterion", await demo({ action: "reject", citeCriterion: true }), 200);
check("the team disputes", await demo({ action: "dispute" }), 200);
page("anjali workspace while disputed", await anjali.get(`/projects/${P1}/workspace`), ["frozen", "disputed"]);
check("anjali cannot accept while disputed", await anjali.post(`/api/milestones/${M2}/accept`), 409);
{
  const { data } = await admin.db.from("disputes").select("id").eq("status", "open").limit(1).maybeSingle();
  check("priya cannot resolve the dispute", await priya.post(`/api/disputes/${data?.id}/resolve`, { inFavourOf: "team", resolution: "I say so." }), 409);
  check("admin resolves for the team", await admin.post(`/api/disputes/${data?.id}/resolve`, { inFavourOf: "team", resolution: "The ledger shows the criterion was reviewed and met." }), 200);
}
page("anjali M2 preview before the exit", await anjali.get(`/projects/${P1}/payouts?m=2`), ["Waterfall from ₹60,000", "Ananya Gupta", "Meera Iyer", "Preview"]);
check("meera quits at 60%", await demo({ action: "quit", userId: MEERA, percent: 60 }), 200);
page("anjali M2 preview after the exit", await anjali.get(`/projects/${P1}/payouts?m=2`), ["active 60%", "Unallocated (pro-rata leftovers)"]);
check("meera's access is revoked", await meera.get(`/api/projects/${P1}/brief`), 403);
check("paid to unpaid", await demo({ action: "unpaid" }), 200);
check("priya's brief is re-locked", await priya.get(`/api/projects/${P1}/brief`), 403);
page("priya discovery after the charter change", await priya.get(`/projects/${P1}`), ["Re-accept to unlock", "Accept Charter v2", "Leave the project with my credit", "Knowledge-sharing"]);
check("priya re-accepts v2", await priya.post(`/api/projects/${P1}/charter/accept`, { modelAcknowledged: true }), 200);
check("priya's brief is open again", await priya.get(`/api/projects/${P1}/brief`), 200, () => "");
check("arjun leaves with his credit", await arjun.post(`/api/projects/${P1}/leave`), 200);
check("arjun's access is revoked", await arjun.get(`/api/projects/${P1}/brief`), 403);
check("sponsor silent: auto-accept milestone 2", await demo({ action: "silent" }), 200);
check("already unpaid is refused", await demo({ action: "unpaid" }), 409);

section("Final state");
check("verify the chain", await admin.get("/api/ledger/verify"), 200);
page("admin console", await admin.get("/admin"), ["Chain intact", "M1: accepted", "M2: accepted", "resolved", "Charter v2", "student (exited, 60%)"]);
page("anjali P1 record", await anjali.get(`/projects/${P1}/record`), ["Complete", "₹85,000", "Chain intact", "Contributor credential", "refunded"]);
page("anjali P1 ledger", await anjali.get(`/projects/${P1}/ledger`), ["Auto-accepted (sponsor silent)", "Rejected \"Edge-device optimisation\"", "Disputed the rejection", "Resolved the dispute in favour of the team", "Left the project after 60%", "Published Charter v2"]);
page("anjali M1 payouts still shown as paid", await anjali.get(`/projects/${P1}/payouts?m=1`), ["Every rupee has a receipt", "₹25,783", "Paid (simulated)", "Waterfall from ₹1,00,000"]);
page("anjali M2 shown as credit only", await anjali.get(`/projects/${P1}/payouts?m=2`), ["Credit without money", "Credentials issued"]);
page("meera dashboard after exit", await meera.get("/dashboard"), ["Exited"]);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);

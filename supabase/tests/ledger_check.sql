-- ledger_check.sql : paste these into the Supabase SQL editor ONE BLOCK AT A TIME.
-- Run after 001_schema.sql and seed.sql.

-- 1. Verify the chain. Expect: ok = true, broken_at = null, checked = 46.
select * from public.ledger_verify();

-- 2. Look at the chain (each prev_hash equals the previous row's hash).
select seq, ts, actor, on_behalf_of, event, left(prev_hash, 8) as prev, left(hash, 8) as hash
from public.ledger order by seq;

-- 3. The guard rails. Each of these must FAIL with the message shown.
--    "ledger is append-only: add a CORRECTION entry instead"
update public.ledger set payload = '{}' where seq = 1;
--    "agent actor "agent:research" needs a human owner (on_behalf_of)"
select public.ledger_append('b0000000-0000-4000-8000-000000000001', 'agent:research', null, 'AGENT_ACTION', '{}');

-- 4. TAMPER DEMO. Entry #23 is Arjun's preprocess.py contribution (AI share 0.7).
--    An "admin" quietly rewrites it:
alter table public.ledger disable trigger ledger_append_only;
update public.ledger set payload = jsonb_set(payload, '{ai_share}', '0.1') where seq = 23;
alter table public.ledger enable trigger ledger_append_only;

--    Now verify (or press the Verify button). Expect: ok = false, broken_at = 23.
select * from public.ledger_verify();

-- 5. UNDO the tamper so the demo can continue. Expect ok = true again.
alter table public.ledger disable trigger ledger_append_only;
update public.ledger set payload = jsonb_set(payload, '{ai_share}', '0.7') where seq = 23;
alter table public.ledger enable trigger ledger_append_only;
select * from public.ledger_verify();

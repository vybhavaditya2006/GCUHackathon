-- =============================================================================
-- 005_tasks_versions.sql : how work is split, combined and versioned.
--   1. tasks: who owns which piece of a milestone, and the contribution that closed it.
--   2. contributions.version / builds_on: a contribution can build on or replace an
--      earlier one; the new version is the parent's + 1 and the ledger entry says so.
-- Run AFTER 001 to 004. Safe to re-run.
-- =============================================================================

-- ---- 1. versions --------------------------------------------------------------
alter table public.contributions
  add column if not exists version int not null default 1 check (version >= 1);
alter table public.contributions
  add column if not exists builds_on uuid references public.contributions (id) on delete set null;

-- add_contribution gains p_builds_on. The old 9-argument form is dropped first, so
-- callers that pass 9 arguments (approve_agent_draft) are not left with two candidates.
drop function if exists public.add_contribution(uuid, uuid, text, text, text, text, text, numeric, numeric);

-- An active member who accepted the current charter adds a contribution.
-- similarity >= 0.8 also writes SIMILARITY_FLAGGED.
create or replace function public.add_contribution(
  p_milestone_id uuid, p_author_id uuid, p_title text, p_artefact_name text, p_artefact_hash text,
  p_ai_declaration text, p_agent_used text default null, p_ai_share numeric default 0,
  p_similarity numeric default 0, p_builds_on uuid default null
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_ms      public.milestones;
  v_charter public.charters;
  v_parent  public.contributions;
  v_version int := 1;
  v_id      uuid;
  v_flagged boolean := coalesce(p_similarity, 0) >= 0.8;
  v_payload jsonb;
  v_entry   public.ledger;
  v_flag    public.ledger;
begin
  select * into v_ms from public.milestones where id = p_milestone_id;
  if not found then
    raise exception 'add_contribution: milestone not found';
  end if;

  select * into v_charter from public.charters
   where project_id = v_ms.project_id order by version desc limit 1;

  if not exists (
    select 1 from public.memberships m
    where m.project_id = v_ms.project_id and m.user_id = p_author_id
      and m.status = 'active' and m.charter_version = v_charter.version) then
    raise exception 'add_contribution: author must be an active member who accepted the current charter';
  end if;

  -- Paid work starts only once escrow is funded; non-monetary work needs no funding.
  if not (v_ms.status in ('funded', 'rejected')
          or (v_ms.status = 'draft' and v_charter.model in ('knowledge_sharing', 'institutional_credit'))) then
    raise exception 'add_contribution: milestone is %, not open for work', v_ms.status;
  end if;
  if coalesce(p_artefact_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'add_contribution: artefact_hash must be a SHA-256 hex digest';
  end if;

  -- The earlier work stays in the record: a new version points at it, never overwrites it.
  if p_builds_on is not null then
    select * into v_parent from public.contributions where id = p_builds_on;
    if not found or v_parent.project_id <> v_ms.project_id then
      raise exception 'add_contribution: the contribution it builds on is not in this project';
    end if;
    v_version := v_parent.version + 1;
  end if;

  insert into public.contributions (project_id, milestone_id, author_id, title, agent_used, ai_share,
                                    artefact_name, artefact_hash, similarity, flagged, ai_declaration,
                                    version, builds_on)
  values (v_ms.project_id, v_ms.id, p_author_id, p_title, p_agent_used, coalesce(p_ai_share, 0),
          p_artefact_name, p_artefact_hash, coalesce(p_similarity, 0), v_flagged, coalesce(p_ai_declaration, ''),
          v_version, p_builds_on)
  returning id into v_id;

  v_payload := jsonb_build_object('contribution_id', v_id, 'milestone_id', v_ms.id, 'title', p_title,
                                  'artefact', p_artefact_name, 'artefact_hash', p_artefact_hash,
                                  'agent_used', p_agent_used, 'ai_share', coalesce(p_ai_share, 0),
                                  'ai_declaration', coalesce(p_ai_declaration, ''), 'version', v_version);
  if p_builds_on is not null then
    v_payload := v_payload || jsonb_build_object('builds_on', v_parent.id, 'builds_on_title', v_parent.title,
                                                 'builds_on_version', v_parent.version);
  end if;

  v_entry := public.ledger_append_entry(v_ms.project_id, p_author_id::text, null, 'CONTRIBUTION_ADDED', v_payload);

  update public.contributions set ledger_seq = v_entry.seq where id = v_id;

  if v_flagged then
    v_flag := public.ledger_append_entry(v_ms.project_id, 'agent:integrity', p_author_id, 'SIMILARITY_FLAGGED',
      jsonb_build_object('contribution_id', v_id, 'artefact', p_artefact_name,
                         'similarity', p_similarity, 'threshold', 0.8, 'simulated', true));
  end if;

  return jsonb_build_object('contribution_id', v_id, 'flagged', v_flagged, 'version', v_version,
                            'seq', v_entry.seq, 'hash', v_entry.hash, 'flag_seq', v_flag.seq);
end;
$$;

revoke all on function
  public.add_contribution(uuid, uuid, text, text, text, text, text, numeric, numeric, uuid)
from public, anon, authenticated;
grant execute on function
  public.add_contribution(uuid, uuid, text, text, text, text, text, numeric, numeric, uuid)
to service_role;

-- ---- 2. tasks -----------------------------------------------------------------
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  milestone_id    uuid not null references public.milestones (id) on delete cascade,
  title           text not null,
  owner_id        uuid not null references public.profiles (id),   -- the human who owns the task
  status          text not null default 'todo' check (status in ('todo', 'in_review', 'done')),
  contribution_id uuid references public.contributions (id) on delete set null,   -- the work that closed it
  created_at      timestamptz not null default now()
);

create index if not exists tasks_project_idx on public.tasks (project_id);

-- Same rule as contributions: the team and admins read; no direct writes for anyone signed in.
alter table public.tasks enable row level security;
revoke all on public.tasks from anon, authenticated;
grant select on public.tasks to authenticated;
grant all on public.tasks to service_role;

drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks
  for select to authenticated using (public.is_project_member(project_id) or public.is_admin());

-- Tell the Supabase API about the new table, columns and function signature straight away.
notify pgrst, 'reload schema';

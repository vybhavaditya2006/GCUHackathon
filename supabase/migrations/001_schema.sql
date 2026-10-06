-- =============================================================================
-- 001_schema.sql : The Executable Charter
-- Tables, enums, RLS (default deny), the hash-chained ledger and the
-- state-changing functions that write a change AND its ledger entry together.
--
-- Run in the Supabase SQL editor. Safe to re-run: it creates what is missing and
-- replaces functions, triggers and policies; it never drops a table or its data.
-- To start over completely, run supabase/reset.sql first.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin create type public.user_role as enum ('student', 'expert', 'sponsor', 'admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.member_role as enum ('sponsor', 'expert', 'student'); exception when duplicate_object then null; end $$;
do $$ begin create type public.charter_model as enum ('funded', 'stipend', 'knowledge_sharing', 'institutional_credit'); exception when duplicate_object then null; end $$;
do $$ begin create type public.membership_status as enum ('invited', 'active', 'inactive', 'exited'); exception when duplicate_object then null; end $$;
do $$ begin create type public.milestone_status as enum ('draft', 'funded', 'submitted', 'accepted', 'rejected', 'disputed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.escrow_status as enum ('funded', 'released', 'frozen', 'refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.review_verdict as enum ('approved', 'changes_requested', 'rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.dispute_status as enum ('open', 'resolved'); exception when duplicate_object then null; end $$;
do $$ begin create type public.draft_status as enum ('pending', 'approved', 'rejected'); exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text not null,
  role               public.user_role not null,
  organisation       text,
  verified           boolean not null default false,
  skills             text[] not null default '{}',
  -- Track record. Denormalised for the prototype; production derives it from the ledger.
  proven_skills      text[] not null default '{}',
  completed_projects int not null default 0,
  interests          text[] not null default '{}',
  hours_per_week     int not null default 0,
  affiliations       text[] not null default '{}',
  is_minor           boolean not null default false,
  guardian_consent   boolean not null default false,
  created_at         timestamptz not null default now()
);

create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  sponsor_id        uuid not null references public.profiles (id),
  title             text not null,
  problem_statement text not null default '',
  public_summary    text not null default '',
  required_skills   text[] not null default '{}',
  sensitivity       text not null default 'medium' check (sensitivity in ('low', 'medium', 'high')),
  -- Declared competitors, used by the matching conflict-of-interest filter.
  competitors       text[] not null default '{}',
  hours_per_week    int not null default 0,
  start_date        date,
  end_date          date,
  status            text not null default 'open' check (status in ('open', 'active', 'completed')),
  created_at        timestamptz not null default now()
);

-- Separate table so RLS can lock the confidential brief on its own.
create table if not exists public.project_briefs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  content    text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.charters (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  version      int not null check (version >= 1),
  model        public.charter_model not null,
  -- Percentages are whole numbers: {"feePct":10,"aiReservePct":5,"expertPct":30,"equalPct":40,"weightedPct":60,...}
  terms        jsonb not null,
  published_by uuid not null references public.profiles (id),
  published_at timestamptz not null default now(),
  unique (project_id, version)
);

create table if not exists public.memberships (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  role               public.member_role not null,
  is_lead            boolean not null default false,
  status             public.membership_status not null default 'invited',
  charter_version    int,                       -- the version this member accepted
  model_acknowledged boolean not null default false,
  active_fraction    numeric(4,3) not null default 1 check (active_fraction >= 0 and active_fraction <= 1),
  invited_at         timestamptz not null default now(),
  accepted_at        timestamptz,
  exited_at          timestamptz,
  unique (project_id, user_id)
);

create table if not exists public.milestones (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects (id) on delete cascade,
  position            int not null default 1,
  title               text not null,
  required_skills     text[] not null default '{}',
  acceptance_criteria text not null default '',
  amount              numeric(12,2) not null default 0 check (amount >= 0),
  status              public.milestone_status not null default 'draft',
  due_date            date,
  submitted_at        timestamptz,
  decided_at          timestamptz,
  rejection_criterion text                       -- a rejection must cite a criterion
);

create table if not exists public.contributions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  milestone_id   uuid not null references public.milestones (id) on delete cascade,
  author_id      uuid not null references public.profiles (id),   -- the human owner, always
  title          text not null,
  agent_used     text,                                            -- e.g. 'research', 'coding'; null = no agent
  ai_share       numeric(3,2) not null default 0 check (ai_share >= 0 and ai_share <= 1),
  artefact_name  text not null,
  artefact_hash  text not null,                                   -- SHA-256 hex of the file
  similarity     numeric(4,3) not null default 0 check (similarity >= 0 and similarity <= 1),
  flagged        boolean not null default false,
  ai_declaration text not null default '',
  ledger_seq     bigint,
  created_at     timestamptz not null default now()
);

create table if not exists public.reviews (
  id              uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contributions (id) on delete cascade,
  reviewer_id     uuid not null references public.profiles (id),
  verdict         public.review_verdict not null,
  impact          int not null default 0 check (impact between 0 and 10),
  notes           text not null default '',
  ledger_seq      bigint,
  created_at      timestamptz not null default now()
);

create table if not exists public.escrows (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  milestone_id uuid not null unique references public.milestones (id) on delete cascade,
  amount       numeric(12,2) not null check (amount >= 0),
  status       public.escrow_status not null default 'funded',
  reference    text not null,                    -- simulated, e.g. SIM-ESC-0417
  funded_at    timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.payouts (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  milestone_id    uuid not null references public.milestones (id) on delete cascade,
  user_id         uuid not null references public.profiles (id),
  amount          numeric(12,2) not null check (amount >= 0),
  receipt         jsonb not null,                -- plain-English lines[] + ledgerRefs[] from the engine
  charter_version int not null,
  payment_ref     text not null,                 -- simulated, e.g. SIM-PAY-...
  ledger_seq      bigint,
  created_at      timestamptz not null default now(),
  unique (milestone_id, user_id)
);

create table if not exists public.disputes (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  milestone_id    uuid references public.milestones (id) on delete cascade,
  raised_by       uuid not null references public.profiles (id),
  reason          text not null,
  criterion_cited text,
  status          public.dispute_status not null default 'open',
  resolution      text,
  resolved_by     uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create table if not exists public.agent_drafts (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  milestone_id    uuid references public.milestones (id) on delete set null,
  agent           text not null,                 -- scoping | matching | research | coding | review
  owner_id        uuid not null references public.profiles (id),  -- the human who owns the agent run
  input_summary   text not null default '',
  output          jsonb not null default '{}',
  model           text,
  tokens_in       int not null default 0,
  tokens_out      int not null default 0,
  cost            numeric(12,2) not null default 0,               -- rupees, paid from the AI reserve
  status          public.draft_status not null default 'pending',
  contribution_id uuid references public.contributions (id) on delete set null,
  ledger_seq      bigint,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- Ledger: append-only, hash-chained
-- -----------------------------------------------------------------------------
create sequence if not exists public.ledger_seq_seq;

create table if not exists public.ledger (
  seq          bigint primary key,
  ts           timestamptz not null,
  project_id   uuid references public.projects (id),
  actor        text not null,                    -- '<user uuid>' or 'agent:<name>'
  on_behalf_of uuid,                             -- human owner; REQUIRED for agents
  event        text not null,
  payload      jsonb not null default '{}',
  prev_hash    text not null,
  hash         text not null,
  constraint ledger_agent_needs_owner check (actor not like 'agent:%' or on_behalf_of is not null),
  constraint ledger_known_event check (event in (
    'PROJECT_POSTED', 'CHARTER_PUBLISHED', 'CHARTER_ACCEPTED', 'MILESTONES_APPROVED', 'MATCH_RUN',
    'MEMBER_INVITED', 'ESCROW_FUNDED', 'AGENT_ACTION', 'AGENT_DRAFT_APPROVED', 'CONTRIBUTION_ADDED',
    'SIMILARITY_FLAGGED', 'REVIEW_DONE', 'MILESTONE_SUBMITTED', 'MILESTONE_ACCEPTED', 'MILESTONE_REJECTED',
    'PAYOUT_ISSUED', 'CREDENTIAL_ISSUED', 'MEMBER_EXITED', 'DISPUTE_RAISED', 'DISPUTE_RESOLVED',
    'BRIEF_VIEWED', 'CORRECTION'))
);

create index if not exists ledger_project_idx on public.ledger (project_id, seq);
create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists contributions_milestone_idx on public.contributions (milestone_id);
create index if not exists reviews_contribution_idx on public.reviews (contribution_id);

-- hash = sha256(prev_hash | seq | epoch(ts) | actor | on_behalf_of | event | payload::text)
-- One implementation, in SQL, used by both append and verify.
create or replace function public.ledger_hash(
  p_prev_hash text, p_seq bigint, p_ts timestamptz, p_actor text,
  p_on_behalf_of uuid, p_event text, p_payload jsonb
) returns text
language sql stable
set search_path = public, extensions
as $$
  select encode(digest(convert_to(
    p_prev_hash || '|' || p_seq::text || '|' || extract(epoch from p_ts)::text || '|' || p_actor || '|' ||
    coalesce(p_on_behalf_of::text, '') || '|' || p_event || '|' || p_payload::text,
    'UTF8'), 'sha256'), 'hex');
$$;

-- Appends one entry and returns the whole row. p_ts is only for seeding
-- backdated demo data; normal callers leave it null.
create or replace function public.ledger_append_entry(
  p_project_id uuid, p_actor text, p_on_behalf_of uuid, p_event text,
  p_payload jsonb default '{}'::jsonb, p_ts timestamptz default null
) returns public.ledger
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_prev text;
  v_row  public.ledger;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'ledger: actor is required';
  end if;
  if p_actor like 'agent:%' and p_on_behalf_of is null then
    raise exception 'ledger: agent actor "%" needs a human owner (on_behalf_of)', p_actor;
  end if;

  -- Serialise appends so two writers can never chain from the same prev_hash.
  perform pg_advisory_xact_lock(7426001);

  select l.hash into v_prev from public.ledger l order by l.seq desc limit 1;

  v_row.prev_hash    := coalesce(v_prev, repeat('0', 64));   -- genesis
  v_row.seq          := nextval('public.ledger_seq_seq');    -- AFTER the lock
  v_row.ts           := coalesce(p_ts, clock_timestamp());
  v_row.project_id   := p_project_id;
  v_row.actor        := p_actor;
  v_row.on_behalf_of := p_on_behalf_of;
  v_row.event        := p_event;
  v_row.payload      := coalesce(p_payload, '{}'::jsonb);
  v_row.hash         := public.ledger_hash(v_row.prev_hash, v_row.seq, v_row.ts, v_row.actor,
                                           v_row.on_behalf_of, v_row.event, v_row.payload);

  insert into public.ledger select v_row.*;
  return v_row;
end;
$$;

-- The documented entry point: appends and returns the new hash.
create or replace function public.ledger_append(
  p_project_id uuid, p_actor text, p_on_behalf_of uuid, p_event text, p_payload jsonb default '{}'::jsonb
) returns text
language sql security definer
set search_path = public, extensions
as $$
  select (public.ledger_append_entry(p_project_id, p_actor, p_on_behalf_of, p_event, p_payload)).hash;
$$;

-- Walks every row in seq order and re-hashes it. broken_at = first bad seq.
create or replace function public.ledger_verify()
returns table (ok boolean, broken_at bigint, checked bigint, last_hash text)
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  r      public.ledger;
  v_prev text := repeat('0', 64);
  v_n    bigint := 0;
begin
  for r in select * from public.ledger order by seq loop
    if r.prev_hash <> v_prev
       or r.hash <> public.ledger_hash(r.prev_hash, r.seq, r.ts, r.actor, r.on_behalf_of, r.event, r.payload) then
      return query select false, r.seq, v_n, v_prev;
      return;
    end if;
    v_prev := r.hash;
    v_n := v_n + 1;
  end loop;
  return query select true, null::bigint, v_n, v_prev;
end;
$$;

create or replace function public.ledger_block_change() returns trigger
language plpgsql as $$
begin
  raise exception 'ledger is append-only: add a CORRECTION entry instead';
end;
$$;

drop trigger if exists ledger_append_only on public.ledger;
create trigger ledger_append_only
  before update or delete on public.ledger
  for each row execute function public.ledger_block_change();

drop trigger if exists ledger_no_truncate on public.ledger;
create trigger ledger_no_truncate
  before truncate on public.ledger
  for each statement execute function public.ledger_block_change();

-- -----------------------------------------------------------------------------
-- RLS helpers (SECURITY DEFINER so policies do not recurse into each other)
-- -----------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.is_project_sponsor(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = p_project_id and p.sponsor_id = auth.uid());
$$;

-- Active members only: access ends the moment someone exits.
create or replace function public.is_project_member(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_project_sponsor(p_project_id) or exists (
    select 1 from public.memberships m
    where m.project_id = p_project_id and m.user_id = auth.uid() and m.status = 'active');
$$;

create or replace function public.latest_charter_version(p_project_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select max(c.version) from public.charters c where c.project_id = p_project_id;
$$;

-- The brief unlocks for the sponsor, or an active member who accepted the LATEST
-- charter version. Publishing a new version re-locks it until re-accepted.
create or replace function public.can_read_brief(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_project_sponsor(p_project_id) or exists (
    select 1 from public.memberships m
    where m.project_id = p_project_id and m.user_id = auth.uid() and m.status = 'active'
      and m.charter_version = public.latest_charter_version(p_project_id));
$$;

-- -----------------------------------------------------------------------------
-- RLS: enabled everywhere, default deny. There are NO insert/update/delete
-- policies: every write goes through the service role calling the functions below.
-- -----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.projects       enable row level security;
alter table public.project_briefs enable row level security;
alter table public.charters       enable row level security;
alter table public.memberships    enable row level security;
alter table public.milestones     enable row level security;
alter table public.contributions  enable row level security;
alter table public.reviews        enable row level security;
alter table public.escrows        enable row level security;
alter table public.payouts        enable row level security;
alter table public.disputes       enable row level security;
alter table public.agent_drafts   enable row level security;
alter table public.ledger         enable row level security;

revoke all on
  public.profiles, public.projects, public.project_briefs, public.charters, public.memberships,
  public.milestones, public.contributions, public.reviews, public.escrows, public.payouts,
  public.disputes, public.agent_drafts, public.ledger
from anon, authenticated;

grant select on
  public.profiles, public.projects, public.project_briefs, public.charters, public.memberships,
  public.milestones, public.contributions, public.reviews, public.escrows, public.payouts,
  public.disputes, public.agent_drafts, public.ledger
to authenticated;

-- Public by design: the project listing and its terms are visible before anyone applies.
grant select on public.projects, public.charters, public.milestones to anon;

grant all on
  public.profiles, public.projects, public.project_briefs, public.charters, public.memberships,
  public.milestones, public.contributions, public.reviews, public.escrows, public.payouts,
  public.disputes, public.agent_drafts, public.ledger
to service_role;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (true);

drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects
  for select to anon, authenticated using (true);

drop policy if exists charters_read on public.charters;
create policy charters_read on public.charters
  for select to anon, authenticated using (true);

drop policy if exists milestones_read on public.milestones;
create policy milestones_read on public.milestones
  for select to anon, authenticated using (true);

drop policy if exists briefs_read on public.project_briefs;
create policy briefs_read on public.project_briefs
  for select to authenticated using (public.can_read_brief(project_id));

drop policy if exists memberships_read on public.memberships;
create policy memberships_read on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_project_member(project_id) or public.is_admin());

drop policy if exists contributions_read on public.contributions;
create policy contributions_read on public.contributions
  for select to authenticated using (public.is_project_member(project_id) or public.is_admin());

drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews
  for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.contributions c
    where c.id = contribution_id and public.is_project_member(c.project_id)));

drop policy if exists escrows_read on public.escrows;
create policy escrows_read on public.escrows
  for select to authenticated using (public.is_project_member(project_id) or public.is_admin());

-- Users see their own payouts; the sponsor sees their project's.
drop policy if exists payouts_read on public.payouts;
create policy payouts_read on public.payouts
  for select to authenticated
  using (user_id = auth.uid() or public.is_project_sponsor(project_id) or public.is_admin());

drop policy if exists disputes_read on public.disputes;
create policy disputes_read on public.disputes
  for select to authenticated using (public.is_project_member(project_id) or public.is_admin());

drop policy if exists agent_drafts_read on public.agent_drafts;
create policy agent_drafts_read on public.agent_drafts
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());

drop policy if exists ledger_read on public.ledger;
create policy ledger_read on public.ledger
  for select to authenticated using (public.is_project_member(project_id) or public.is_admin());

-- -----------------------------------------------------------------------------
-- State-changing functions: each writes the change AND its ledger entry in one
-- transaction. The route handler authenticates the user and passes their id.
-- Every function returns jsonb including the ledger {seq, hash}.
-- -----------------------------------------------------------------------------

-- A member (invited, or active on an older version) accepts the latest charter.
create or replace function public.accept_charter(
  p_project_id uuid, p_user_id uuid, p_model_acknowledged boolean
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_member  public.memberships;
  v_charter public.charters;
  v_entry   public.ledger;
begin
  select * into v_member from public.memberships
   where project_id = p_project_id and user_id = p_user_id for update;
  if not found then
    raise exception 'accept_charter: user is not invited to this project';
  end if;
  if v_member.status not in ('invited', 'active') then
    raise exception 'accept_charter: membership is %, cannot accept', v_member.status;
  end if;

  select * into v_charter from public.charters
   where project_id = p_project_id order by version desc limit 1;
  if not found then
    raise exception 'accept_charter: project has no published charter';
  end if;
  if v_member.status = 'active' and v_member.charter_version = v_charter.version then
    raise exception 'accept_charter: charter v% is already accepted', v_charter.version;
  end if;
  if not coalesce(p_model_acknowledged, false) then
    raise exception 'accept_charter: the engagement model (%) must be acknowledged', v_charter.model;
  end if;

  update public.memberships
     set status = 'active', charter_version = v_charter.version, model_acknowledged = true,
         accepted_at = clock_timestamp()
   where id = v_member.id;

  v_entry := public.ledger_append_entry(p_project_id, p_user_id::text, null, 'CHARTER_ACCEPTED',
    jsonb_build_object('charter_version', v_charter.version, 'model', v_charter.model,
                       'model_acknowledged', true, 'role', v_member.role));

  return jsonb_build_object('charter_version', v_charter.version, 'seq', v_entry.seq, 'hash', v_entry.hash);
end;
$$;

-- The sponsor funds a draft milestone into (simulated) escrow.
create or replace function public.fund_escrow(p_milestone_id uuid, p_sponsor_id uuid) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_ms     public.milestones;
  v_escrow public.escrows;
  v_entry  public.ledger;
begin
  select * into v_ms from public.milestones where id = p_milestone_id for update;
  if not found then
    raise exception 'fund_escrow: milestone not found';
  end if;
  if not exists (select 1 from public.projects where id = v_ms.project_id and sponsor_id = p_sponsor_id) then
    raise exception 'fund_escrow: only the project sponsor can fund';
  end if;
  if v_ms.status <> 'draft' then
    raise exception 'fund_escrow: milestone is %, expected draft', v_ms.status;
  end if;
  if v_ms.amount <= 0 then
    raise exception 'fund_escrow: milestone has no amount to fund';
  end if;

  insert into public.escrows (project_id, milestone_id, amount, status, reference)
  values (v_ms.project_id, v_ms.id, v_ms.amount, 'funded',
          'SIM-ESC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)))
  returning * into v_escrow;

  update public.milestones set status = 'funded' where id = v_ms.id;
  update public.projects set status = 'active' where id = v_ms.project_id and status = 'open';

  v_entry := public.ledger_append_entry(v_ms.project_id, p_sponsor_id::text, null, 'ESCROW_FUNDED',
    jsonb_build_object('milestone_id', v_ms.id, 'milestone', v_ms.title, 'amount', v_ms.amount,
                       'reference', v_escrow.reference, 'simulated', true));

  return jsonb_build_object('escrow_id', v_escrow.id, 'reference', v_escrow.reference,
                            'seq', v_entry.seq, 'hash', v_entry.hash);
end;
$$;

-- An active member who accepted the current charter adds a contribution.
-- similarity >= 0.8 also writes SIMILARITY_FLAGGED.
create or replace function public.add_contribution(
  p_milestone_id uuid, p_author_id uuid, p_title text, p_artefact_name text, p_artefact_hash text,
  p_ai_declaration text, p_agent_used text default null, p_ai_share numeric default 0,
  p_similarity numeric default 0
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_ms      public.milestones;
  v_charter public.charters;
  v_id      uuid;
  v_flagged boolean := coalesce(p_similarity, 0) >= 0.8;
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

  insert into public.contributions (project_id, milestone_id, author_id, title, agent_used, ai_share,
                                    artefact_name, artefact_hash, similarity, flagged, ai_declaration)
  values (v_ms.project_id, v_ms.id, p_author_id, p_title, p_agent_used, coalesce(p_ai_share, 0),
          p_artefact_name, p_artefact_hash, coalesce(p_similarity, 0), v_flagged, coalesce(p_ai_declaration, ''))
  returning id into v_id;

  v_entry := public.ledger_append_entry(v_ms.project_id, p_author_id::text, null, 'CONTRIBUTION_ADDED',
    jsonb_build_object('contribution_id', v_id, 'milestone_id', v_ms.id, 'title', p_title,
                       'artefact', p_artefact_name, 'artefact_hash', p_artefact_hash,
                       'agent_used', p_agent_used, 'ai_share', coalesce(p_ai_share, 0),
                       'ai_declaration', coalesce(p_ai_declaration, '')));

  update public.contributions set ledger_seq = v_entry.seq where id = v_id;

  if v_flagged then
    v_flag := public.ledger_append_entry(v_ms.project_id, 'agent:integrity', p_author_id, 'SIMILARITY_FLAGGED',
      jsonb_build_object('contribution_id', v_id, 'artefact', p_artefact_name,
                         'similarity', p_similarity, 'threshold', 0.8, 'simulated', true));
  end if;

  return jsonb_build_object('contribution_id', v_id, 'flagged', v_flagged,
                            'seq', v_entry.seq, 'hash', v_entry.hash, 'flag_seq', v_flag.seq);
end;
$$;

-- The sponsor (or an admin, for auto-accept) accepts a submitted milestone.
-- The pure TypeScript engine computes the split; this function checks it fits
-- the escrow, then releases escrow, stores payouts + receipts and writes the ledger.
--   p_payouts:     [{"user_id": uuid, "amount": number, "receipt": {...}}]
--   p_credentials: [{"user_id": uuid, "title": text}]
--   p_summary:     engine totals (fee, aiReserve, unallocated, ...) kept in the ledger payload
create or replace function public.accept_milestone(
  p_milestone_id uuid, p_actor_id uuid, p_charter_version int,
  p_payouts jsonb default '[]'::jsonb, p_credentials jsonb default '[]'::jsonb,
  p_summary jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_ms      public.milestones;
  v_escrow  public.escrows;
  v_entry   public.ledger;
  v_pay     public.ledger;
  v_item    jsonb;
  v_total   numeric := 0;
  v_ref     text;
  v_latest  int;
  v_paid    int := 0;
  v_creds   int := 0;
begin
  select * into v_ms from public.milestones where id = p_milestone_id for update;
  if not found then
    raise exception 'accept_milestone: milestone not found';
  end if;
  if not exists (select 1 from public.projects where id = v_ms.project_id and sponsor_id = p_actor_id)
     and not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'accept_milestone: only the project sponsor or an admin can accept';
  end if;
  if v_ms.status <> 'submitted' then
    raise exception 'accept_milestone: milestone is %, expected submitted', v_ms.status;
  end if;

  select max(version) into v_latest from public.charters where project_id = v_ms.project_id;
  if p_charter_version is distinct from v_latest then
    raise exception 'accept_milestone: split was computed on charter v%, latest is v%', p_charter_version, v_latest;
  end if;

  select coalesce(sum((e ->> 'amount')::numeric), 0) into v_total
    from jsonb_array_elements(coalesce(p_payouts, '[]'::jsonb)) e;
  if v_total > v_ms.amount then
    raise exception 'accept_milestone: payouts (%) exceed the milestone amount (%)', v_total, v_ms.amount;
  end if;

  select * into v_escrow from public.escrows where milestone_id = v_ms.id for update;
  if found then
    if v_escrow.status <> 'funded' then
      raise exception 'accept_milestone: escrow is %, cannot release', v_escrow.status;
    end if;
    update public.escrows set status = 'released', updated_at = clock_timestamp() where id = v_escrow.id;
  elsif v_ms.amount > 0 then
    raise exception 'accept_milestone: milestone has an amount but no escrow';
  end if;

  update public.milestones set status = 'accepted', decided_at = clock_timestamp() where id = v_ms.id;

  v_entry := public.ledger_append_entry(v_ms.project_id, p_actor_id::text, null, 'MILESTONE_ACCEPTED',
    jsonb_build_object('milestone_id', v_ms.id, 'milestone', v_ms.title, 'amount', v_ms.amount,
                       'charter_version', p_charter_version, 'escrow_reference', v_escrow.reference,
                       'paid_total', v_total, 'summary', coalesce(p_summary, '{}'::jsonb)));

  -- Money rows only where there is money: a non-monetary project shows no payment at all.
  if v_ms.amount > 0 then
    for v_item in select * from jsonb_array_elements(coalesce(p_payouts, '[]'::jsonb)) loop
      v_paid := v_paid + 1;
      v_ref := 'SIM-PAY-' || to_char(clock_timestamp(), 'YYYY-MMDD') || '-' || lpad(v_paid::text, 4, '0');
      v_pay := public.ledger_append_entry(v_ms.project_id, p_actor_id::text, null, 'PAYOUT_ISSUED',
        jsonb_build_object('milestone_id', v_ms.id, 'user_id', v_item ->> 'user_id',
                           'amount', (v_item ->> 'amount')::numeric, 'payment_ref', v_ref,
                           'charter_version', p_charter_version, 'simulated', true,
                           'receipt', coalesce(v_item -> 'receipt', '{}'::jsonb)));
      insert into public.payouts (project_id, milestone_id, user_id, amount, receipt, charter_version,
                                  payment_ref, ledger_seq)
      values (v_ms.project_id, v_ms.id, (v_item ->> 'user_id')::uuid, (v_item ->> 'amount')::numeric,
              coalesce(v_item -> 'receipt', '{}'::jsonb), p_charter_version, v_ref, v_pay.seq);
    end loop;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_credentials, '[]'::jsonb)) loop
    v_creds := v_creds + 1;
    perform public.ledger_append_entry(v_ms.project_id, p_actor_id::text, null, 'CREDENTIAL_ISSUED',
      jsonb_build_object('milestone_id', v_ms.id, 'user_id', v_item ->> 'user_id',
                         'title', v_item ->> 'title', 'charter_version', p_charter_version));
  end loop;

  return jsonb_build_object('seq', v_entry.seq, 'hash', v_entry.hash, 'paid_total', v_total,
                            'payouts', v_paid, 'credentials', v_creds);
end;
$$;

-- -----------------------------------------------------------------------------
-- Who may call what. Writers are service-role only; anyone signed in may verify.
-- -----------------------------------------------------------------------------
revoke all on function
  public.ledger_append_entry(uuid, text, uuid, text, jsonb, timestamptz),
  public.ledger_append(uuid, text, uuid, text, jsonb),
  public.ledger_verify(),
  public.accept_charter(uuid, uuid, boolean),
  public.fund_escrow(uuid, uuid),
  public.add_contribution(uuid, uuid, text, text, text, text, text, numeric, numeric),
  public.accept_milestone(uuid, uuid, int, jsonb, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function
  public.ledger_append_entry(uuid, text, uuid, text, jsonb, timestamptz),
  public.ledger_append(uuid, text, uuid, text, jsonb),
  public.accept_charter(uuid, uuid, boolean),
  public.fund_escrow(uuid, uuid),
  public.add_contribution(uuid, uuid, text, text, text, text, text, numeric, numeric),
  public.accept_milestone(uuid, uuid, int, jsonb, jsonb, jsonb)
to service_role;

grant execute on function public.ledger_verify() to authenticated, service_role;
grant usage on sequence public.ledger_seq_seq to service_role;

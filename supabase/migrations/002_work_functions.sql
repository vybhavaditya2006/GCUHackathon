-- =============================================================================
-- 002_work_functions.sql : The Executable Charter
-- State-changing functions for the workspace: expert reviews and milestone
-- submission. Like the ones in 001, each writes the change AND its ledger entry
-- in one transaction and is callable by the service role only.
--
-- Run once in the Supabase SQL editor AFTER 001_schema.sql. Safe to re-run.
-- =============================================================================

-- An expert on the project reviews a contribution and scores its impact (0..10).
-- The impact is what the charter engine weights payouts by.
create or replace function public.add_review(
  p_contribution_id uuid, p_reviewer_id uuid, p_verdict public.review_verdict,
  p_impact int, p_notes text default ''
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_c       public.contributions;
  v_ms      public.milestones;
  v_latest  int;
  v_impact  int := coalesce(p_impact, 0);
  v_id      uuid;
  v_entry   public.ledger;
begin
  select * into v_c from public.contributions where id = p_contribution_id for update;
  if not found then
    raise exception 'add_review: contribution not found';
  end if;
  select * into v_ms from public.milestones where id = v_c.milestone_id;
  select max(version) into v_latest from public.charters where project_id = v_c.project_id;

  if not exists (
    select 1 from public.memberships m
    where m.project_id = v_c.project_id and m.user_id = p_reviewer_id and m.role = 'expert'
      and m.status = 'active' and m.charter_version = v_latest) then
    raise exception 'add_review: only an active expert on this project can review';
  end if;
  if v_c.author_id = p_reviewer_id then
    raise exception 'add_review: you cannot review your own work';
  end if;
  if v_ms.status in ('submitted', 'accepted', 'disputed') then
    raise exception 'add_review: milestone is %, reviews are closed', v_ms.status;
  end if;
  if exists (select 1 from public.reviews where contribution_id = v_c.id) then
    raise exception 'add_review: this contribution has already been reviewed';
  end if;
  if v_impact < 0 or v_impact > 10 then
    raise exception 'add_review: impact must be between 0 and 10';
  end if;
  -- Only approved work earns weight.
  if p_verdict <> 'approved' then
    v_impact := 0;
  end if;

  insert into public.reviews (contribution_id, reviewer_id, verdict, impact, notes)
  values (v_c.id, p_reviewer_id, p_verdict, v_impact, coalesce(p_notes, ''))
  returning id into v_id;

  v_entry := public.ledger_append_entry(v_c.project_id, p_reviewer_id::text, null, 'REVIEW_DONE',
    jsonb_build_object('review_id', v_id, 'contribution_id', v_c.id, 'author_id', v_c.author_id,
                       'verdict', p_verdict, 'impact', v_impact));

  update public.reviews set ledger_seq = v_entry.seq where id = v_id;

  return jsonb_build_object('review_id', v_id, 'impact', v_impact, 'seq', v_entry.seq, 'hash', v_entry.hash);
end;
$$;

-- The student lead (or the expert) submits a milestone for the sponsor's decision.
create or replace function public.submit_milestone(p_milestone_id uuid, p_actor_id uuid) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_ms      public.milestones;
  v_charter public.charters;
  v_entry   public.ledger;
begin
  select * into v_ms from public.milestones where id = p_milestone_id for update;
  if not found then
    raise exception 'submit_milestone: milestone not found';
  end if;
  select * into v_charter from public.charters
   where project_id = v_ms.project_id order by version desc limit 1;

  if not exists (
    select 1 from public.memberships m
    where m.project_id = v_ms.project_id and m.user_id = p_actor_id and m.status = 'active'
      and m.charter_version = v_charter.version and (m.is_lead or m.role = 'expert')) then
    raise exception 'submit_milestone: only the team lead or the expert can submit';
  end if;
  if not (v_ms.status in ('funded', 'rejected')
          or (v_ms.status = 'draft' and v_charter.model in ('knowledge_sharing', 'institutional_credit'))) then
    raise exception 'submit_milestone: milestone is %, not open for work', v_ms.status;
  end if;
  if not exists (
    select 1 from public.reviews r join public.contributions c on c.id = r.contribution_id
    where c.milestone_id = v_ms.id and r.verdict = 'approved') then
    raise exception 'submit_milestone: nothing to submit yet, no contribution has an approved review';
  end if;

  update public.milestones set status = 'submitted', submitted_at = clock_timestamp() where id = v_ms.id;

  v_entry := public.ledger_append_entry(v_ms.project_id, p_actor_id::text, null, 'MILESTONE_SUBMITTED',
    jsonb_build_object('milestone_id', v_ms.id, 'milestone', v_ms.title));

  return jsonb_build_object('seq', v_entry.seq, 'hash', v_entry.hash);
end;
$$;

revoke all on function
  public.add_review(uuid, uuid, public.review_verdict, int, text),
  public.submit_milestone(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.add_review(uuid, uuid, public.review_verdict, int, text),
  public.submit_milestone(uuid, uuid)
to service_role;

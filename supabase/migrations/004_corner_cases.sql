-- =============================================================================
-- 004_corner_cases.sql : The Executable Charter
-- State-changing functions for the corner cases: a member leaves, the charter
-- changes (paid -> unpaid), a milestone is rejected, and a dispute is raised
-- and resolved. Each writes the change AND its ledger entry in one transaction
-- and is callable by the service role only.
--
-- p_demo_by is set when an admin triggers the case from the demo controls; it
-- is recorded in the ledger payload so a simulated action is never mistaken
-- for a real one.
--
-- Run once in the Supabase SQL editor AFTER 003_agent_functions.sql. Safe to re-run.
-- =============================================================================

-- A member leaves (or is marked as having left). Credit for reviewed work is
-- kept, the equal share becomes pro-rata, and access ends at once because the
-- RLS helpers only count ACTIVE members.
--   p_active_fraction: share of the milestone they were active for; null keeps the current value.
create or replace function public.exit_member(
  p_project_id uuid, p_user_id uuid, p_active_fraction numeric default null, p_demo_by uuid default null
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_member public.memberships;
  v_frac   numeric;
  v_entry  public.ledger;
begin
  select * into v_member from public.memberships
   where project_id = p_project_id and user_id = p_user_id for update;
  if not found or v_member.role = 'sponsor' then
    raise exception 'exit_member: that person is not a team member of this project';
  end if;
  if v_member.status not in ('active', 'inactive') then
    raise exception 'exit_member: membership is %, nothing to exit', v_member.status;
  end if;
  v_frac := coalesce(p_active_fraction, v_member.active_fraction);
  if v_frac < 0 or v_frac > 1 then
    raise exception 'exit_member: active fraction must be between 0 and 1';
  end if;

  update public.memberships
     set status = 'exited', active_fraction = v_frac, exited_at = clock_timestamp()
   where id = v_member.id;

  v_entry := public.ledger_append_entry(p_project_id, p_user_id::text, null, 'MEMBER_EXITED',
    jsonb_strip_nulls(jsonb_build_object('user_id', p_user_id, 'role', v_member.role, 'active_fraction', v_frac,
      'kept', 'credit for reviewed work; pro-rata equal share', 'access', 'revoked',
      'demo_control_by', p_demo_by)));

  return jsonb_build_object('active_fraction', v_frac, 'seq', v_entry.seq, 'hash', v_entry.hash);
end;
$$;

-- The sponsor publishes a new charter version. Everyone's brief re-locks until
-- they re-accept (can_read_brief compares against the latest version). If the
-- new model is unpaid, escrow that has not been released is refunded.
create or replace function public.publish_charter_version(
  p_project_id uuid, p_sponsor_id uuid, p_model public.charter_model, p_terms jsonb, p_demo_by uuid default null
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_prev     public.charters;
  v_version  int;
  v_refunded numeric := 0;
  v_entry    public.ledger;
begin
  if not exists (select 1 from public.projects where id = p_project_id and sponsor_id = p_sponsor_id) then
    raise exception 'publish_charter_version: only the project sponsor can change the charter';
  end if;
  select * into v_prev from public.charters where project_id = p_project_id order by version desc limit 1;
  v_version := coalesce(v_prev.version, 0) + 1;

  insert into public.charters (project_id, version, model, terms, published_by)
  values (p_project_id, v_version, p_model, p_terms, p_sponsor_id);

  if p_model in ('knowledge_sharing', 'institutional_credit') then
    with refunded as (
      update public.escrows set status = 'refunded', updated_at = clock_timestamp()
       where project_id = p_project_id and status in ('funded', 'frozen')
      returning amount)
    select coalesce(sum(amount), 0) into v_refunded from refunded;
  end if;

  -- The sponsor wrote the new terms, so they are on it already.
  update public.memberships set charter_version = v_version
   where project_id = p_project_id and user_id = p_sponsor_id;

  v_entry := public.ledger_append_entry(p_project_id, p_sponsor_id::text, null, 'CHARTER_PUBLISHED',
    jsonb_strip_nulls(jsonb_build_object('charter_version', v_version, 'model', p_model,
      'previous_model', v_prev.model, 'escrow_refunded', v_refunded,
      'effect', 'brief re-locked until each member re-accepts; anyone may leave under the version they signed',
      'demo_control_by', p_demo_by)));

  return jsonb_build_object('charter_version', v_version, 'escrow_refunded', v_refunded,
                            'seq', v_entry.seq, 'hash', v_entry.hash);
end;
$$;

-- The sponsor rejects a submitted milestone. A rejection MUST cite the
-- acceptance criterion it failed, so it can be checked and disputed.
create or replace function public.reject_milestone(
  p_milestone_id uuid, p_sponsor_id uuid, p_criterion text, p_reason text, p_demo_by uuid default null
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_ms    public.milestones;
  v_entry public.ledger;
begin
  select * into v_ms from public.milestones where id = p_milestone_id for update;
  if not found then
    raise exception 'reject_milestone: milestone not found';
  end if;
  if not exists (select 1 from public.projects where id = v_ms.project_id and sponsor_id = p_sponsor_id) then
    raise exception 'reject_milestone: only the project sponsor can reject';
  end if;
  if v_ms.status <> 'submitted' then
    raise exception 'reject_milestone: milestone is %, expected submitted', v_ms.status;
  end if;
  if coalesce(trim(p_criterion), '') = '' then
    raise exception 'reject_milestone: a rejection must cite the acceptance criterion that was not met';
  end if;

  update public.milestones
     set status = 'rejected', decided_at = clock_timestamp(), rejection_criterion = p_criterion
   where id = v_ms.id;

  v_entry := public.ledger_append_entry(v_ms.project_id, p_sponsor_id::text, null, 'MILESTONE_REJECTED',
    jsonb_strip_nulls(jsonb_build_object('milestone_id', v_ms.id, 'milestone', v_ms.title,
      'criterion_cited', p_criterion, 'reason', coalesce(p_reason, ''), 'demo_control_by', p_demo_by)));

  return jsonb_build_object('seq', v_entry.seq, 'hash', v_entry.hash);
end;
$$;

-- A team member disputes a rejection. The milestone is marked disputed and its
-- escrow is frozen: nobody can release or refund it until an admin resolves it.
create or replace function public.raise_dispute(
  p_milestone_id uuid, p_user_id uuid, p_reason text, p_demo_by uuid default null
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_ms     public.milestones;
  v_id     uuid;
  v_frozen numeric := 0;
  v_entry  public.ledger;
begin
  select * into v_ms from public.milestones where id = p_milestone_id for update;
  if not found then
    raise exception 'raise_dispute: milestone not found';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.project_id = v_ms.project_id and m.user_id = p_user_id and m.status = 'active'
      and m.role in ('expert', 'student')) then
    raise exception 'raise_dispute: only an active team member can raise a dispute';
  end if;
  if v_ms.status <> 'rejected' then
    raise exception 'raise_dispute: milestone is %, only a rejection can be disputed', v_ms.status;
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'raise_dispute: say why the rejection is disputed';
  end if;

  insert into public.disputes (project_id, milestone_id, raised_by, reason, criterion_cited)
  values (v_ms.project_id, v_ms.id, p_user_id, p_reason, v_ms.rejection_criterion)
  returning id into v_id;

  update public.milestones set status = 'disputed' where id = v_ms.id;

  with frozen as (
    update public.escrows set status = 'frozen', updated_at = clock_timestamp()
     where milestone_id = v_ms.id and status = 'funded'
    returning amount)
  select coalesce(sum(amount), 0) into v_frozen from frozen;

  v_entry := public.ledger_append_entry(v_ms.project_id, p_user_id::text, null, 'DISPUTE_RAISED',
    jsonb_strip_nulls(jsonb_build_object('dispute_id', v_id, 'milestone_id', v_ms.id, 'milestone', v_ms.title,
      'reason', p_reason, 'criterion_cited', v_ms.rejection_criterion, 'escrow_frozen', v_frozen,
      'demo_control_by', p_demo_by)));

  return jsonb_build_object('dispute_id', v_id, 'escrow_frozen', v_frozen, 'seq', v_entry.seq, 'hash', v_entry.hash);
end;
$$;

-- A platform admin resolves a dispute and unfreezes the escrow.
--   'team'    : the rejection did not hold. The milestone goes back to submitted.
--   'sponsor' : the rejection holds. The milestone stays rejected and the team reworks it.
create or replace function public.resolve_dispute(
  p_dispute_id uuid, p_admin_id uuid, p_in_favour_of text, p_resolution text
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_d     public.disputes;
  v_entry public.ledger;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'resolve_dispute: only a platform admin can resolve a dispute';
  end if;
  select * into v_d from public.disputes where id = p_dispute_id for update;
  if not found then
    raise exception 'resolve_dispute: dispute not found';
  end if;
  if v_d.status <> 'open' then
    raise exception 'resolve_dispute: dispute is already %', v_d.status;
  end if;
  if p_in_favour_of not in ('team', 'sponsor') then
    raise exception 'resolve_dispute: decide in favour of the team or the sponsor';
  end if;
  if coalesce(trim(p_resolution), '') = '' then
    raise exception 'resolve_dispute: write down the reason for the decision';
  end if;

  update public.disputes
     set status = 'resolved', resolution = p_resolution, resolved_by = p_admin_id, resolved_at = clock_timestamp()
   where id = v_d.id;
  update public.milestones
     set status = case when p_in_favour_of = 'team' then 'submitted' else 'rejected' end::public.milestone_status
   where id = v_d.milestone_id and status = 'disputed';
  update public.escrows set status = 'funded', updated_at = clock_timestamp()
   where milestone_id = v_d.milestone_id and status = 'frozen';

  v_entry := public.ledger_append_entry(v_d.project_id, p_admin_id::text, null, 'DISPUTE_RESOLVED',
    jsonb_build_object('dispute_id', v_d.id, 'milestone_id', v_d.milestone_id, 'in_favour_of', p_in_favour_of,
                       'resolution', p_resolution, 'escrow', 'unfrozen'));

  return jsonb_build_object('seq', v_entry.seq, 'hash', v_entry.hash);
end;
$$;

-- accept_milestone, replaced so it also handles a milestone whose escrow was
-- refunded when the charter went unpaid: it can still be accepted for credit
-- and credentials, but nothing can be paid from it. Everything else is as in 001.
create or replace function public.accept_milestone(
  p_milestone_id uuid, p_actor_id uuid, p_charter_version int,
  p_payouts jsonb default '[]'::jsonb, p_credentials jsonb default '[]'::jsonb,
  p_summary jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_ms       public.milestones;
  v_escrow   public.escrows;
  v_entry    public.ledger;
  v_pay      public.ledger;
  v_item     jsonb;
  v_total    numeric := 0;
  v_ref      text;
  v_latest   int;
  v_paid     int := 0;
  v_creds    int := 0;
  v_monetary boolean := false;
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
    if v_escrow.status = 'funded' then
      update public.escrows set status = 'released', updated_at = clock_timestamp() where id = v_escrow.id;
      v_monetary := true;
    elsif v_escrow.status = 'refunded' then
      if v_total > 0 then
        raise exception 'accept_milestone: escrow was refunded, nothing can be paid from it';
      end if;
    else
      raise exception 'accept_milestone: escrow is %, cannot release', v_escrow.status;
    end if;
  elsif v_ms.amount > 0 then
    raise exception 'accept_milestone: milestone has an amount but no escrow';
  end if;

  update public.milestones set status = 'accepted', decided_at = clock_timestamp() where id = v_ms.id;

  v_entry := public.ledger_append_entry(v_ms.project_id, p_actor_id::text, null, 'MILESTONE_ACCEPTED',
    jsonb_build_object('milestone_id', v_ms.id, 'milestone', v_ms.title, 'amount', v_ms.amount,
                       'charter_version', p_charter_version, 'escrow_reference', v_escrow.reference,
                       'paid_total', v_total, 'summary', coalesce(p_summary, '{}'::jsonb)));

  -- Money rows only where money is released: an unpaid project shows no payment at all.
  if v_monetary then
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

revoke all on function
  public.exit_member(uuid, uuid, numeric, uuid),
  public.publish_charter_version(uuid, uuid, public.charter_model, jsonb, uuid),
  public.reject_milestone(uuid, uuid, text, text, uuid),
  public.raise_dispute(uuid, uuid, text, uuid),
  public.resolve_dispute(uuid, uuid, text, text),
  public.accept_milestone(uuid, uuid, int, jsonb, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function
  public.exit_member(uuid, uuid, numeric, uuid),
  public.publish_charter_version(uuid, uuid, public.charter_model, jsonb, uuid),
  public.reject_milestone(uuid, uuid, text, text, uuid),
  public.raise_dispute(uuid, uuid, text, uuid),
  public.resolve_dispute(uuid, uuid, text, text),
  public.accept_milestone(uuid, uuid, int, jsonb, jsonb, jsonb)
to service_role;

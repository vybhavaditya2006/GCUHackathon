-- =============================================================================
-- 003_agent_functions.sql : The Executable Charter
-- State-changing functions for AI agent drafts, scoping approval and invitations.
-- Like the ones in 001 and 002, each writes the change AND its ledger entry in
-- one transaction and is callable by the service role only.
--
-- Run once in the Supabase SQL editor AFTER 002_work_functions.sql. Safe to re-run.
-- =============================================================================

-- The gateway records what an agent produced. It is only ever a DRAFT, and the
-- ledger entry names the human owner (ledger_append_entry refuses an agent without one).
create or replace function public.record_agent_draft(
  p_project_id uuid, p_milestone_id uuid, p_agent text, p_owner_id uuid, p_input_summary text,
  p_output jsonb, p_model text, p_tokens_in int, p_tokens_out int, p_cost numeric, p_summary text
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_latest int;
  v_id     uuid;
  v_entry  public.ledger;
begin
  if p_agent not in ('scoping', 'matching', 'research', 'coding', 'review') then
    raise exception 'record_agent_draft: unknown agent "%"', p_agent;
  end if;
  select max(version) into v_latest from public.charters where project_id = p_project_id;

  -- The owner must be the sponsor, an ACTIVE member who accepted the current
  -- charter, or (for matching only) a platform admin.
  if not (
    exists (select 1 from public.projects where id = p_project_id and sponsor_id = p_owner_id)
    or exists (
      select 1 from public.memberships m
      where m.project_id = p_project_id and m.user_id = p_owner_id and m.status = 'active'
        and m.charter_version = v_latest)
    or (p_agent = 'matching'
        and exists (select 1 from public.profiles where id = p_owner_id and role = 'admin'))
  ) then
    raise exception 'record_agent_draft: the owner must be an active member who accepted the current charter';
  end if;
  if p_milestone_id is not null and not exists (
    select 1 from public.milestones where id = p_milestone_id and project_id = p_project_id) then
    raise exception 'record_agent_draft: milestone does not belong to this project';
  end if;

  insert into public.agent_drafts (project_id, milestone_id, agent, owner_id, input_summary, output, model,
                                   tokens_in, tokens_out, cost)
  values (p_project_id, p_milestone_id, p_agent, p_owner_id, coalesce(p_input_summary, ''),
          coalesce(p_output, '{}'::jsonb), p_model, coalesce(p_tokens_in, 0), coalesce(p_tokens_out, 0),
          coalesce(p_cost, 0))
  returning id into v_id;

  v_entry := public.ledger_append_entry(p_project_id, 'agent:' || p_agent, p_owner_id, 'AGENT_ACTION',
    jsonb_build_object('agent', p_agent, 'draft_id', v_id, 'summary', coalesce(p_summary, ''),
                       'model', p_model, 'tokens_in', coalesce(p_tokens_in, 0),
                       'tokens_out', coalesce(p_tokens_out, 0), 'cost', coalesce(p_cost, 0)));

  update public.agent_drafts set ledger_seq = v_entry.seq where id = v_id;

  return jsonb_build_object('draft_id', v_id, 'seq', v_entry.seq, 'hash', v_entry.hash);
end;
$$;

-- The owner approves a research / coding draft: only now does it become a
-- contribution, credited to the human owner with the AI share disclosed.
create or replace function public.approve_agent_draft(
  p_draft_id uuid, p_owner_id uuid, p_title text, p_artefact_name text, p_artefact_hash text,
  p_ai_share numeric, p_ai_declaration text, p_edited boolean default false
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_draft  public.agent_drafts;
  v_entry  public.ledger;
  v_result jsonb;
begin
  select * into v_draft from public.agent_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'approve_agent_draft: draft not found';
  end if;
  if v_draft.owner_id <> p_owner_id then
    raise exception 'approve_agent_draft: only the human who owns this draft can approve it';
  end if;
  if v_draft.status <> 'pending' then
    raise exception 'approve_agent_draft: draft is already %', v_draft.status;
  end if;
  if v_draft.agent not in ('research', 'coding') or v_draft.milestone_id is null then
    raise exception 'approve_agent_draft: only a research or coding draft on a milestone becomes a contribution';
  end if;

  v_entry := public.ledger_append_entry(v_draft.project_id, p_owner_id::text, null, 'AGENT_DRAFT_APPROVED',
    jsonb_build_object('agent', v_draft.agent, 'draft_id', v_draft.id, 'edited', coalesce(p_edited, false)));

  -- add_contribution re-checks membership, the charter version and the milestone status.
  v_result := public.add_contribution(v_draft.milestone_id, p_owner_id, p_title, p_artefact_name,
                                      p_artefact_hash, p_ai_declaration, v_draft.agent, p_ai_share, 0);

  update public.agent_drafts
     set status = 'approved', decided_at = clock_timestamp(),
         contribution_id = (v_result ->> 'contribution_id')::uuid
   where id = v_draft.id;

  return v_result || jsonb_build_object('approved_seq', v_entry.seq);
end;
$$;

-- The sponsor approves the scoping agent's proposal (after editing it if they wish).
-- Milestones are created from it only when the project has none yet.
--   p_milestones: [{"title": text, "requiredSkills": [text], "acceptanceCriteria": text}]
create or replace function public.approve_scoping_draft(
  p_draft_id uuid, p_sponsor_id uuid, p_milestones jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_draft   public.agent_drafts;
  v_entry   public.ledger;
  v_item    jsonb;
  v_pos     int := 0;
  v_created boolean := false;
begin
  select * into v_draft from public.agent_drafts where id = p_draft_id for update;
  if not found or v_draft.agent <> 'scoping' then
    raise exception 'approve_scoping_draft: scoping draft not found';
  end if;
  if not exists (select 1 from public.projects where id = v_draft.project_id and sponsor_id = p_sponsor_id) then
    raise exception 'approve_scoping_draft: only the project sponsor can approve the scope';
  end if;
  if v_draft.status <> 'pending' then
    raise exception 'approve_scoping_draft: draft is already %', v_draft.status;
  end if;
  if jsonb_array_length(coalesce(p_milestones, '[]'::jsonb)) = 0 then
    raise exception 'approve_scoping_draft: there are no milestones to approve';
  end if;

  if not exists (select 1 from public.milestones where project_id = v_draft.project_id) then
    v_created := true;
    for v_item in select * from jsonb_array_elements(p_milestones) loop
      v_pos := v_pos + 1;
      insert into public.milestones (project_id, position, title, required_skills, acceptance_criteria)
      values (v_draft.project_id, v_pos, v_item ->> 'title',
              array(select jsonb_array_elements_text(coalesce(v_item -> 'requiredSkills', '[]'::jsonb))),
              coalesce(v_item ->> 'acceptanceCriteria', ''));
    end loop;
  end if;

  update public.agent_drafts set status = 'approved', decided_at = clock_timestamp() where id = v_draft.id;

  v_entry := public.ledger_append_entry(v_draft.project_id, p_sponsor_id::text, null, 'MILESTONES_APPROVED',
    jsonb_build_object('draft_id', v_draft.id, 'milestones_created', v_created,
      'milestones', (select jsonb_agg(e ->> 'title') from jsonb_array_elements(p_milestones) e)));

  return jsonb_build_object('milestones_created', v_created, 'seq', v_entry.seq, 'hash', v_entry.hash);
end;
$$;

-- The sponsor invites a matched candidate. They still have to accept the charter.
create or replace function public.invite_member(
  p_project_id uuid, p_sponsor_id uuid, p_user_id uuid, p_role public.member_role
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_name  text;
  v_entry public.ledger;
begin
  if not exists (select 1 from public.projects where id = p_project_id and sponsor_id = p_sponsor_id) then
    raise exception 'invite_member: only the project sponsor can invite';
  end if;
  if p_role not in ('expert', 'student') then
    raise exception 'invite_member: invite an expert or a student';
  end if;
  select full_name into v_name from public.profiles where id = p_user_id and role::text = p_role::text;
  if not found then
    raise exception 'invite_member: that person is not a registered %', p_role;
  end if;
  if exists (select 1 from public.memberships where project_id = p_project_id and user_id = p_user_id) then
    raise exception 'invite_member: % is already invited or on the team', v_name;
  end if;

  insert into public.memberships (project_id, user_id, role, status)
  values (p_project_id, p_user_id, p_role, 'invited');

  v_entry := public.ledger_append_entry(p_project_id, p_sponsor_id::text, null, 'MEMBER_INVITED',
    jsonb_build_object('user_id', p_user_id, 'name', v_name, 'role', p_role));

  return jsonb_build_object('seq', v_entry.seq, 'hash', v_entry.hash);
end;
$$;

revoke all on function
  public.record_agent_draft(uuid, uuid, text, uuid, text, jsonb, text, int, int, numeric, text),
  public.approve_agent_draft(uuid, uuid, text, text, text, numeric, text, boolean),
  public.approve_scoping_draft(uuid, uuid, jsonb),
  public.invite_member(uuid, uuid, uuid, public.member_role)
from public, anon, authenticated;

grant execute on function
  public.record_agent_draft(uuid, uuid, text, uuid, text, jsonb, text, int, int, numeric, text),
  public.approve_agent_draft(uuid, uuid, text, text, text, numeric, text, boolean),
  public.approve_scoping_draft(uuid, uuid, jsonb),
  public.invite_member(uuid, uuid, uuid, public.member_role)
to service_role;

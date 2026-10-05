-- reset.sql : drop everything the migrations (001 to 003) create, so they can be run again.
-- DESTROYS all app data and the ledger. Seeded auth users are removed too.

drop table if exists
  public.ledger, public.agent_drafts, public.disputes, public.payouts, public.escrows, public.reviews,
  public.contributions, public.milestones, public.memberships, public.charters, public.project_briefs,
  public.projects, public.profiles
  cascade;

drop sequence if exists public.ledger_seq_seq;

drop function if exists
  public.ledger_hash(text, bigint, timestamptz, text, uuid, text, jsonb),
  public.ledger_append_entry(uuid, text, uuid, text, jsonb, timestamptz),
  public.ledger_append(uuid, text, uuid, text, jsonb),
  public.ledger_verify(),
  public.ledger_block_change(),
  public.is_admin(),
  public.is_project_sponsor(uuid),
  public.is_project_member(uuid),
  public.latest_charter_version(uuid),
  public.can_read_brief(uuid),
  public.accept_charter(uuid, uuid, boolean),
  public.fund_escrow(uuid, uuid),
  public.add_contribution(uuid, uuid, text, text, text, text, text, numeric, numeric),
  public.accept_milestone(uuid, uuid, int, jsonb, jsonb, jsonb),
  public.add_review(uuid, uuid, public.review_verdict, int, text),
  public.submit_milestone(uuid, uuid),
  public.record_agent_draft(uuid, uuid, text, uuid, text, jsonb, text, int, int, numeric, text),
  public.approve_agent_draft(uuid, uuid, text, text, text, numeric, text, boolean),
  public.approve_scoping_draft(uuid, uuid, jsonb),
  public.invite_member(uuid, uuid, uuid, public.member_role)
  cascade;

drop type if exists
  public.user_role, public.member_role, public.charter_model, public.membership_status,
  public.milestone_status, public.escrow_status, public.review_verdict, public.dispute_status,
  public.draft_status
  cascade;

-- Last, once nothing references them any more.
delete from auth.users where email like '%@charter.test';

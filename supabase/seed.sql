-- =============================================================================
-- seed.sql : synthetic demo data for The Executable Charter
-- ALL people, organisations, projects and payments here are made up.
-- Every seeded user signs in with the password: demo1234
--
-- Run in the Supabase SQL editor AFTER 001_schema.sql. Safe to re-run: it wipes
-- the app tables, the ledger and the seeded auth users, then rebuilds them.
--
-- State after seeding
--   Project 1 (FUNDED, Rs 1,00,000): team joined, escrow funded, work reviewed
--     (impacts Priya 5, Arjun 3, Meera 2), Milestone 1 SUBMITTED and awaiting the
--     sponsor. Accepting it live produces the payouts and receipts.
--   Project 2 (KNOWLEDGE-SHARING, Rs 0): work reviewed, milestone SUBMITTED;
--     Ananya is INVITED but has not accepted, so her brief is still locked.
--
-- Dates are the literal story dates from the PoC sheets: posted 5 Oct 2026,
-- Milestone 1 submitted 26 Oct 2026, project runs to 16 Nov 2026 (India time).
-- Entries added live during the demo carry the real clock time, so they are
-- dated EARLIER than the last seeded entries; the chain order (seq) is what counts.
-- The seed is the one place that writes tables directly and backdates ledger
-- entries; the app itself only ever uses the functions in 001_schema.sql.
-- =============================================================================

-- One transaction: if anything fails, nothing is wiped.
begin;

-- ---- wipe ------------------------------------------------------------------
alter table public.ledger disable trigger ledger_no_truncate;
truncate table
  public.ledger, public.agent_drafts, public.disputes, public.payouts, public.escrows, public.reviews,
  public.contributions, public.milestones, public.memberships, public.charters, public.project_briefs,
  public.projects, public.profiles
  cascade;
alter table public.ledger enable trigger ledger_no_truncate;
alter sequence public.ledger_seq_seq restart with 1;
delete from auth.users where email like '%@charter.test';

-- ---- helpers (session-local) -----------------------------------------------
-- Story day p_day at p_time, India time. Day 0 = project posted = 5 Oct 2026.
create or replace function pg_temp.at(p_day int, p_time time) returns timestamptz
language sql immutable as $$
  select ((date '2026-10-05' + p_day) + p_time) at time zone 'Asia/Kolkata';
$$;

-- Stand-in SHA-256 fingerprint for a seeded artefact (there is no real file).
create or replace function pg_temp.fp(p_name text) returns text
language sql immutable as $$
  select encode(extensions.digest(convert_to('synthetic-artefact:' || p_name, 'UTF8'), 'sha256'), 'hex');
$$;

-- ---- users -----------------------------------------------------------------
create temporary table _seed_users (
  id uuid, email text, full_name text, role public.user_role, organisation text, verified boolean,
  skills text[], proven_skills text[], completed_projects int, interests text[], hours_per_week int,
  affiliations text[], is_minor boolean, guardian_consent boolean
) on commit drop;

insert into _seed_users values
  ('a0000000-0000-4000-8000-000000000001', 'anjali@charter.test', 'Dr. Anjali Rao', 'sponsor', 'NetraVision Labs', true,
   '{}', '{}', 0, '{Medical imaging,Public health}', 0, '{NetraVision Labs}', false, false),
  ('a0000000-0000-4000-8000-000000000002', 'kiran@charter.test', 'Dr. Kiran Shetty', 'expert', 'Independent researcher', true,
   '{Medical imaging,CNN,Model evaluation,Scientific writing}', '{Medical imaging,Model evaluation}', 6,
   '{Retinal imaging,Diabetic retinopathy}', 10, '{}', false, false),
  ('a0000000-0000-4000-8000-000000000003', 'priya@charter.test', 'Priya Nair', 'student', 'Synthetic College of Engineering', true,
   '{CNN,Medical imaging,Dataset curation,Python}', '{Medical imaging,CNN}', 2,
   '{Medical imaging,Computer vision}', 12, '{}', false, false),
  ('a0000000-0000-4000-8000-000000000004', 'arjun@charter.test', 'Arjun Mehta', 'student', 'Synthetic College of Engineering', true,
   '{CNN,Python,TensorFlow Lite}', '{}', 0, '{Computer vision,Edge devices}', 15, '{}', false, false),
  ('a0000000-0000-4000-8000-000000000005', 'meera@charter.test', 'Meera Iyer', 'student', 'Synthetic Institute of Technology', true,
   '{TensorFlow Lite,Model quantisation,CNN}', '{Model quantisation}', 1, '{Edge devices,Embedded ML}', 10, '{}', false, false),
  ('a0000000-0000-4000-8000-000000000006', 'rohan@charter.test', 'Rohan Das', 'student', 'Synthetic Institute of Technology', true,
   '{CNN,Medical imaging,TensorFlow Lite}', '{CNN}', 1, '{Medical imaging}', 12, '{OptiScan AI}', false, false),
  ('a0000000-0000-4000-8000-000000000007', 'admin@charter.test', 'Ms. Fernandes', 'admin', 'Executable Charter (platform)', true,
   '{}', '{}', 0, '{}', 0, '{}', false, false),
  ('a0000000-0000-4000-8000-000000000008', 'sana@charter.test', 'Sana Khan', 'student', 'Synthetic College of Science', true,
   '{Literature review,Medical imaging,Scientific writing}', '{Literature review}', 1, '{Public health,Diabetic retinopathy}', 8, '{}', false, false),
  ('a0000000-0000-4000-8000-000000000009', 'dev@charter.test', 'Dev Patel', 'student', 'Synthetic College of Science', true,
   '{Python,Data analysis,Literature review}', '{}', 0, '{Public health,Data analysis}', 8, '{}', false, false),
  ('a0000000-0000-4000-8000-000000000010', 'ananya@charter.test', 'Ananya Gupta', 'student', 'Synthetic College of Engineering', true,
   '{CNN,PyTorch,Medical imaging,Literature review}', '{}', 0, '{Medical imaging}', 12, '{}', false, false),
  ('a0000000-0000-4000-8000-000000000011', 'farhan@charter.test', 'Farhan Ali', 'student', 'Synthetic Institute of Technology', true,
   '{TensorFlow Lite,Model quantisation}', '{}', 0, '{Edge devices}', 4, '{}', false, false),
  ('a0000000-0000-4000-8000-000000000012', 'lakshmi@charter.test', 'Lakshmi Menon', 'student', 'Synthetic College of Engineering', false,
   '{Dataset curation,CNN}', '{}', 0, '{Computer vision}', 10, '{}', false, false),
  ('a0000000-0000-4000-8000-000000000013', 'tara@charter.test', 'Tara Joseph', 'student', 'Synthetic Pre-University College', true,
   '{CNN,Dataset curation}', '{}', 0, '{Computer vision}', 10, '{}', true, false);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', u.full_name, 'synthetic', true), now(), now(),
       '', '', '', ''
from _seed_users u;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from _seed_users u;

insert into public.profiles (id, full_name, role, organisation, verified, skills, proven_skills,
                             completed_projects, interests, hours_per_week, affiliations, is_minor,
                             guardian_consent, created_at)
select id, full_name, role, organisation, verified, skills, proven_skills, completed_projects, interests,
       hours_per_week, affiliations, is_minor, guardian_consent, pg_temp.at(-30, '09:00')
from _seed_users;

-- ---- projects --------------------------------------------------------------
insert into public.projects (id, sponsor_id, title, problem_statement, public_summary, required_skills,
                             sensitivity, competitors, hours_per_week, start_date, end_date, status, created_at)
values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Low-cost detection of diabetic retinopathy from fundus images on edge devices',
   'Diabetic retinopathy causes preventable blindness, but rural clinics can''t afford specialist screening. We need a model that flags at-risk patients from a fundus photo on a low-cost phone or edge device, offline, with accuracy close to a specialist.',
   E'Goal: screening model under 10 MB that runs offline\nData: de-identified retinal images (provided after joining)\nDeliverables: dataset pipeline, baseline model, accuracy report\nTeam: 1 expert + 3 students\nOutcome: payment + co-authorship on any paper',
   '{CNN,Medical imaging,TensorFlow Lite,Model quantisation,Dataset curation}',
   'high', '{OptiScan AI}', 10,
   pg_temp.at(0, '10:02')::date, pg_temp.at(42, '10:02')::date, 'active', pg_temp.at(0, '10:02')),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'Literature review: low-cost DR screening',
   'Before funding more model work we want an open, citable review of what already works for low-cost diabetic retinopathy screening, and where the evidence is thin.',
   E'Goal: an annotated review of 20 papers on low-cost DR screening\nData: published papers only, nothing confidential beyond the reading list\nDeliverables: evidence table, device survey, short summary\nTeam: 1 expert + up to 3 students\nOutcome: certificate, co-author credit and an expert recommendation. No payment.',
   '{Literature review,Scientific writing,Medical imaging,Data analysis}',
   'low', '{}', 6,
   pg_temp.at(8, '09:30')::date, pg_temp.at(36, '09:30')::date, 'active', pg_temp.at(8, '09:30'));

insert into public.project_briefs (project_id, content, updated_at) values
  ('b0000000-0000-4000-8000-000000000001',
   E'Partner hospital: Drishti Eye Institute, Bengaluru (synthetic).\nDataset: 2,000 labelled fundus images graded 0-4 by two ophthalmologists.\nTarget: >= 90% sensitivity at grade 2+.\nDevice: Kestrel-2 edge board, 2 GB RAM.\nClinical pilot planned Q1 2027 with 12 clinics.',
   pg_temp.at(0, '10:02')),
  ('b0000000-0000-4000-8000-000000000002',
   E'Reading list: 20 papers chosen by the sponsor (2019-2026), shared as a private folder.\nFocus questions: sensitivity at grade 2+, device cost, offline capability, who graded the ground truth.\nOut of scope: commercial products, unpublished vendor claims.',
   pg_temp.at(8, '09:30'));

insert into public.charters (project_id, version, model, terms, published_by, published_at) values
  ('b0000000-0000-4000-8000-000000000001', 1, 'funded',
   '{"feePct":10,"aiReservePct":5,"expertPct":30,"equalPct":40,"weightedPct":60,
     "ip":"Sponsor owns IP; team co-authors",
     "confidentiality":"High; approved AI models only",
     "onExit":"Credit kept; pro-rata share",
     "sponsorSilentDays":10,"inactivityNudgeDays":5,"inactivityDays":7,
     "minorsNeedGuardianConsent":true,
     "credentials":["Contributor credential","Co-authorship on any resulting paper"]}'::jsonb,
   'a0000000-0000-4000-8000-000000000001', pg_temp.at(0, '10:02')),
  ('b0000000-0000-4000-8000-000000000002', 1, 'knowledge_sharing',
   '{"feePct":0,"aiReservePct":0,"expertPct":0,"equalPct":40,"weightedPct":60,
     "ip":"Open; published under CC BY",
     "confidentiality":"Low; reading list only",
     "onExit":"Credit kept for reviewed work",
     "sponsorSilentDays":10,"inactivityNudgeDays":5,"inactivityDays":7,
     "minorsNeedGuardianConsent":false,
     "credentials":["Certificate of contribution","Co-author credit","Expert recommendation"]}'::jsonb,
   'a0000000-0000-4000-8000-000000000001', pg_temp.at(8, '09:30'));

insert into public.memberships (project_id, user_id, role, is_lead, status, charter_version,
                                model_acknowledged, active_fraction, invited_at, accepted_at)
values
  -- Project 1
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'sponsor', false, 'active', 1, true, 1, pg_temp.at(0, '10:02'), pg_temp.at(0, '10:02')),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'expert',  false, 'active', 1, true, 1, pg_temp.at(0, '11:30'), pg_temp.at(1, '09:40')),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'student', true,  'active', 1, true, 1, pg_temp.at(0, '11:30'), pg_temp.at(1, '09:42')),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'student', false, 'active', 1, true, 1, pg_temp.at(0, '11:30'), pg_temp.at(1, '09:47')),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'student', false, 'active', 1, true, 1, pg_temp.at(0, '11:30'), pg_temp.at(1, '09:55')),
  -- Project 2 (Ananya is invited but has not accepted: her brief stays locked)
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'sponsor', false, 'active', 1, true, 1, pg_temp.at(8, '09:30'), pg_temp.at(8, '09:30')),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'expert',  false, 'active', 1, true, 1, pg_temp.at(9, '10:00'), pg_temp.at(9, '15:10')),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000008', 'student', true,  'active', 1, true, 1, pg_temp.at(9, '10:00'), pg_temp.at(9, '18:20')),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000009', 'student', false, 'active', 1, true, 1, pg_temp.at(9, '10:00'), pg_temp.at(10, '08:45')),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000010', 'student', false, 'invited', null, false, 1, pg_temp.at(9, '10:00'), null);

insert into public.milestones (id, project_id, position, title, required_skills, acceptance_criteria,
                               amount, status, due_date, submitted_at)
values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 1,
   'Dataset + baseline model', '{Dataset curation,CNN,Medical imaging}',
   '>= 90% sensitivity on the held-out set', 100000, 'submitted',
   pg_temp.at(21, '10:00')::date, pg_temp.at(21, '10:00')),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 2,
   'Edge-device optimisation', '{TensorFlow Lite,Model quantisation}',
   'Model < 10 MB and < 2 s per image on the target device', 0, 'draft',
   pg_temp.at(42, '10:00')::date, null),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 1,
   'Annotated literature review (20 papers)', '{Literature review,Scientific writing}',
   'All 20 papers summarised with sensitivity, device cost and grading method', 0, 'submitted',
   pg_temp.at(22, '10:00')::date, pg_temp.at(20, '16:00'));

insert into public.escrows (project_id, milestone_id, amount, status, reference, funded_at, updated_at) values
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 100000, 'funded',
   'SIM-ESC-0417', pg_temp.at(1, '11:00'), pg_temp.at(1, '11:00'));

insert into public.contributions (id, project_id, milestone_id, author_id, title, agent_used, ai_share,
                                  artefact_name, artefact_hash, similarity, flagged, ai_declaration, created_at)
values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000003', 'Literature summary, 12 papers', 'research', 0.80,
   'lit_review.pdf', pg_temp.fp('lit_review.pdf'), 0.060, false,
   'Drafted by the Research Agent; I checked every citation and rewrote the conclusions.', pg_temp.at(3, '16:20')),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000003', 'Cleaned + split 2,000 images', null, 0,
   'data_split.py', pg_temp.fp('data_split.py'), 0.040, false, 'No AI used.', pg_temp.at(5, '14:05')),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000004', 'Preprocessing pipeline', 'coding', 0.70,
   'preprocess.py', pg_temp.fp('preprocess.py'), 0.110, false,
   'Draft by the Coding Agent; I edited the augmentation steps and approved it.', pg_temp.at(7, '19:30')),
  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000005', 'Baseline CNN notes', null, 0,
   'cnn_notes.md', pg_temp.fp('cnn_notes.md'), 0.820, true, 'No AI used.', pg_temp.at(10, '11:10')),
  ('d0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000005', 'Resubmitted original work + training run', null, 0,
   'train_v2.ipynb', pg_temp.fp('train_v2.ipynb'), 0.090, false, 'No AI used.', pg_temp.at(11, '09:25')),
  ('d0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000008', 'Screening-accuracy evidence table (12 papers)', null, 0,
   'evidence_table.csv', pg_temp.fp('evidence_table.csv'), 0.050, false, 'No AI used.', pg_temp.at(13, '17:40')),
  ('d0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003',
   'a0000000-0000-4000-8000-000000000009', 'Low-cost device survey (8 papers)', null, 0,
   'device_survey.md', pg_temp.fp('device_survey.md'), 0.070, false, 'No AI used.', pg_temp.at(14, '12:15'));

insert into public.reviews (id, contribution_id, reviewer_id, verdict, impact, notes, created_at) values
  ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   'approved', 1, 'Useful map of prior work; mostly agent-drafted, lightly edited.', pg_temp.at(4, '10:30')),
  ('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
   'approved', 4, 'Clean patient-level split, no leakage. The whole milestone depends on this.', pg_temp.at(6, '11:00')),
  ('f0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002',
   'approved', 3, 'Pipeline works end to end; human edits to augmentation were the important part.', pg_temp.at(8, '10:15')),
  ('f0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002',
   'approved', 2, 'Original training run, reproducible. Replaces the flagged notes.', pg_temp.at(12, '09:50')),
  ('f0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000002',
   'approved', 6, 'Thorough and consistent extraction across 12 papers.', pg_temp.at(16, '11:20')),
  ('f0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000002',
   'approved', 4, 'Good coverage of devices; cost figures need sources in two rows.', pg_temp.at(16, '11:45'));

-- Seeded agent runs are synthetic history (no LLM was called for them).
insert into public.agent_drafts (id, project_id, milestone_id, agent, owner_id, input_summary, output, model,
                                 tokens_in, tokens_out, cost, status, contribution_id, created_at, decided_at)
values
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', null, 'scoping',
   'a0000000-0000-4000-8000-000000000001', 'Problem statement + confidential brief',
   '{"milestones":[{"title":"Dataset + baseline model","weeks":3},{"title":"Edge-device optimisation","weeks":3}],"team":"1 expert reviewer, 3 students"}'::jsonb,
   'synthetic-seed', 2100, 640, 310, 'approved', null, pg_temp.at(0, '10:15'), pg_temp.at(0, '10:24')),
  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'research',
   'a0000000-0000-4000-8000-000000000003', '12 papers from this project''s reading folder',
   '{"summary":"Draft literature summary of 12 papers on DR screening models."}'::jsonb,
   'synthetic-seed', 5200, 1900, 520, 'approved', 'd0000000-0000-4000-8000-000000000001', pg_temp.at(3, '15:40'), pg_temp.at(3, '16:18')),
  ('e0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'coding',
   'a0000000-0000-4000-8000-000000000004', 'data_split.py + dataset description',
   '{"summary":"Draft preprocessing pipeline: resize, CLAHE, normalise, augment."}'::jsonb,
   'synthetic-seed', 900, 600, 42, 'approved', 'd0000000-0000-4000-8000-000000000003', pg_temp.at(7, '18:05'), pg_temp.at(7, '19:28')),
  ('e0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'review',
   'a0000000-0000-4000-8000-000000000002', 'Submission package + acceptance criteria',
   '{"criteria":[{"criterion":">= 90% sensitivity on the held-out set","met":true,"evidence":"91.4% sensitivity"}]}'::jsonb,
   'synthetic-seed', 3100, 500, 308, 'approved', null, pg_temp.at(15, '17:45'), pg_temp.at(15, '18:05'));

-- ---- ledger ----------------------------------------------------------------
-- Staged here, then appended in time order so the chain reads chronologically.
create temporary table _seed_events (
  ord serial, ts timestamptz, project_id uuid, actor text, on_behalf_of uuid, event text, payload jsonb
) on commit drop;

insert into _seed_events (ts, project_id, actor, on_behalf_of, event, payload) values
  -- Project 1: post, scope, match, join, fund
  (pg_temp.at(0, '10:02'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', null, 'PROJECT_POSTED',
   '{"title":"Low-cost detection of diabetic retinopathy from fundus images on edge devices","sensitivity":"high"}'),
  (pg_temp.at(0, '10:03'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', null, 'CHARTER_PUBLISHED',
   '{"charter_version":1,"model":"funded","artefact":"charter_v1.json","feePct":10,"aiReservePct":5,"expertPct":30,"equalPct":40,"weightedPct":60}'),
  (pg_temp.at(0, '10:15'), 'b0000000-0000-4000-8000-000000000001', 'agent:scoping', 'a0000000-0000-4000-8000-000000000001', 'AGENT_ACTION',
   '{"agent":"scoping","draft_id":"e0000000-0000-4000-8000-000000000001","summary":"Proposed 2 milestones + skills","artefact":"scope_draft.md","ai_share":0.9,"model":"synthetic-seed","tokens_in":2100,"tokens_out":640,"cost":310}'),
  (pg_temp.at(0, '10:24'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', null, 'MILESTONES_APPROVED',
   '{"draft_id":"e0000000-0000-4000-8000-000000000001","milestones":["Dataset + baseline model","Edge-device optimisation"],"edited":"Sponsor edited 1 acceptance criterion before approving"}'),
  (pg_temp.at(0, '11:05'), 'b0000000-0000-4000-8000-000000000001', 'agent:matching', 'a0000000-0000-4000-8000-000000000007', 'MATCH_RUN',
   '{"shortlisted":["Dr. Kiran Shetty","Priya Nair","Arjun Mehta","Meera Iyer"],"excluded":[{"name":"Rohan Das","reason":"conflict_of_interest"}]}'),
  (pg_temp.at(0, '11:30'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', null, 'MEMBER_INVITED',
   '{"user_id":"a0000000-0000-4000-8000-000000000002","name":"Dr. Kiran Shetty","role":"expert"}'),
  (pg_temp.at(0, '11:30'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', null, 'MEMBER_INVITED',
   '{"user_id":"a0000000-0000-4000-8000-000000000003","name":"Priya Nair","role":"student"}'),
  (pg_temp.at(0, '11:30'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', null, 'MEMBER_INVITED',
   '{"user_id":"a0000000-0000-4000-8000-000000000004","name":"Arjun Mehta","role":"student"}'),
  (pg_temp.at(0, '11:30'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', null, 'MEMBER_INVITED',
   '{"user_id":"a0000000-0000-4000-8000-000000000005","name":"Meera Iyer","role":"student"}'),
  (pg_temp.at(1, '09:40'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', null, 'CHARTER_ACCEPTED',
   '{"charter_version":1,"model":"funded","model_acknowledged":true,"role":"expert"}'),
  (pg_temp.at(1, '09:42'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', null, 'CHARTER_ACCEPTED',
   '{"charter_version":1,"model":"funded","model_acknowledged":true,"role":"student"}'),
  (pg_temp.at(1, '09:47'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', null, 'CHARTER_ACCEPTED',
   '{"charter_version":1,"model":"funded","model_acknowledged":true,"role":"student"}'),
  (pg_temp.at(1, '09:55'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', null, 'CHARTER_ACCEPTED',
   '{"charter_version":1,"model":"funded","model_acknowledged":true,"role":"student"}'),
  (pg_temp.at(1, '11:00'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', null, 'ESCROW_FUNDED',
   '{"milestone_id":"c0000000-0000-4000-8000-000000000001","milestone":"Dataset + baseline model","amount":100000,"reference":"SIM-ESC-0417","simulated":true}'),

  -- Project 1: work, catch, review
  (pg_temp.at(3, '15:40'), 'b0000000-0000-4000-8000-000000000001', 'agent:research', 'a0000000-0000-4000-8000-000000000003', 'AGENT_ACTION',
   '{"agent":"research","draft_id":"e0000000-0000-4000-8000-000000000002","summary":"Literature summary, 12 papers","model":"synthetic-seed","tokens_in":5200,"tokens_out":1900,"cost":520}'),
  (pg_temp.at(3, '16:18'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', null, 'AGENT_DRAFT_APPROVED',
   '{"agent":"research","draft_id":"e0000000-0000-4000-8000-000000000002","edited":true}'),
  (pg_temp.at(3, '16:20'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', null, 'CONTRIBUTION_ADDED',
   jsonb_build_object('contribution_id', 'd0000000-0000-4000-8000-000000000001', 'milestone_id', 'c0000000-0000-4000-8000-000000000001',
     'title', 'Literature summary, 12 papers', 'artefact', 'lit_review.pdf', 'artefact_hash', pg_temp.fp('lit_review.pdf'),
     'agent_used', 'research', 'ai_share', 0.8,
     'ai_declaration', 'Drafted by the Research Agent; I checked every citation and rewrote the conclusions.')),
  (pg_temp.at(4, '10:30'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', null, 'REVIEW_DONE',
   '{"review_id":"f0000000-0000-4000-8000-000000000001","contribution_id":"d0000000-0000-4000-8000-000000000001","author_id":"a0000000-0000-4000-8000-000000000003","verdict":"approved","impact":1}'),
  (pg_temp.at(5, '14:05'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', null, 'CONTRIBUTION_ADDED',
   jsonb_build_object('contribution_id', 'd0000000-0000-4000-8000-000000000002', 'milestone_id', 'c0000000-0000-4000-8000-000000000001',
     'title', 'Cleaned + split 2,000 images', 'artefact', 'data_split.py', 'artefact_hash', pg_temp.fp('data_split.py'),
     'agent_used', null, 'ai_share', 0, 'ai_declaration', 'No AI used.')),
  (pg_temp.at(6, '11:00'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', null, 'REVIEW_DONE',
   '{"review_id":"f0000000-0000-4000-8000-000000000002","contribution_id":"d0000000-0000-4000-8000-000000000002","author_id":"a0000000-0000-4000-8000-000000000003","verdict":"approved","impact":4}'),
  (pg_temp.at(7, '18:05'), 'b0000000-0000-4000-8000-000000000001', 'agent:coding', 'a0000000-0000-4000-8000-000000000004', 'AGENT_ACTION',
   '{"agent":"coding","draft_id":"e0000000-0000-4000-8000-000000000003","summary":"Preprocessing pipeline draft","model":"synthetic-seed","tokens_in":900,"tokens_out":600,"cost":42}'),
  (pg_temp.at(7, '19:28'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', null, 'AGENT_DRAFT_APPROVED',
   '{"agent":"coding","draft_id":"e0000000-0000-4000-8000-000000000003","edited":true}'),
  (pg_temp.at(7, '19:30'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', null, 'CONTRIBUTION_ADDED',
   jsonb_build_object('contribution_id', 'd0000000-0000-4000-8000-000000000003', 'milestone_id', 'c0000000-0000-4000-8000-000000000001',
     'title', 'Preprocessing pipeline', 'artefact', 'preprocess.py', 'artefact_hash', pg_temp.fp('preprocess.py'),
     'agent_used', 'coding', 'ai_share', 0.7,
     'ai_declaration', 'Draft by the Coding Agent; I edited the augmentation steps and approved it.')),
  (pg_temp.at(8, '10:15'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', null, 'REVIEW_DONE',
   '{"review_id":"f0000000-0000-4000-8000-000000000003","contribution_id":"d0000000-0000-4000-8000-000000000003","author_id":"a0000000-0000-4000-8000-000000000004","verdict":"approved","impact":3}'),
  (pg_temp.at(10, '11:10'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', null, 'CONTRIBUTION_ADDED',
   jsonb_build_object('contribution_id', 'd0000000-0000-4000-8000-000000000004', 'milestone_id', 'c0000000-0000-4000-8000-000000000001',
     'title', 'Baseline CNN notes', 'artefact', 'cnn_notes.md', 'artefact_hash', pg_temp.fp('cnn_notes.md'),
     'agent_used', null, 'ai_share', 0, 'ai_declaration', 'No AI used.')),
  (pg_temp.at(10, '11:11'), 'b0000000-0000-4000-8000-000000000001', 'agent:integrity', 'a0000000-0000-4000-8000-000000000005', 'SIMILARITY_FLAGGED',
   '{"contribution_id":"d0000000-0000-4000-8000-000000000004","artefact":"cnn_notes.md","similarity":0.82,"threshold":0.8,"matched":"a public repository","simulated":true}'),
  (pg_temp.at(11, '09:25'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', null, 'CONTRIBUTION_ADDED',
   jsonb_build_object('contribution_id', 'd0000000-0000-4000-8000-000000000005', 'milestone_id', 'c0000000-0000-4000-8000-000000000001',
     'title', 'Resubmitted original work + training run', 'artefact', 'train_v2.ipynb', 'artefact_hash', pg_temp.fp('train_v2.ipynb'),
     'agent_used', null, 'ai_share', 0, 'ai_declaration', 'No AI used.')),
  (pg_temp.at(12, '09:50'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', null, 'REVIEW_DONE',
   '{"review_id":"f0000000-0000-4000-8000-000000000004","contribution_id":"d0000000-0000-4000-8000-000000000005","author_id":"a0000000-0000-4000-8000-000000000005","verdict":"approved","impact":2}'),
  (pg_temp.at(15, '17:45'), 'b0000000-0000-4000-8000-000000000001', 'agent:review', 'a0000000-0000-4000-8000-000000000002', 'AGENT_ACTION',
   '{"agent":"review","draft_id":"e0000000-0000-4000-8000-000000000004","summary":"Criteria check: 91.4% sensitivity (target 90%)","artefact":"eval_report.json","ai_share":1,"model":"synthetic-seed","tokens_in":3100,"tokens_out":500,"cost":308}'),
  (pg_temp.at(15, '18:05'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', null, 'AGENT_DRAFT_APPROVED',
   '{"agent":"review","draft_id":"e0000000-0000-4000-8000-000000000004","edited":false,"confirmed":"91.4% sensitivity on the held-out set"}'),
  (pg_temp.at(21, '10:00'), 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', null, 'MILESTONE_SUBMITTED',
   jsonb_build_object('milestone_id', 'c0000000-0000-4000-8000-000000000001', 'milestone', 'Dataset + baseline model',
     'artefact', 'm1_package.zip', 'artefact_hash', pg_temp.fp('m1_package.zip'))),

  -- Project 2: non-monetary, knowledge-sharing
  (pg_temp.at(8, '09:30'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', null, 'PROJECT_POSTED',
   '{"title":"Literature review: low-cost DR screening","sensitivity":"low"}'),
  (pg_temp.at(8, '09:31'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', null, 'CHARTER_PUBLISHED',
   '{"charter_version":1,"model":"knowledge_sharing","artefact":"charter_v1.json","feePct":0,"aiReservePct":0,"expertPct":0,"equalPct":40,"weightedPct":60}'),
  (pg_temp.at(8, '09:45'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', null, 'MILESTONES_APPROVED',
   '{"milestones":["Annotated literature review (20 papers)"]}'),
  (pg_temp.at(9, '10:00'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', null, 'MEMBER_INVITED',
   '{"user_id":"a0000000-0000-4000-8000-000000000002","name":"Dr. Kiran Shetty","role":"expert"}'),
  (pg_temp.at(9, '10:00'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', null, 'MEMBER_INVITED',
   '{"user_id":"a0000000-0000-4000-8000-000000000008","name":"Sana Khan","role":"student"}'),
  (pg_temp.at(9, '10:00'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', null, 'MEMBER_INVITED',
   '{"user_id":"a0000000-0000-4000-8000-000000000009","name":"Dev Patel","role":"student"}'),
  (pg_temp.at(9, '10:00'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', null, 'MEMBER_INVITED',
   '{"user_id":"a0000000-0000-4000-8000-000000000010","name":"Ananya Gupta","role":"student"}'),
  (pg_temp.at(9, '15:10'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', null, 'CHARTER_ACCEPTED',
   '{"charter_version":1,"model":"knowledge_sharing","model_acknowledged":true,"role":"expert"}'),
  (pg_temp.at(9, '18:20'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000008', null, 'CHARTER_ACCEPTED',
   '{"charter_version":1,"model":"knowledge_sharing","model_acknowledged":true,"role":"student"}'),
  (pg_temp.at(10, '08:45'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000009', null, 'CHARTER_ACCEPTED',
   '{"charter_version":1,"model":"knowledge_sharing","model_acknowledged":true,"role":"student"}'),
  (pg_temp.at(13, '17:40'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000008', null, 'CONTRIBUTION_ADDED',
   jsonb_build_object('contribution_id', 'd0000000-0000-4000-8000-000000000006', 'milestone_id', 'c0000000-0000-4000-8000-000000000003',
     'title', 'Screening-accuracy evidence table (12 papers)', 'artefact', 'evidence_table.csv', 'artefact_hash', pg_temp.fp('evidence_table.csv'),
     'agent_used', null, 'ai_share', 0, 'ai_declaration', 'No AI used.')),
  (pg_temp.at(14, '12:15'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000009', null, 'CONTRIBUTION_ADDED',
   jsonb_build_object('contribution_id', 'd0000000-0000-4000-8000-000000000007', 'milestone_id', 'c0000000-0000-4000-8000-000000000003',
     'title', 'Low-cost device survey (8 papers)', 'artefact', 'device_survey.md', 'artefact_hash', pg_temp.fp('device_survey.md'),
     'agent_used', null, 'ai_share', 0, 'ai_declaration', 'No AI used.')),
  (pg_temp.at(16, '11:20'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', null, 'REVIEW_DONE',
   '{"review_id":"f0000000-0000-4000-8000-000000000005","contribution_id":"d0000000-0000-4000-8000-000000000006","author_id":"a0000000-0000-4000-8000-000000000008","verdict":"approved","impact":6}'),
  (pg_temp.at(16, '11:45'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', null, 'REVIEW_DONE',
   '{"review_id":"f0000000-0000-4000-8000-000000000006","contribution_id":"d0000000-0000-4000-8000-000000000007","author_id":"a0000000-0000-4000-8000-000000000009","verdict":"approved","impact":4}'),
  (pg_temp.at(20, '16:00'), 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000008', null, 'MILESTONE_SUBMITTED',
   jsonb_build_object('milestone_id', 'c0000000-0000-4000-8000-000000000003', 'milestone', 'Annotated literature review (20 papers)',
     'artefact', 'lit_review_package.zip', 'artefact_hash', pg_temp.fp('lit_review_package.zip')));

do $$
declare
  e record;
  v public.ledger;
begin
  for e in select * from _seed_events order by ts, ord loop
    v := public.ledger_append_entry(e.project_id, e.actor, e.on_behalf_of, e.event, e.payload, e.ts);
    -- Point each row at the ledger entry that recorded it.
    if e.event = 'CONTRIBUTION_ADDED' then
      update public.contributions set ledger_seq = v.seq where id = (e.payload ->> 'contribution_id')::uuid;
    elsif e.event = 'REVIEW_DONE' then
      update public.reviews set ledger_seq = v.seq where id = (e.payload ->> 'review_id')::uuid;
    elsif e.event = 'AGENT_ACTION' then
      update public.agent_drafts set ledger_seq = v.seq where id = (e.payload ->> 'draft_id')::uuid;
    end if;
  end loop;
end;
$$;

commit;

-- ---- result: one row telling you the seed worked -----------------------------
select (select count(*) from public.profiles) as users,
       (select count(*) from public.projects) as projects,
       (select count(*) from public.ledger)   as ledger_entries,
       v.ok as chain_ok, v.broken_at, left(v.last_hash, 8) as last_hash
from public.ledger_verify() v;

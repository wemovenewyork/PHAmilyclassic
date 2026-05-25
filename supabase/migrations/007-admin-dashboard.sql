-- ============================================================================
-- Migration 007 — Admin dashboard
-- ============================================================================
-- Adds the admins + ticket_audit_log tables that back the PR #20 dashboard,
-- plus two nullable columns on tickets (comp_reason, comp_notes) that are
-- only populated for ticket_type = 'comp' rows issued from the dashboard.
--
-- Run this in the Supabase SQL Editor after all prior migrations.
-- Safe to re-run: every CREATE / ALTER uses IF [NOT] EXISTS guards.
-- ============================================================================

-- ---- ADMINS -----------------------------------------------------------------
-- One row per dashboard user. Bootstrap row is inserted manually via the
-- SQL snippet in the PR description (not committed to the repo, so no
-- password hash lives in git history).
create table if not exists public.admins (
  id               uuid primary key default gen_random_uuid(),
  email            text unique not null,
  password_hash    text not null,
  display_name     text not null,
  created_at       timestamptz not null default now(),
  last_login_at    timestamptz
);

create index if not exists admins_email_idx on public.admins (lower(email));

alter table public.admins enable row level security;
-- Service-role only (no public policies); the admin API uses supabaseAdmin.


-- ---- TICKET AUDIT LOG -------------------------------------------------------
-- Append-only log of every admin-initiated change to a ticket. The per-
-- ticket "View History" modal reads this directly. action values cover
-- every dashboard write path; new actions need a CHECK constraint update.
create table if not exists public.ticket_audit_log (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  admin_id    uuid not null references public.admins(id),
  action      text not null check (action in (
                'issued',
                'voided',
                'restored',
                'resent',
                'email_changed'
              )),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists ticket_audit_log_ticket_idx
  on public.ticket_audit_log (ticket_id);
create index if not exists ticket_audit_log_admin_idx
  on public.ticket_audit_log (admin_id);
create index if not exists ticket_audit_log_created_idx
  on public.ticket_audit_log (created_at desc);

alter table public.ticket_audit_log enable row level security;
-- Service-role only.


-- ---- TICKETS — comp-only columns -------------------------------------------
-- Both nullable. Only populated when ticket_type = 'comp'. No CHECK
-- constraint needed; the comp endpoint validates the reason against an
-- enum in code, but we keep the DB column free-text so admins can
-- backfill notes after the fact and so future reason values don't need
-- a migration.
alter table public.tickets
  add column if not exists comp_reason text;

alter table public.tickets
  add column if not exists comp_notes text;


-- ============================================================================
-- Sanity check after running:
--   select count(*) from public.admins;             -- expect 0 until you
--                                                   -- insert the bootstrap
--   select count(*) from public.ticket_audit_log;   -- expect 0
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'tickets'
--      and column_name in ('comp_reason', 'comp_notes');
--   -- expect 2 rows
-- ============================================================================

-- ============================================================================
-- Migration 006 — Tickets redesign
-- ============================================================================
-- Replaces the original bundled-spectator/paid-spectator model from 002 with
-- a richer schema that supports:
--   • multiple ticket_type values (team_registration, spectator, after_party,
--     comp) so the same table covers gate, after-party, and complimentary
--     tickets
--   • an `event` column ('main_event' | 'after_party') so a scanner at the
--     after-party can reject a main_event ticket and vice versa
--   • per-ticket holder info (denormalized from the order so emails can
--     personalize without joining)
--   • a `token` column (32-byte URL-safe base64, ~43 chars) used as the QR
--     payload — unguessable, no DB lookup needed to validate format
--   • scan tracking (scanned_at/by/location/source) plus a separate
--     ticket_scan_log audit table that records every attempt (success or
--     failure) for forensics
--   • email tracking (email_sent_at, resend_email_id) so failed sends can
--     be retried from the admin dashboard
--
-- The original `tickets` table is DROPPED. This is safe because no tickets
-- have been issued in production yet (event is months out). If any test
-- rows exist they will be lost.
--
-- The `webhook_events` table from 002 is preserved — it's still used for
-- Shopify webhook idempotency and is unrelated to the tickets schema.
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

drop table if exists public.ticket_scan_log cascade;
drop table if exists public.tickets cascade;

-- ---- TICKETS ----------------------------------------------------------------
create table public.tickets (
  id                      uuid primary key default gen_random_uuid(),

  -- QR payload — 32 bytes of crypto.randomBytes encoded as base64url
  -- (no padding, no /, no +). URL-safe so scanners can hit
  -- /ticket/{token} directly.
  token                   text not null unique,

  -- Source linkage
  shopify_order_id        text not null,
  shopify_order_number    text,
  shopify_line_item_id    text,

  -- Classification
  ticket_type             text not null
                          check (ticket_type in (
                            'team_registration',
                            'spectator',
                            'after_party',
                            'comp'
                          )),
  event                   text not null
                          check (event in ('main_event','after_party')),
  status                  text not null default 'issued'
                          check (status in (
                            'issued',
                            'scanned',
                            'voided',
                            'refunded'
                          )),

  -- Holder info (denormalized from the order/registration)
  holder_name             text not null,
  holder_email            text not null,
  holder_phone            text,

  -- Team-registration metadata (null for non-team tickets)
  team_slug               text,
  jersey_size             text,
  shorts_size             text,
  age_group               text check (age_group in ('adult','youth')),

  -- Youth-only guardian info
  guardian_name           text,
  guardian_phone          text,

  -- Scan state
  scanned_at              timestamptz,
  scanned_by              text,
  scan_location           text check (scan_location in (
                            'main_gate','after_party','manual'
                          )),
  scan_source             text check (scan_source in (
                            'qr','manual_lookup'
                          )),

  -- Audit
  created_at              timestamptz not null default now(),
  voided_at               timestamptz,
  voided_by               text,
  voided_reason           text,
  email_sent_at           timestamptz,
  resend_email_id         text
);

create index tickets_token_idx          on public.tickets (token);
create index tickets_order_idx          on public.tickets (shopify_order_id);
create index tickets_email_idx          on public.tickets (holder_email);
create index tickets_event_status_idx   on public.tickets (event, status);

alter table public.tickets enable row level security;
-- No SELECT policy = anon role can't read tickets at all.
-- Service role bypasses RLS, so the webhook and admin code still work.
-- The hosted ticket page at /ticket/[token] uses the service-role client
-- to do its own per-token lookup; the route itself is the only
-- "policy" gate (you must know the token to see the ticket).


-- ---- TICKET SCAN LOG --------------------------------------------------------
-- Append-only log of every scan attempt — success or failure. Lets us
-- reconstruct what happened at the gate after the fact (was a duplicate
-- scan attempted? wrong event? refunded ticket re-tried?). Distinct from
-- tickets.scanned_at, which only records the FIRST successful scan.
create table public.ticket_scan_log (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid references public.tickets(id) on delete cascade,
  attempted_at    timestamptz not null default now(),
  scanner         text not null,
  result          text not null check (result in (
                    'success',
                    'already_used',
                    'wrong_event',
                    'refunded',
                    'voided',
                    'not_found'
                  )),
  location        text check (location in (
                    'main_gate','after_party','manual'
                  )),
  source          text check (source in (
                    'qr','manual_lookup','offline_admit'
                  )),
  notes           text
);

create index scan_log_ticket_idx     on public.ticket_scan_log (ticket_id);
create index scan_log_attempted_idx  on public.ticket_scan_log (attempted_at);

alter table public.ticket_scan_log enable row level security;
-- Service role only.


-- ============================================================================
-- Sanity check
-- ============================================================================
-- After running this migration, verify:
--   select count(*) as ticket_count       from public.tickets;
--   select count(*) as scan_log_count     from public.ticket_scan_log;
--   select count(*) as webhook_event_count from public.webhook_events;
-- The first two should be 0; webhook_events is from migration 002 and
-- may already have rows from prior webhook deliveries.

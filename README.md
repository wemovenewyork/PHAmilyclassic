# PHAmily Classic — Event Site

Marketing + registration site for the Interstate PHAmily Classic, presented by Adelphic Union Lodge #14 at Riverbank State Park on August 29, 2026.

## Architecture

Pragmatic Next.js 14 migration. The original static HTML lives untouched in `/public` and is served at root via a rewrite. Next.js handles only the **new** dynamic surface — registration form, public rosters, admin, and Shopify integration.

```
phamilyclassic/
├── public/                              ← LEGACY STATIC SITE (unchanged)
│   ├── index.html
│   ├── terms.html
│   └── privacy.html
├── app/
│   ├── layout.tsx                       ← Layout for Next.js routes (not /)
│   ├── globals.css                      ← Design tokens
│   ├── register/
│   │   ├── page.tsx                     ← 4-step form
│   │   ├── closed/page.tsx              ← After July 12 deadline
│   │   ├── pending/page.tsx             ← Fallback (rare)
│   │   └── success/page.tsx             ← Post-Shopify-checkout landing
│   ├── teams/
│   │   ├── page.tsx                     ← Public team grid
│   │   └── [slug]/page.tsx              ← Individual roster
│   ├── admin/
│   │   └── page.tsx                     ← Placeholder (Session 4)
│   └── api/
│       ├── register/route.ts            ← Validates form → creates Shopify cart
│       └── shopify-webhook/route.ts     ← HMAC verify → confirm reg → create tickets
├── components/
│   └── RegistrationForm.tsx
├── lib/
│   ├── teams-config.ts                  ← The 6 teams + Shopify GIDs
│   ├── registration-schema.ts           ← Zod (client + server)
│   ├── supabase.ts                      ← Anon (browser-safe)
│   ├── supabase-admin.ts                ← Service role (server-only)
│   ├── shopify-storefront.ts            ← Cart create via Storefront API
│   ├── db-public.ts                     ← Public reads
│   └── db-admin.ts                      ← Server-only writes + tickets
├── supabase/
│   ├── schema.sql                       ← Initial schema + 6 teams seed
│   └── migrations/
│       └── 002-tickets.sql              ← Adds tickets + webhook_events
├── next.config.js
└── vercel.json
```

## End-to-end flow

1. Player visits `/register`
2. Picks a team → enters details → picks sizes → reviews → acknowledges no-refund
3. Submits → `/api/register` validates, looks up Shopify variant, creates pending Supabase row, creates Shopify cart, returns `checkoutUrl`
4. Browser redirects to Shopify-hosted checkout
5. Player pays with card / Apple Pay / Google Pay
6. Shopify fires `orders/paid` webhook → `/api/shopify-webhook`
7. Webhook verifies HMAC, parses order, confirms the registration in Supabase, creates 2 bundled spectator tickets in the `tickets` table, revalidates `/teams` pages
8. Player sees Shopify's "Thank you" page (or `/register/success` if configured to redirect)
9. Player receives Shopify's order confirmation email
10. Session 4 will add a custom email with the QR ticket codes

## Setup steps in order

### One-time (already done across Sessions 1–3)
- ✅ Supabase project created, `schema.sql` run, teams seeded
- ✅ Shopify products created (DRAFT) — 6 teams + 1 spectator ticket
- ✅ Vercel project linked to GitHub repo
- ✅ Vercel env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- ✅ Shopify Headless storefront created
- ✅ Vercel env vars: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_ACCESS_TOKEN`
- ✅ Shopify webhook configured for `orders/paid` → `/api/shopify-webhook`
- ✅ Vercel env var: `SHOPIFY_WEBHOOK_SECRET`

### Before launch (must do for Session 3 code to work end-to-end)
1. **Run the new migration** in Supabase SQL Editor: `supabase/migrations/002-tickets.sql`
2. **Add all 6 env vars to your local `.env.local`** (same values as Vercel)
3. **Publish the 7 Shopify products** from DRAFT → ACTIVE when ready to open registration

### Production launch checklist (final step before opening the form publicly)
1. Set product status to ACTIVE in Shopify admin (6 team products + 1 spectator ticket)
2. Verify Shopify Payments is enabled and payouts go to the right account
3. Run a full end-to-end test purchase using your own card (you can refund yourself afterward via Shopify admin)
4. Verify the webhook fires and the test registration appears as `confirmed` in Supabase
5. Verify 2 ticket rows appear in the `tickets` table for the test order
6. Then announce the registration is open

## Environment variables

| Variable | Phase | Notes |
|---|---|---|
| `SUPABASE_URL` | 2 | Project URL |
| `SUPABASE_ANON_KEY` | 2 | Browser-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | 2 | **Server-only**, never expose |
| `SHOPIFY_STORE_DOMAIN` | 3 | `whencecameyouniversity.myshopify.com` |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | 3 | From Headless storefront |
| `SHOPIFY_WEBHOOK_SECRET` | 3 | From Settings → Notifications |
| `ADMIN_PASSWORD` | 4 | For `/admin` access (Session 4) |
| `RESEND_API_KEY` | 4 | For ticket emails (Session 4) |
| `RESEND_FROM_EMAIL` | 4 | `info@phafamilyclassic.com` |

## Webhook security model

- Signature verification: HMAC-SHA256 against raw body using `SHOPIFY_WEBHOOK_SECRET`
- Constant-time comparison via `crypto.timingSafeEqual`
- Idempotency: `webhook_events` table keyed on `X-Shopify-Webhook-Id` header — Shopify retries are safely no-ops
- Topic filter: only `orders/paid` is processed; other topics return 200 + ignored
- Cap-exceeded race: logged + flagged in `webhook_events.error_message` for admin to manually refund (auto-refund requires Admin API token which we don't have in Session 3)

## Cap enforcement model

Race conditions are bounded but possible. The defense layers:

1. **Form team picker** — shows soft status ("Spots Available" / "Almost Full" / "Full"). Disabled teams can't be selected.
2. **`/api/register` server-side recheck** — re-queries the count immediately before inserting the pending row. If full at this moment, the pending row is NOT created and the form gets a `team-full` error.
3. **Webhook handler recheck** — when payment confirms, `confirmRegistration()` recounts. If the team has filled during the buyer's checkout window (unlikely but possible), it flags `capExceeded` in the webhook response, logs an error in `webhook_events.error_message`, and you (the admin) manually refund and notify the buyer.

In practice, the window for layer 3 to trigger is the time between form submit and Shopify checkout completion — typically 1-2 minutes. For 15-spot teams with steady demand, this is a real but rare scenario. After the event, if it happened to anyone, we'd build Admin API auto-refund in v2.

## Local development

```bash
git clone https://github.com/wemovenewyork/PHAmilyclassic.git
cd PHAmilyclassic
cp .env.example .env.local           # then fill in real values
npm install
npm run dev
# Visit http://localhost:3000/register
```

## Build phases

- ✅ **Session 1** — Migration scaffold
- ✅ **Session 2** — Supabase + registration form
- ✅ **Session 3** — Shopify Storefront cart + webhook handler (this commit)
- ⏭ **Session 4** — Admin dashboard + ticket emails + check-in + production launch

## Credits

- Original site by Haron Wilson (WMNY) with Claude
- Migration + registration system by FutreEng / Joseph Pannetta with Claude
- Presented by Adelphic Union Lodge #14

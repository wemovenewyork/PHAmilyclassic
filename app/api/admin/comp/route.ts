import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-helpers';
import {
  issueCompTickets,
  type CompEventSelection,
} from '@/lib/db-admin';
import { generateTicketToken } from '@/lib/ticket-tokens';
import { dispatchTicketEmailForOrder } from '@/lib/ticket-dispatch';

/**
 * POST /api/admin/comp
 * Body: { holder_name, holder_email, event, comp_reason, comp_notes? }
 *
 * Inserts 1 or 2 comp tickets (Combo → 2: one main_event + one after_party),
 * writes an audit log entry per row, then dispatches a single confirmation
 * email containing all generated tickets — same flow as a paid combo
 * purchase via the webhook.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VALID_REASONS = new Set([
  'Lodge Officer',
  'Performer',
  'Sponsor',
  'Vendor',
  'Press',
  'Staff/Volunteer',
  'Honorary Guest',
  'Make-Good (replacement)',
  'Other',
]);

function firstNameFrom(holderName: string): string {
  const first = holderName.trim().split(/\s+/)[0];
  return first || 'Friend';
}

export async function POST(req: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const o = (body ?? {}) as Record<string, unknown>;
  const holderName = typeof o.holder_name === 'string' ? o.holder_name.trim() : '';
  const holderEmail = typeof o.holder_email === 'string' ? o.holder_email.trim() : '';
  const event = o.event;
  const compReason = typeof o.comp_reason === 'string' ? o.comp_reason.trim() : '';
  const compNotes =
    typeof o.comp_notes === 'string' && o.comp_notes.trim().length > 0
      ? o.comp_notes.trim()
      : null;

  if (!holderName) {
    return NextResponse.json({ error: 'Holder name is required' }, { status: 400 });
  }
  if (!holderEmail || !EMAIL_RE.test(holderEmail)) {
    return NextResponse.json(
      { error: 'A valid holder email is required' },
      { status: 400 },
    );
  }
  if (event !== 'main_event' && event !== 'after_party' && event !== 'combo') {
    return NextResponse.json({ error: 'Invalid event selection' }, { status: 400 });
  }
  if (!VALID_REASONS.has(compReason)) {
    return NextResponse.json({ error: 'Invalid comp reason' }, { status: 400 });
  }

  // Issue the rows + audit entries
  let issued;
  try {
    issued = await issueCompTickets(
      {
        adminId: session.admin_id,
        holderName,
        holderEmail,
        event: event as CompEventSelection,
        compReason,
        compNotes,
      },
      generateTicketToken,
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to issue comp' },
      { status: 500 },
    );
  }

  // Dispatch the email via the shared path. Email send failure does not
  // void the issuance — the rows are already created; the dashboard will
  // show email_sent_at unset and the admin can use the Resend action.
  let emailSent = false;
  let emailError: string | null = null;
  try {
    const res = await dispatchTicketEmailForOrder({
      shopifyOrderId: issued.shopifyOrderId,
      buyerEmail: holderEmail,
      buyerFirstName: firstNameFrom(holderName),
    });
    emailSent = res.sent;
  } catch (err) {
    emailError = err instanceof Error ? err.message : 'Email send failed';
  }

  return NextResponse.json({
    ok: true,
    ticket_ids: issued.ticketIds,
    email_sent: emailSent,
    email_error: emailError,
  });
}

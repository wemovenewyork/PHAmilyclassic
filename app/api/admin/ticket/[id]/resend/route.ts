import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-helpers';
import {
  changeTicketEmail,
  getTicketById,
  logTicketResent,
} from '@/lib/db-admin';
import { dispatchTicketEmailForOrder } from '@/lib/ticket-dispatch';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function firstNameFrom(holderName: string): string {
  const first = holderName.trim().split(/\s+/)[0];
  return first || 'Friend';
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
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
  const emailOverride =
    typeof o.email_override === 'string' && o.email_override.trim().length > 0
      ? o.email_override.trim()
      : null;

  const ticket = await getTicketById(params.id);
  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }
  if (ticket.status === 'voided') {
    return NextResponse.json(
      { error: 'Cannot resend a voided ticket. Restore it first.' },
      { status: 409 },
    );
  }

  if (emailOverride) {
    if (!EMAIL_RE.test(emailOverride)) {
      return NextResponse.json(
        { error: 'Override email is not a valid address.' },
        { status: 400 },
      );
    }
    if (emailOverride !== ticket.holder_email) {
      const updated = await changeTicketEmail({
        ticketId: ticket.id,
        adminId: session.admin_id,
        newEmail: emailOverride,
      });
      if (!updated.ok) {
        return NextResponse.json({ error: 'Failed to update email' }, { status: 500 });
      }
    }
  }

  const finalEmail = emailOverride ?? ticket.holder_email;

  // Send via the shared per-order dispatch so combo siblings come along too.
  try {
    await dispatchTicketEmailForOrder({
      shopifyOrderId: ticket.shopify_order_id,
      buyerEmail: finalEmail,
      buyerFirstName: firstNameFrom(ticket.holder_name),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Email send failed' },
      { status: 500 },
    );
  }

  await logTicketResent({
    ticketId: ticket.id,
    adminId: session.admin_id,
    sentTo: finalEmail,
  });

  return NextResponse.json({ ok: true, sent_to: finalEmail });
}

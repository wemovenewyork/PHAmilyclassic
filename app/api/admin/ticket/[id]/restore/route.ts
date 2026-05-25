import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-helpers';
import { restoreTicket } from '@/lib/db-admin';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await restoreTicket({
    ticketId: params.id,
    adminId: session.admin_id,
  });
  if (!result.ok) {
    if (result.error === 'not_found') {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    if (result.error === 'not_voided') {
      return NextResponse.json(
        { error: 'Only voided or refunded tickets can be restored.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Unknown error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ticket: result.ticket });
}

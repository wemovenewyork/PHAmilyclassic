import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-helpers';
import { getAuditLogForTicket } from '@/lib/db-admin';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const entries = await getAuditLogForTicket(params.id);
  return NextResponse.json({ ok: true, entries });
}

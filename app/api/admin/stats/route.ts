import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-helpers';
import { getAdminStats } from '@/lib/db-admin';

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const stats = await getAdminStats();
  return NextResponse.json({ ok: true, stats });
}

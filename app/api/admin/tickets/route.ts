import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-helpers';
import { searchTicketsForAdmin } from '@/lib/db-admin';

export async function GET(req: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const query = url.searchParams.get('q') ?? '';
  const typeRaw = url.searchParams.get('type') ?? 'all';
  const statusRaw = url.searchParams.get('status') ?? 'all';
  const eventRaw = url.searchParams.get('event') ?? 'all';
  const cursor = url.searchParams.get('cursor');
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 50));

  const paidCompFilter =
    typeRaw === 'paid' || typeRaw === 'comp' ? typeRaw : 'all';

  // status can be comma-separated for multi-select chips
  const statusFilters =
    statusRaw === 'all'
      ? []
      : statusRaw
          .split(',')
          .map((s) => s.trim())
          .filter(
            (s): s is 'issued' | 'voided' | 'scanned' | 'refunded' =>
              s === 'issued' || s === 'voided' || s === 'scanned' || s === 'refunded',
          );

  const eventFilter =
    eventRaw === 'main_event' ||
    eventRaw === 'after_party' ||
    eventRaw === 'combo'
      ? eventRaw
      : 'all';

  const result = await searchTicketsForAdmin({
    query,
    paidCompFilter,
    statusFilters,
    eventFilter,
    cursor,
    limit,
  });
  return NextResponse.json({ ok: true, ...result });
}

import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-helpers';
import { getScanLogForAdmin, type ScanResult } from '@/lib/db-admin';

const VALID_RESULTS = new Set<ScanResult>([
  'success',
  'already_used',
  'wrong_event',
  'refunded',
  'voided',
  'not_found',
]);

export async function GET(req: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const resultRaw = url.searchParams.get('result');
  const cursor = url.searchParams.get('cursor');
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));

  const resultFilter =
    resultRaw && VALID_RESULTS.has(resultRaw as ScanResult)
      ? (resultRaw as ScanResult)
      : null;

  const out = await getScanLogForAdmin({ resultFilter, cursor, limit });
  return NextResponse.json({ ok: true, ...out });
}

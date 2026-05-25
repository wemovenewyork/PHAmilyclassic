import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { lookupTicketsForScanner } from '@/lib/db-admin';
import {
  SCANNER_SESSION_COOKIE,
  verifySessionCookie,
} from '@/lib/scanner-auth';

/**
 * GET /api/scan/lookup?q=<query>&limit=<n>
 *
 * Manual lookup by holder name (partial), email (partial), or order number
 * (exact). Used by the scanner's manual-lookup sheet when a buyer arrives
 * without their QR.
 */

export async function GET(req: Request) {
  const cookie = cookies().get(SCANNER_SESSION_COOKIE)?.value;
  if (!verifySessionCookie(cookie)) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const limitRaw = url.searchParams.get('limit');
  const limit = Math.max(1, Math.min(50, Number(limitRaw) || 10));

  if (q.length < 2) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const results = await lookupTicketsForScanner(q, limit);
  return NextResponse.json({ ok: true, results });
}

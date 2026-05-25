import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { scanTicketAdmit, type ScanAdmitResult } from '@/lib/db-admin';
import {
  SCANNER_SESSION_COOKIE,
  verifySessionCookie,
} from '@/lib/scanner-auth';

/**
 * POST /api/scan/manual-admit
 * Body: { token: string, event_at_gate, client_scan_id? }
 *
 * Same admit semantics as /api/scan but logs `source: 'manual_lookup'` so
 * the audit trail distinguishes QR scans from operator-initiated admits.
 * Triggered when a volunteer searches by name/email/order# and confirms
 * the admit dialog.
 */

export async function POST(req: Request) {
  const cookie = cookies().get(SCANNER_SESSION_COOKIE)?.value;
  if (!verifySessionCookie(cookie)) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400 },
    );
  }

  const o = (body ?? {}) as Record<string, unknown>;
  const token = typeof o.token === 'string' ? o.token.trim() : '';
  const eventAtGate = o.event_at_gate;
  const clientScanId =
    typeof o.client_scan_id === 'string' ? o.client_scan_id : null;

  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'missing_token' },
      { status: 400 },
    );
  }
  if (eventAtGate !== 'main_event' && eventAtGate !== 'after_party') {
    return NextResponse.json(
      { ok: false, error: 'invalid_event_at_gate' },
      { status: 400 },
    );
  }

  const result: ScanAdmitResult = await scanTicketAdmit({
    token,
    eventAtGate,
    scanner: 'scanner',
    source: 'manual_lookup',
    clientScanId,
  });

  return NextResponse.json(result, { status: 200 });
}

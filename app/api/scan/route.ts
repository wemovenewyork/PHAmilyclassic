import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { scanTicketAdmit, type ScanAdmitResult } from '@/lib/db-admin';
import {
  SCANNER_SESSION_COOKIE,
  verifySessionCookie,
} from '@/lib/scanner-auth';

/**
 * POST /api/scan
 * Body: { token: string, event_at_gate: 'main_event' | 'after_party',
 *         client_scan_id?: string }
 *
 * Reads the scanner_session cookie, validates it, then atomically admits
 * the ticket via scanTicketAdmit(). Returns 200 with success info OR a
 * structured failure JSON (HTTP 200 too, with result !== 'success', so the
 * client can render the failure overlay without throwing on fetch).
 *
 * Idempotency: pass the same client_scan_id from the offline queue replay
 * and the server returns the cached success result without flipping the
 * ticket twice.
 */

function requireSession(): boolean {
  const cookie = cookies().get(SCANNER_SESSION_COOKIE)?.value;
  return verifySessionCookie(cookie);
}

export async function POST(req: Request) {
  if (!requireSession()) {
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
    source: 'qr',
    clientScanId,
  });

  return NextResponse.json(result, { status: 200 });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. POST to scan a ticket.' },
    { status: 405 },
  );
}

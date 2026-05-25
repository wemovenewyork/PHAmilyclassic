import 'server-only';
import { NextResponse } from 'next/server';
import {
  SCANNER_SESSION_COOKIE,
  createSessionCookie,
  sessionExpiresAttribute,
  verifyScannerPassword,
} from '@/lib/scanner-auth';

/**
 * POST /api/scanner-auth
 * Body: { password: string }
 *
 * On success: sets an HttpOnly, Secure, SameSite=Lax cookie whose value is
 * an HMAC-signed payload with the event-day expiry baked in. Cookie path is
 * `/` so it's sent on both /scan/* page requests and /api/scan/* admit
 * requests.
 *
 * On failure: 401 if password wrong, 429 if the IP has burned through 10
 * failed attempts in the last 5 minutes.
 */

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAILED = 10;
const failedByIp = new Map<string, { count: number; firstAt: number }>();

function getClientIp(req: Request): string {
  // Vercel sets x-forwarded-for; first IP in the comma-list is the client.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = failedByIp.get(ip);
  if (!entry) return false;
  if (now - entry.firstAt > WINDOW_MS) {
    failedByIp.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILED;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = failedByIp.get(ip);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    failedByIp.set(ip, { count: 1, firstAt: now });
    return;
  }
  entry.count += 1;
}

function clearFailures(ip: string): void {
  failedByIp.delete(ip);
}

export async function POST(req: Request) {
  const ip = getClientIp(req);

  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: 'Too many failed attempts. Try again in 5 minutes.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const password =
    body && typeof body === 'object' && 'password' in body &&
    typeof (body as { password: unknown }).password === 'string'
      ? (body as { password: string }).password
      : '';

  if (!password) {
    return NextResponse.json(
      { ok: false, error: 'Password required' },
      { status: 400 },
    );
  }

  if (!verifyScannerPassword(password)) {
    recordFailure(ip);
    return NextResponse.json(
      { ok: false, error: 'Invalid password' },
      { status: 401 },
    );
  }

  clearFailures(ip);

  const value = createSessionCookie();
  const expires = sessionExpiresAttribute();

  const res = NextResponse.json({ ok: true });
  // Path=/ so /api/scan/* also receives the cookie.
  res.headers.set(
    'Set-Cookie',
    `${SCANNER_SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`,
  );
  return res;
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. POST { password } to authenticate.' },
    { status: 405 },
  );
}

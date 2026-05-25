import 'server-only';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

/**
 * Scanner authentication primitives.
 *
 * Shared-password gate for the event-day scanner UI. Volunteers enter the
 * password once on each phone; we return an HMAC-signed cookie that's
 * accepted on every subsequent /scan/* and /api/scan/* request until the
 * event-day expiry (Aug 29 2026 23:59:59 America/New_York EDT).
 *
 * Signing key precedence:
 *   1. SCANNER_COOKIE_SECRET (preferred — independent of the shared password)
 *   2. SHA-256(SCANNER_PASSWORD) as a stable derived key (fallback — emits
 *      a warn so the operator knows to set SCANNER_COOKIE_SECRET).
 *
 * The session-end timestamp is hard-coded to the event-day cutoff. Once the
 * event is past, every cookie signed today is dead and needs no rotation.
 */

export const SCANNER_SESSION_COOKIE = 'scanner_session';

// Aug 29 2026 23:59:59 America/New_York EDT = 2026-08-30T03:59:59Z
export const SCANNER_SESSION_EXPIRES_MS = Date.parse('2026-08-30T03:59:59Z');

function signingKey(): Buffer {
  const dedicated = process.env.SCANNER_COOKIE_SECRET;
  if (dedicated && dedicated.length >= 16) {
    return Buffer.from(dedicated, 'utf8');
  }
  const password = process.env.SCANNER_PASSWORD;
  if (!password) {
    throw new Error(
      'Scanner auth not configured: SCANNER_PASSWORD must be set',
    );
  }
  // eslint-disable-next-line no-console
  console.warn(
    '[scanner-auth] SCANNER_COOKIE_SECRET not set; falling back to a key derived from SCANNER_PASSWORD. Set SCANNER_COOKIE_SECRET (32+ random chars) for stronger isolation.',
  );
  return createHash('sha256').update(password, 'utf8').digest();
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input as Buffer | string).toString('base64url');
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

/** Constant-time comparison of the submitted password against the env-var value. */
export function verifyScannerPassword(submitted: string): boolean {
  const expected = process.env.SCANNER_PASSWORD;
  if (!expected) {
    // eslint-disable-next-line no-console
    console.error('[scanner-auth] SCANNER_PASSWORD not set');
    return false;
  }
  // Pad both to a common length before timing-safe-comparing — Buffer.from
  // strings of different lengths can't go into timingSafeEqual directly.
  const a = Buffer.from(submitted, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Still do a dummy compare to keep timing similar.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Build the cookie value:
 *   <base64url(payload)>.<base64url(HMAC-SHA256(key, base64url(payload)))>
 * where payload is JSON { exp: <epoch_ms> }.
 */
export function createSessionCookie(): string {
  const key = signingKey();
  const payloadJson = JSON.stringify({ exp: SCANNER_SESSION_EXPIRES_MS });
  const payloadB64 = b64url(payloadJson);
  const sig = createHmac('sha256', key).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

/** Returns true iff the cookie is well-formed, HMAC-valid, and unexpired. */
export function verifySessionCookie(cookie: string | undefined | null): boolean {
  if (!cookie) return false;
  const parts = cookie.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;

  let key: Buffer;
  try {
    key = signingKey();
  } catch {
    return false;
  }

  const expectedSig = createHmac('sha256', key).update(payloadB64).digest();
  const providedSig = b64urlDecode(sigB64);
  if (providedSig.length !== expectedSig.length) return false;
  if (!timingSafeEqual(providedSig, expectedSig)) return false;

  try {
    const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
    if (typeof payload.exp !== 'number') return false;
    if (payload.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

/** Cookie `Expires=` value as RFC 7231 string — for Set-Cookie. */
export function sessionExpiresAttribute(): string {
  return new Date(SCANNER_SESSION_EXPIRES_MS).toUTCString();
}

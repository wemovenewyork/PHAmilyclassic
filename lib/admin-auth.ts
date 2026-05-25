import 'server-only';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Admin dashboard auth — per-admin login backed by the public.admins table.
 *
 * Session is a JWT signed with ADMIN_SESSION_SECRET (HS256). The cookie is
 * HttpOnly + Secure + SameSite=Lax and lives 7 days. Each admin API route
 * verifies the cookie and trusts only the resulting admin_id — never client-
 * supplied identity — for audit-log writes.
 */

export const ADMIN_SESSION_COOKIE = 'admin_session';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const ADMIN_JWT_ALG = 'HS256';

export interface AdminSession {
  admin_id: string;
  email: string;
  display_name: string;
}

function signingKey(): Uint8Array {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'Admin auth not configured: ADMIN_SESSION_SECRET must be set (32+ random chars)',
    );
  }
  return new TextEncoder().encode(secret);
}

/** Sign a session JWT. Throws if ADMIN_SESSION_SECRET isn't set. */
export async function createAdminSessionJwt(
  payload: AdminSession,
): Promise<string> {
  const key = signingKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    admin_id: payload.admin_id,
    email: payload.email,
    display_name: payload.display_name,
  })
    .setProtectedHeader({ alg: ADMIN_JWT_ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + ADMIN_SESSION_MAX_AGE_SECONDS)
    .sign(key);
}

/**
 * Verify a session JWT. Returns the AdminSession on success, null otherwise
 * (invalid signature, expired, wrong shape, missing env).
 */
export async function verifyAdminSessionJwt(
  jwt: string | undefined | null,
): Promise<AdminSession | null> {
  if (!jwt) return null;
  let key: Uint8Array;
  try {
    key = signingKey();
  } catch {
    return null;
  }
  try {
    const { payload } = await jwtVerify(jwt, key, { algorithms: [ADMIN_JWT_ALG] });
    const adminId = payload.admin_id;
    const email = payload.email;
    const displayName = payload.display_name;
    if (
      typeof adminId !== 'string' ||
      typeof email !== 'string' ||
      typeof displayName !== 'string'
    ) {
      return null;
    }
    return { admin_id: adminId, email, display_name: displayName };
  } catch {
    return null;
  }
}

/** Build the Set-Cookie header value used by /api/admin/login. */
export function buildAdminSessionCookieHeader(jwt: string): string {
  return `${ADMIN_SESSION_COOKIE}=${jwt}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}`;
}

/** Build the Set-Cookie header value used by /api/admin/logout. */
export function buildAdminSessionClearHeader(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// ============================================================================
// Login rate limiting — in-memory, per-IP
// ============================================================================

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED = 5;
const failedByIp = new Map<string, { count: number; firstAt: number }>();

export function getClientIpFromRequest(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export function isLoginRateLimited(ip: string): boolean {
  const entry = failedByIp.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    failedByIp.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILED;
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const entry = failedByIp.get(ip);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    failedByIp.set(ip, { count: 1, firstAt: now });
    return;
  }
  entry.count += 1;
}

export function clearLoginFailures(ip: string): void {
  failedByIp.delete(ip);
}

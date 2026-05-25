import 'server-only';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  buildAdminSessionCookieHeader,
  clearLoginFailures,
  createAdminSessionJwt,
  getClientIpFromRequest,
  isLoginRateLimited,
  recordLoginFailure,
} from '@/lib/admin-auth';
import { getAdminByEmail, touchAdminLastLogin } from '@/lib/db-admin';

/**
 * POST /api/admin/login
 * Body: { email: string, password: string }
 *
 * On success: 200 + Set-Cookie admin_session JWT (7 day MaxAge).
 * On failure: 401 with generic "Invalid email or password" message
 * (never leak whether the email exists). Rate-limited per-IP at 5
 * failed attempts per 15 minutes.
 */
export async function POST(req: Request) {
  const ip = getClientIpFromRequest(req);

  if (isLoginRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const o = (body ?? {}) as Record<string, unknown>;
  const email = typeof o.email === 'string' ? o.email.trim() : '';
  const password = typeof o.password === 'string' ? o.password : '';
  if (!email || !password) {
    recordLoginFailure(ip);
    return NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 },
    );
  }

  const admin = await getAdminByEmail(email);
  if (!admin) {
    // Dummy compare to keep timing roughly even for non-existent emails.
    await bcrypt.compare(password, '$2a$10$invalidsaltforpadding.invalidsaltforpadding.');
    recordLoginFailure(ip);
    return NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 },
    );
  }

  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) {
    recordLoginFailure(ip);
    return NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 },
    );
  }

  clearLoginFailures(ip);
  await touchAdminLastLogin(admin.id);

  const jwt = await createAdminSessionJwt({
    admin_id: admin.id,
    email: admin.email,
    display_name: admin.display_name,
  });

  const res = NextResponse.json({
    ok: true,
    admin: { id: admin.id, email: admin.email, display_name: admin.display_name },
  });
  res.headers.set('Set-Cookie', buildAdminSessionCookieHeader(jwt));
  return res;
}

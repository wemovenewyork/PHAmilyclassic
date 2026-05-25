import 'server-only';
import { NextResponse } from 'next/server';
import { buildAdminSessionClearHeader } from '@/lib/admin-auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', buildAdminSessionClearHeader());
  return res;
}

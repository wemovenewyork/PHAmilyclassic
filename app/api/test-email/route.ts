import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

/**
 * POST /api/test-email
 *
 * Manual end-to-end test of the Resend configuration. Sends a hard-coded
 * test email to the provided `to` address. Protected by a shared secret
 * (x-test-secret header matching TEST_EMAIL_SECRET) so that once the
 * endpoint is live nobody can use it to spam arbitrary recipients.
 *
 * This route exists purely for PR 1 verification. It is not used by any
 * other code path and can be removed once the ticket pipeline is fully
 * wired up (PR 2-4).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TEST_HTML = `<p>This is a test email from the PHAmily Classic event registration system. If you received this, Resend is configured correctly.</p>
<p>Sent from: tickets@send.whencecameyouniversity.com</p>
<p>Reply-to: whencecameyouniversity@gmail.com</p>`;

const TEST_TEXT = `This is a test email from the PHAmily Classic event registration system. If you received this, Resend is configured correctly.

Sent from: tickets@send.whencecameyouniversity.com
Reply-to: whencecameyouniversity@gmail.com`;

export async function POST(req: Request) {
  const expected = process.env.TEST_EMAIL_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'TEST_EMAIL_SECRET not configured on the server' },
      { status: 500 },
    );
  }

  const provided = req.headers.get('x-test-secret');
  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const to =
    body && typeof body === 'object' && 'to' in body && typeof (body as { to: unknown }).to === 'string'
      ? (body as { to: string }).to.trim()
      : '';

  if (!to || !EMAIL_RE.test(to)) {
    return NextResponse.json(
      { ok: false, error: 'invalid or missing "to" email address' },
      { status: 400 },
    );
  }

  try {
    const { id } = await sendEmail({
      to,
      subject: 'PHAmily Classic — Resend setup test',
      html: TEST_HTML,
      text: TEST_TEXT,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

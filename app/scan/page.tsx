import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  SCANNER_SESSION_COOKIE,
  verifySessionCookie,
} from '@/lib/scanner-auth';

/**
 * /scan — landing page after auth. Two big buttons routing to the gate-
 * specific scanners. If no valid session cookie, kick to /scan/login.
 */

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Scanner — PHAmily Classic',
  robots: { index: false, follow: false },
};

const NAVY = '#0a1a3a';
const GOLD = '#d4a017';

export default function ScannerLandingPage() {
  const cookie = cookies().get(SCANNER_SESSION_COOKIE)?.value;
  if (!verifySessionCookie(cookie)) {
    redirect('/scan/login?redirectTo=/scan');
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: NAVY,
        color: '#fff',
        padding: '32px 16px',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: 36 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: 3,
              color: GOLD,
              textTransform: 'uppercase',
            }}
          >
            PHAmily Classic
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
            Scanner
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.65)',
              marginTop: 8,
            }}
          >
            Pick the gate you&apos;re working.
          </p>
        </header>

        <GateButton
          href="/scan/main-event"
          title="Main Event Gate"
          subtitle="Gymnasium — Riverbank State Park · Basketball games"
        />
        <GateButton
          href="/scan/after-party"
          title="After Party Gate"
          subtitle="Grand Lodge — 454 W 155th St · 9 PM onwards"
        />
      </div>
    </main>
  );
}

function GateButton({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        background: '#fff',
        color: NAVY,
        borderRadius: 10,
        padding: '20px 22px',
        marginBottom: 16,
        textDecoration: 'none',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
        Open
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
        {subtitle}
      </div>
    </Link>
  );
}

import Link from 'next/link';
import { EVENT } from '@/lib/teams-config';

export const metadata = {
  title: 'Registration Started',
  robots: { index: false, follow: false },
};

/**
 * Shown after a pending registration is created but before Shopify checkout
 * is wired in (Session 3). After Session 3 this page becomes unused — the
 * /api/register route will return a Shopify checkout URL and the client
 * will redirect there directly.
 */
export default function PendingPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '100px 24px 80px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ maxWidth: 600, textAlign: 'center' }}>
        <p className="label" style={{ marginBottom: 16 }}>
          Registration Started
        </p>
        <h1
          className="display"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', marginBottom: 20, lineHeight: 1.1 }}
        >
          Almost There
        </h1>
        <p
          style={{
            fontSize: '1.05rem',
            color: 'var(--light-gray)',
            lineHeight: 1.7,
            marginBottom: 24,
          }}
        >
          Your registration details have been saved. Payment processing is
          being finalized. You&apos;ll receive a confirmation email once
          checkout is fully configured.
        </p>
        <p
          style={{
            fontSize: '0.95rem',
            color: 'var(--gray)',
            lineHeight: 1.7,
            marginBottom: 40,
          }}
        >
          For questions about the {EVENT.name}, contact AUL #14.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            background: 'var(--red)',
            color: 'var(--white)',
            padding: '14px 32px',
            fontFamily: 'var(--font-oswald)',
            fontWeight: 600,
            fontSize: '1rem',
            letterSpacing: 2,
            textTransform: 'uppercase',
            borderRadius: 4,
          }}
        >
          Back to Event Page
        </Link>
      </div>
    </main>
  );
}

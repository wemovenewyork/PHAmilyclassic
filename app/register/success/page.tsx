import Link from 'next/link';
import { EVENT } from '@/lib/teams-config';

export const metadata = {
  title: 'Registration Complete',
  robots: { index: false, follow: false },
};

/**
 * Optional landing page after Shopify checkout. Shopify's default behavior is
 * to show its own "Thank you" page, so most buyers won't see this unless we
 * configure Shopify to redirect post-purchase here. Keeping it around as a
 * safe destination for any "view confirmation" link in confirmation emails.
 */
export default function SuccessPage() {
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
      <div style={{ maxWidth: 640, textAlign: 'center' }}>
        <p className="label" style={{ marginBottom: 16 }}>
          Registration Complete
        </p>
        <h1
          className="display"
          style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)',
            marginBottom: 20,
            lineHeight: 1.1,
          }}
        >
          You&apos;re In.
        </h1>
        <p
          style={{
            fontSize: '1.05rem',
            color: 'var(--light-gray)',
            lineHeight: 1.7,
            marginBottom: 32,
          }}
        >
          Your registration for the {EVENT.name} is confirmed. Check your email
          for your order receipt and digital spectator tickets.
        </p>

        <div
          style={{
            padding: '20px 24px',
            background: 'rgba(245,197,24,0.08)',
            border: '1px solid rgba(245,197,24,0.25)',
            borderRadius: 8,
            marginBottom: 32,
            textAlign: 'left',
          }}
        >
          <p
            className="display"
            style={{
              fontSize: '0.95rem',
              color: 'var(--gold)',
              marginBottom: 12,
              letterSpacing: 1.5,
            }}
          >
            What Happens Next
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              display: 'grid',
              gap: 10,
              fontSize: '0.95rem',
              color: 'var(--light-gray)',
              lineHeight: 1.6,
            }}
          >
            <li>
              <strong style={{ color: 'var(--white)' }}>•</strong> Your
              uniform will be ready for pickup{' '}
              <strong>1 hour before the event</strong> at {EVENT.venue} on{' '}
              {EVENT.date}. Bring valid ID.
            </li>
            <li>
              <strong style={{ color: 'var(--white)' }}>•</strong> Your jersey
              number will be assigned closer to game day.
            </li>
            <li>
              <strong style={{ color: 'var(--white)' }}>•</strong> Your 2
              spectator tickets are in your email — bring them on your phone for
              gate scanning.
            </li>
          </ul>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/teams"
            style={{
              display: 'inline-block',
              background: 'var(--red)',
              color: 'var(--white)',
              padding: '14px 28px',
              fontFamily: 'var(--font-oswald)',
              fontWeight: 600,
              fontSize: '0.95rem',
              letterSpacing: 2,
              textTransform: 'uppercase',
              borderRadius: 4,
            }}
          >
            See the Teams
          </Link>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              background: 'transparent',
              color: 'var(--light-gray)',
              padding: '14px 28px',
              fontFamily: 'var(--font-oswald)',
              fontWeight: 600,
              fontSize: '0.95rem',
              letterSpacing: 2,
              textTransform: 'uppercase',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 4,
            }}
          >
            Back to Event Page
          </Link>
        </div>
      </div>
    </main>
  );
}

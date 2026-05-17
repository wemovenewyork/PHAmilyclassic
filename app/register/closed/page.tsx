import Link from 'next/link';
import { EVENT, REGISTRATION_DEADLINE_DISPLAY } from '@/lib/teams-config';

export const metadata = {
  title: 'Registration Closed',
  description: 'Team registration for the Interstate PHAmily Classic has closed.',
};

export default function RegistrationClosedPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '100px 40px 60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ maxWidth: 600, textAlign: 'center' }}>
        <p className="label" style={{ marginBottom: 16 }}>
          Team Registration
        </p>
        <h1
          className="display"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', marginBottom: 20, lineHeight: 1.1 }}
        >
          Registration Is Closed
        </h1>
        <p
          style={{
            fontSize: '1.05rem',
            color: 'var(--light-gray)',
            lineHeight: 1.7,
            marginBottom: 32,
          }}
        >
          Team registration closed on {REGISTRATION_DEADLINE_DISPLAY}. Custom uniforms
          and rosters are locked. We&apos;ll see you at {EVENT.venue} on {EVENT.date}.
        </p>
        <p
          style={{
            fontSize: '0.95rem',
            color: 'var(--gray)',
            lineHeight: 1.7,
            marginBottom: 40,
          }}
        >
          Spectator tickets may still be available — check the main event page.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            background: 'var(--red)',
            color: 'var(--white)',
            padding: '14px 32px',
            fontFamily: "'Oswald', sans-serif",
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

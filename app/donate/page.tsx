import Link from 'next/link';
import DonationForm from '@/components/DonationForm';
import { DONATION_DISCLAIMER } from '@/lib/donations-config';

export const metadata = {
  title: 'Donate',
  description:
    'Support the Interstate PHAmily Classic — back the events and community work of Adelphic Union Lodge #14.',
};

export default function DonatePage() {
  return (
    <main style={{ minHeight: '100vh', padding: '100px 24px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            marginBottom: 24,
            fontFamily: 'var(--font-barlow-condensed)',
            fontSize: '0.85rem',
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'var(--gray)',
          }}
        >
          ← Back to event
        </Link>

        <p className="label">Support the PHAmily</p>
        <h1
          className="display"
          style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)',
            marginBottom: 16,
            lineHeight: 1.1,
          }}
        >
          Back the PHAmily.
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-barlow)',
            fontSize: '1.05rem',
            lineHeight: 1.7,
            color: 'var(--gray)',
            marginBottom: 32,
          }}
        >
          Can&apos;t make it but want to back the PHAmily? Your gift supports the
          events and community work of AUL #14.
        </p>

        <DonationForm />

        <p
          style={{
            fontFamily: 'var(--font-barlow)',
            fontSize: '0.8rem',
            color: 'var(--gray)',
            marginTop: 32,
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          {DONATION_DISCLAIMER}
        </p>
      </div>
    </main>
  );
}

import Link from 'next/link';
import { getVendorSpotCount } from '@/lib/db-vendors';
import { VENDOR_PACKAGE } from '@/lib/vendor-config';
import VendorForm from '@/components/VendorForm';

// Always render fresh — spot counts change as vendors register.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Vendor Registration',
  description:
    'Small Business & Community Partner Package for the Interstate PHAmily Classic.',
};

export default async function VendorPage() {
  const spotCount = await getVendorSpotCount();

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

        <p className="label">Vendor Registration</p>
        <h1
          className="display"
          style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)',
            marginBottom: 16,
            lineHeight: 1.1,
          }}
        >
          Small Business & Community Partner Package
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
          Become part of the inaugural Interstate PHAmily Classic — a community
          celebration at Riverbank State Park. Vendor packages include booth
          space, event-day signage, and direct access to attendees from across
          the NY/NJ Prince Hall family.
        </p>

        <div
          style={{
            padding: '20px 24px',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
            marginBottom: 32,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-oswald)',
                fontWeight: 600,
                fontSize: '1.4rem',
                color: 'var(--gold)',
              }}
            >
              ${(VENDOR_PACKAGE.priceCents / 100).toFixed(0)} per vendor
            </div>
            <div
              style={{
                fontFamily: 'var(--font-barlow-condensed)',
                fontSize: '0.85rem',
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: 'var(--gray)',
                marginTop: 4,
              }}
            >
              Limited to 20 vendors —{' '}
              {spotCount.is_full ? (
                <span style={{ color: 'var(--red)' }}>SOLD OUT</span>
              ) : (
                <span style={{ color: 'var(--gold)' }}>
                  {spotCount.spots_remaining} of {spotCount.total_spots} spots
                  remaining
                </span>
              )}
            </div>
          </div>
        </div>

        {spotCount.is_full ? (
          <div
            style={{
              padding: '32px 24px',
              border: '1px solid rgba(196,30,42,0.4)',
              borderRadius: 8,
              background: 'rgba(196,30,42,0.05)',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-oswald)',
                fontSize: '1.4rem',
                color: 'var(--white)',
                marginBottom: 12,
              }}
            >
              Vendor packages are sold out
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-barlow)',
                color: 'var(--gray)',
                fontSize: '0.95rem',
              }}
            >
              All 20 vendor spots have been claimed. For waitlist or sponsorship
              inquiries, please contact{' '}
              <a
                href="mailto:info@phamilyclassic.com"
                style={{ color: 'var(--gold)', textDecoration: 'underline' }}
              >
                info@phamilyclassic.com
              </a>
              .
            </p>
          </div>
        ) : (
          <>
            <h2
              style={{
                fontFamily: 'var(--font-oswald)',
                fontSize: '1.1rem',
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: 'var(--white)',
                marginBottom: 20,
              }}
            >
              What's included
            </h2>
            <ul
              style={{
                fontFamily: 'var(--font-barlow)',
                fontSize: '0.95rem',
                lineHeight: 1.8,
                color: 'var(--gray)',
                marginBottom: 40,
                paddingLeft: 20,
              }}
            >
              <li>One reserved vendor booth space at Riverbank State Park</li>
              <li>Event-day signage and logo recognition</li>
              <li>Direct access to all event attendees (12:30 PM – 7:00 PM)</li>
              <li>
                Acknowledgment in event communications and on the official site
              </li>
              <li>
                Merchandise and information/service vendors only (no food
                vendors)
              </li>
            </ul>

            <VendorForm />
          </>
        )}
      </div>
    </main>
  );
}

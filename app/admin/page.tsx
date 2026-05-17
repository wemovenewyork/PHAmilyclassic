import Link from 'next/link';

export const metadata = {
  title: 'Admin Dashboard',
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main style={{ minHeight: '100vh', padding: '100px 40px 60px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <p className="label">Admin</p>
        <h1
          className="display"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', marginBottom: 16, lineHeight: 1.1 }}
        >
          PHAmily Classic Dashboard
        </h1>
        <p style={{ color: 'var(--gray)', lineHeight: 1.7, marginBottom: 40 }}>
          Admin dashboard coming in a later build phase. This will include the registrations
          table, jersey number assignment, size breakdown reports per team, CSV export, and
          check-in tooling.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: '0.85rem',
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'var(--gray)',
          }}
        >
          ← Back to event
        </Link>
      </div>
    </main>
  );
}

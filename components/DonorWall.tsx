import { listDonorWall } from '@/lib/db-donations';
import { formatRelativeTime } from '@/lib/relative-time';

/**
 * Public donor wall — confirmed, non-anonymous donations.
 *
 * Server component. Reads via the service-role helper which queries the
 * underlying `donations` table directly (the `public.donor_wall` view
 * exists as defense-in-depth for any future anon-key read path).
 *
 * Three render branches: error, empty, populated. Per-entry rendering
 * tolerates donor_first_name being null — we show "Friend" + "?" avatar
 * rather than skipping the row, because a confirmed-non-anonymous donation
 * without a name is still a presence on the wall that deserves acknowledgment.
 */

const emptyMessageStyle: React.CSSProperties = {
  fontSize: '1rem',
  color: 'var(--gray)',
  fontStyle: 'italic',
  textAlign: 'center',
  padding: '20px 0',
};

const avatarStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  flexShrink: 0,
  background: 'linear-gradient(135deg, #c6930a, #f5c518)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'var(--font-oswald)',
  fontWeight: 700,
  fontSize: '1rem',
  color: 'var(--navy)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  // Top-aligned so long messages can wrap without dragging the avatar down.
  alignItems: 'flex-start',
  gap: 16,
  padding: '16px 0',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const nameStyle: React.CSSProperties = {
  fontFamily: 'var(--font-barlow)',
  fontWeight: 600,
  fontSize: '0.95rem',
  color: 'var(--white)',
  margin: 0,
};

const messageStyle: React.CSSProperties = {
  fontFamily: 'var(--font-barlow)',
  fontStyle: 'italic',
  fontSize: '0.9rem',
  color: 'var(--light-gray)',
  margin: '4px 0 0 0',
  lineHeight: 1.4,
};

const timestampStyle: React.CSSProperties = {
  fontFamily: 'var(--font-barlow-condensed)',
  fontSize: '0.75rem',
  color: 'var(--gray)',
  letterSpacing: 1,
  textTransform: 'uppercase',
  flexShrink: 0,
};

export default async function DonorWall() {
  const result = await listDonorWall(100);

  return (
    <section id="wall" style={{ marginTop: 64 }}>
      <p className="label">Recent Backers</p>
      <h2
        className="display"
        style={{
          fontSize: 'clamp(1.5rem, 4vw, 2.2rem)',
          marginBottom: 24,
          lineHeight: 1.1,
        }}
      >
        The PHAmily Behind the PHAmily.
      </h2>

      {!result.ok ? (
        <p style={emptyMessageStyle}>
          Couldn&apos;t load the wall right now. Try refreshing in a moment.
        </p>
      ) : result.entries.length === 0 ? (
        <p style={emptyMessageStyle}>Be the first to back the PHAmily.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {result.entries.map((entry) => (
            <li key={entry.id} style={rowStyle}>
              <div style={avatarStyle}>
                {entry.donor_first_name
                  ? entry.donor_first_name[0].toUpperCase()
                  : '?'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={nameStyle}>
                  {entry.donor_first_name ?? 'Friend'}
                </p>
                {entry.public_message && (
                  <p style={messageStyle}>
                    &ldquo;{entry.public_message}&rdquo;
                  </p>
                )}
              </div>

              <span style={timestampStyle}>
                {formatRelativeTime(entry.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

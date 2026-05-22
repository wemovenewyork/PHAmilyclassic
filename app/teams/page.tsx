import Link from 'next/link';
import { getOrderedTeams, EVENT } from '@/lib/teams-config';
import { getAllTeamRosterCounts } from '@/lib/db-public';

// Revalidate at most every 30 seconds. The shopify-webhook handler will
// trigger explicit revalidation on this path when a registration confirms,
// so 30s is just a safety net.
export const revalidate = 30;

export const metadata = {
  title: 'Teams & Rosters',
  description: `See the team rosters for the ${EVENT.name} — ${EVENT.date}.`,
};

export default async function TeamsPage() {
  const teams = getOrderedTeams();
  const counts = await getAllTeamRosterCounts();
  const countsMap = new Map(counts.map((c) => [c.team_slug, c]));

  return (
    <main style={{ minHeight: '100vh', padding: '100px 24px 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
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

        <p className="label">Rosters</p>
        <h1
          className="display"
          style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)',
            marginBottom: 16,
            lineHeight: 1.1,
          }}
        >
          The Teams
        </h1>
        <p
          style={{
            fontSize: '1.05rem',
            color: 'var(--gray)',
            lineHeight: 1.7,
            maxWidth: 640,
            marginBottom: 50,
          }}
        >
          Six teams. Two jurisdictions. One day of fellowship and competition at{' '}
          {EVENT.venue}.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
          }}
        >
          {teams.map((t) => {
            const count = countsMap.get(t.slug);
            return (
              <Link
                key={t.slug}
                href={`/teams/${t.slug}`}
                style={{
                  display: 'block',
                  padding: 28,
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  background:
                    'linear-gradient(145deg, rgba(19,34,68,0.9), rgba(10,22,40,0.95))',
                  transition: 'transform 0.3s, box-shadow 0.3s, border-color 0.3s',
                }}
              >
                <div
                  style={{
                    height: 4,
                    background:
                      t.region === 'NY'
                        ? 'linear-gradient(90deg, var(--bright-blue), var(--royal-blue))'
                        : 'linear-gradient(90deg, var(--red), var(--dark-red))',
                    borderRadius: 2,
                    marginBottom: 20,
                  }}
                />
                <p
                  style={{
                    fontFamily: 'var(--font-barlow-condensed)',
                    fontSize: '0.75rem',
                    letterSpacing: 3,
                    textTransform: 'uppercase',
                    color: t.region === 'NY' ? '#7fb3ff' : '#ff7a85',
                    marginBottom: 8,
                  }}
                >
                  {t.region}{' '}
                  {t.sport === 'knights-of-pythagoras'
                    ? 'Youth Games'
                    : t.sport.charAt(0).toUpperCase() + t.sport.slice(1)}
                </p>
                <h2
                  className="display"
                  style={{ fontSize: '1.3rem', marginBottom: 12, lineHeight: 1.2 }}
                >
                  {t.name}
                </h2>
                {(() => {
                  const spotsRemaining = (count?.spots_remaining ?? t.maxRoster) as number;
                  const isFull = count?.is_full ?? false;
                  const status = isFull
                    ? { label: 'Roster Full', color: 'var(--gray)' }
                    : spotsRemaining <= 2
                    ? { label: 'Almost Full', color: '#ff7a85' }
                    : spotsRemaining <= 5
                    ? { label: 'Filling Up', color: 'var(--gold)' }
                    : { label: 'Spots Available', color: 'var(--gold)' };
                  return (
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: 16,
                        fontFamily: 'var(--font-oswald)',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        letterSpacing: 2,
                        textTransform: 'uppercase',
                        color: status.color,
                      }}
                    >
                      {status.label}
                    </span>
                  );
                })()}
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}

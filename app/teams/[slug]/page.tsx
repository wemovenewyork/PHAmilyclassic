import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTeamBySlug, getOrderedTeams, EVENT } from '@/lib/teams-config';
import { getPublicRosterByTeamSlug, getTeamRosterCount } from '@/lib/db-public';

export const revalidate = 30;

interface Props {
  params: { slug: string };
}

export async function generateStaticParams() {
  return getOrderedTeams().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props) {
  const team = getTeamBySlug(params.slug);
  if (!team) return { title: 'Team Not Found' };
  return {
    title: `${team.name} Roster`,
    description: `${team.name} — ${EVENT.name}, ${EVENT.date}.`,
  };
}

export default async function TeamDetailPage({ params }: Props) {
  const team = getTeamBySlug(params.slug);
  if (!team) notFound();

  const [roster, count] = await Promise.all([
    getPublicRosterByTeamSlug(params.slug),
    getTeamRosterCount(params.slug),
  ]);
  const confirmed = count?.confirmed_count ?? roster.length;

  return (
    <main style={{ minHeight: '100vh', padding: '100px 24px 80px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Link
          href="/teams"
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
          ← All teams
        </Link>

        <p
          className="label"
          style={{
            color: team.region === 'NY' ? '#7fb3ff' : '#ff7a85',
            marginBottom: 8,
          }}
        >
          {team.region}{' '}
          {team.sport === 'knights-of-pythagoras'
            ? 'Youth Games'
            : team.sport.charAt(0).toUpperCase() + team.sport.slice(1)}
        </p>
        <h1
          className="display"
          style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)',
            marginBottom: 16,
            lineHeight: 1.1,
          }}
        >
          {team.name}
        </h1>
        <p
          style={{
            fontSize: '1rem',
            color: 'var(--gray)',
            lineHeight: 1.7,
            marginBottom: 40,
          }}
        >
          {team.ageGroup === 'youth' ? 'Youth team (ages 9–20).' : 'Adult team.'}{' '}
          {confirmed} of {team.maxRoster} spots confirmed.
        </p>

        <div
          style={{
            padding: 24,
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          {roster.length === 0 ? (
            <p
              style={{
                fontSize: '1rem',
                color: 'var(--gray)',
                fontStyle: 'italic',
                textAlign: 'center',
                padding: '20px 0',
              }}
            >
              No players confirmed yet. Be the first.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
              {roster.map((p) => (
                <li
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span
                    className="display"
                    style={{
                      fontSize: '1.4rem',
                      color: 'var(--gold)',
                      minWidth: 40,
                    }}
                  >
                    {p.jersey_number ?? '—'}
                  </span>
                  <span style={{ fontSize: '1rem', color: 'var(--white)' }}>
                    {p.full_name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {confirmed < team.maxRoster && (
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <Link
              href="/register"
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
              Register for a Team
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

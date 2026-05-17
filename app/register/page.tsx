import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getOrderedTeams,
  EVENT,
  REGISTRATION_DEADLINE_DISPLAY,
  REGISTRATION_DEADLINE_ISO,
  isRegistrationOpen,
} from '@/lib/teams-config';
import { getAllTeamRosterCounts } from '@/lib/db-public';
import RegistrationForm from '@/components/RegistrationForm';

// Always render fresh — team counts change as people register.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Team Registration',
  description: `Register for a team at the ${EVENT.name} — ${EVENT.date}.`,
};

export default async function RegisterPage() {
  if (!isRegistrationOpen()) {
    redirect('/register/closed');
  }

  const teams = getOrderedTeams();
  const counts = await getAllTeamRosterCounts();

  // Merge config + live counts into a single shape for the form.
  // If counts query failed (e.g., DB not seeded yet), treat all teams as empty.
  const countsMap = new Map(counts.map((c) => [c.team_slug, c]));
  const teamsWithCounts = teams.map((t) => {
    const count = countsMap.get(t.slug);
    return {
      ...t,
      confirmedCount: count?.confirmed_count ?? 0,
      spotsRemaining: count?.spots_remaining ?? t.maxRoster,
      isFull: count?.is_full ?? false,
    };
  });

  const daysUntilDeadline = Math.max(
    0,
    Math.ceil(
      (new Date(REGISTRATION_DEADLINE_ISO).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24)
    )
  );

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

        <p className="label">Team Registration</p>
        <h1
          className="display"
          style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)',
            marginBottom: 16,
            lineHeight: 1.1,
          }}
        >
          Claim Your Spot
        </h1>
        <p
          style={{
            fontSize: '1.05rem',
            color: 'var(--gray)',
            lineHeight: 1.7,
            maxWidth: 640,
            marginBottom: 32,
          }}
        >
          ${EVENT.registrationFee} per player. Includes custom team jersey,
          shorts, 2 spectator tickets, and team placement. Registration closes{' '}
          <strong style={{ color: 'var(--gold)' }}>
            {REGISTRATION_DEADLINE_DISPLAY}
          </strong>
          .
        </p>

        {daysUntilDeadline <= 7 && daysUntilDeadline > 0 && (
          <div
            role="alert"
            style={{
              padding: '14px 20px',
              border: '1px solid rgba(196,30,42,0.4)',
              borderRadius: 6,
              background: 'rgba(196,30,42,0.1)',
              marginBottom: 32,
              fontFamily: 'var(--font-oswald)',
              fontSize: '0.95rem',
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: '#ff7a85',
              textAlign: 'center',
            }}
          >
            ⚠ Registration closes in {daysUntilDeadline}{' '}
            {daysUntilDeadline === 1 ? 'day' : 'days'}
          </div>
        )}

        <RegistrationForm teams={teamsWithCounts} />
      </div>
    </main>
  );
}

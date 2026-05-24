import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTicketByToken } from '@/lib/db-admin';
import { generateQRDataUrl } from '@/lib/qr';
import { getTeamBySlug } from '@/lib/teams-config';

/**
 * Hosted ticket page — the URL the QR code encodes.
 *
 * Scanning the QR with any phone camera lands the user here. The page
 * renders large at high contrast (dark navy background, white card) so
 * a gate scanner can read the QR straight off the holder's phone.
 *
 * Server component. Looks up the ticket by token via the service-role
 * client — no separate auth gate. Possessing the token IS the auth.
 */

export const dynamic = 'force-dynamic';

interface Props {
  params: { token: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ticket = await getTicketByToken(params.token);
  if (!ticket) return { title: 'Ticket Not Found' };
  return {
    title: `${ticket.holder_name} — Interstate PHAmily Classic Ticket`,
    description: 'Show this at the gate.',
    robots: { index: false, follow: false },
  };
}

const NAVY = '#0a1a3a';
const GOLD = '#d4a017';

export default async function TicketPage({ params }: Props) {
  const ticket = await getTicketByToken(params.token);
  if (!ticket) notFound();

  const qrDataUrl = await generateQRDataUrl(ticket.token, { size: 640, margin: 1 });
  const team = ticket.team_slug ? getTeamBySlug(ticket.team_slug) : null;

  const ticketTypeLabel =
    ticket.ticket_type === 'team_registration'
      ? 'TEAM REGISTRATION'
      : ticket.ticket_type === 'after_party'
      ? 'AFTER PARTY TICKET'
      : ticket.ticket_type === 'comp'
      ? 'COMPLIMENTARY'
      : ticket.event === 'after_party'
      ? 'AFTER PARTY TICKET'
      : 'MAIN EVENT TICKET';

  const statusBadge = renderStatusBadge(ticket);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: NAVY,
        padding: '32px 16px 56px',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* Brand header */}
        <header style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: 3,
              color: GOLD,
              textTransform: 'uppercase',
            }}
          >
            Interstate PHAmily Classic
          </div>
          <div
            style={{
              fontSize: 12,
              letterSpacing: 2,
              color: 'rgba(255,255,255,0.6)',
              marginTop: 4,
              textTransform: 'uppercase',
            }}
          >
            August 29, 2026
          </div>
        </header>

        {/* Ticket card */}
        <section
          style={{
            background: '#fff',
            color: '#1a1a1a',
            borderRadius: 8,
            padding: '24px 20px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: 3,
              color: GOLD,
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            {ticketTypeLabel}
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              margin: '6px 0 18px',
              lineHeight: 1.2,
            }}
          >
            {ticket.holder_name}
          </h1>

          {/* QR — sized generously and forced-render in light mode via white bg */}
          <div
            style={{
              background: '#fff',
              padding: 12,
              borderRadius: 4,
              display: 'inline-block',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="Ticket QR code"
              width={320}
              height={320}
              style={{ display: 'block', width: 320, height: 320 }}
            />
          </div>

          <div
            style={{
              fontSize: 12,
              letterSpacing: 3,
              color: '#555',
              fontWeight: 600,
              marginTop: 12,
              textTransform: 'uppercase',
            }}
          >
            Show This At The Gate
          </div>

          <div style={{ marginTop: 16 }}>{statusBadge}</div>
        </section>

        {/* Conditional info blocks */}
        {(team || ticket.jersey_size || ticket.shorts_size) && (
          <section
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 8,
              padding: 16,
              marginTop: 16,
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            {team && (
              <div>
                <strong style={{ color: GOLD }}>Team:</strong> {team.name}
              </div>
            )}
            {ticket.jersey_size && (
              <div>
                <strong style={{ color: GOLD }}>Jersey size:</strong>{' '}
                {ticket.jersey_size}
              </div>
            )}
            {ticket.shorts_size && (
              <div>
                <strong style={{ color: GOLD }}>Shorts size:</strong>{' '}
                {ticket.shorts_size}
              </div>
            )}
          </section>
        )}

        {ticket.age_group === 'youth' && (
          <section
            style={{
              background: 'rgba(212,160,23,0.12)',
              border: '1px solid rgba(212,160,23,0.5)',
              borderRadius: 8,
              padding: 14,
              marginTop: 16,
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: GOLD }}>Parent or guardian required.</strong>{' '}
            {ticket.guardian_name
              ? `On file: ${ticket.guardian_name}.`
              : 'A parent or guardian must accompany this attendee.'}
          </section>
        )}

        {/* Event details */}
        <section
          style={{
            marginTop: 16,
            fontSize: 13,
            lineHeight: 1.65,
            color: 'rgba(255,255,255,0.8)',
          }}
        >
          {ticket.event === 'after_party' ? (
            <>
              <div>
                <strong style={{ color: GOLD }}>After party:</strong> 9:00 PM
                onwards
              </div>
              <div>
                MW Prince Hall Grand Lodge of New York
                <br />
                454 W. 155th Street, New York, NY 10032
              </div>
            </>
          ) : (
            <>
              <div>
                <strong style={{ color: GOLD }}>Main event:</strong> 1:00 PM –
                7:00 PM
              </div>
              <div>
                Riverbank State Park
                <br />
                679 Riverside Drive, New York, NY 10031
              </div>
            </>
          )}
        </section>

        <footer
          style={{
            marginTop: 24,
            textAlign: 'center',
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
            letterSpacing: 1,
          }}
        >
          Order {ticket.shopify_order_number ?? '—'} · Ticket ID …
          {ticket.token.slice(-8)}
        </footer>
      </div>
    </main>
  );
}

function renderStatusBadge(ticket: { status: string; scanned_at: string | null; voided_reason: string | null }) {
  if (ticket.status === 'issued') {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '6px 16px',
          background: '#16a34a',
          color: '#fff',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}
      >
        Valid
      </span>
    );
  }
  if (ticket.status === 'scanned') {
    return (
      <div>
        <span
          style={{
            display: 'inline-block',
            padding: '6px 16px',
            background: '#ea580c',
            color: '#fff',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Already Scanned
        </span>
        {ticket.scanned_at && (
          <div style={{ fontSize: 11, color: '#777', marginTop: 6 }}>
            {new Date(ticket.scanned_at).toLocaleString()}
          </div>
        )}
      </div>
    );
  }
  if (ticket.status === 'voided') {
    return (
      <div>
        <span
          style={{
            display: 'inline-block',
            padding: '6px 16px',
            background: '#dc2626',
            color: '#fff',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Voided
        </span>
        {ticket.voided_reason && (
          <div style={{ fontSize: 11, color: '#777', marginTop: 6 }}>
            {ticket.voided_reason}
          </div>
        )}
      </div>
    );
  }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '6px 16px',
        background: '#dc2626',
        color: '#fff',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: 'uppercase',
      }}
    >
      Refunded
    </span>
  );
}

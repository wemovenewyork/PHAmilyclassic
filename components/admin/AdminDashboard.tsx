'use client';
import { useCallback, useEffect, useState } from 'react';
import IssueCompModal from './IssueCompModal';
import TicketsSection from './TicketsSection';
import ScanLogSection from './ScanLogSection';

/**
 * Admin dashboard shell — header, stats strip, Issue Comp button, ticket list,
 * scan log feed. Inline styles to match the rest of the site (Tailwind isn't
 * installed in this repo despite what the spec stack reminder said — flagged
 * in the PR description).
 */

const NAVY = '#0a1a3a';
const GOLD = '#d4a017';
const TEXT = '#1a1a1a';
const MUTED = '#666';
const BORDER = '#e2e2e2';

interface StatsBucket {
  issued: number;
  scanned: number;
  voided: number;
  refunded: number;
}
interface StatsResponse {
  ok: boolean;
  stats: { main_event: StatsBucket; after_party: StatsBucket };
}

export default function AdminDashboard({
  adminEmail,
  adminDisplayName,
}: {
  adminEmail: string;
  adminDisplayName: string;
}) {
  const [stats, setStats] = useState<StatsResponse['stats'] | null>(null);
  const [statsBusy, setStatsBusy] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [showCompModal, setShowCompModal] = useState(false);
  const [ticketsReloadKey, setTicketsReloadKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    setStatsBusy(true);
    setStatsError(null);
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.assign('/admin/login?redirectTo=/admin');
        return;
      }
      const data = (await res.json()) as StatsResponse;
      if (data.ok) setStats(data.stats);
    } catch {
      setStatsError('Could not load stats');
    } finally {
      setStatsBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  async function onLogout() {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => null);
    window.location.assign('/admin/login');
  }

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4500);
  }

  function onCompIssued(message: string) {
    setShowCompModal(false);
    showToast(message);
    setTicketsReloadKey((k) => k + 1);
    void refreshStats();
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f5f6f8',
        color: TEXT,
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          background: NAVY,
          color: '#fff',
          padding: '16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 3,
                color: GOLD,
                textTransform: 'uppercase',
              }}
            >
              PHAmily Classic
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
              Admin Dashboard
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {adminDisplayName}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                {adminEmail}
              </div>
            </div>
            <button
              onClick={onLogout}
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '8px 14px',
                borderRadius: 4,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Log out
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <StatsStrip
          stats={stats}
          busy={statsBusy}
          error={statsError}
          onRefresh={refreshStats}
        />
      </header>

      {/* Main content */}
      <div
        style={{
          padding: '20px 24px 60px',
          maxWidth: 1280,
          margin: '0 auto',
        }}
      >
        {/* Issue Comp button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            onClick={() => setShowCompModal(true)}
            style={{
              background: GOLD,
              color: NAVY,
              border: 0,
              padding: '12px 20px',
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Issue Comp
          </button>
        </div>

        {/* Tickets */}
        <TicketsSection
          reloadKey={ticketsReloadKey}
          onActionCompleted={(msg) => {
            showToast(msg);
            setTicketsReloadKey((k) => k + 1);
            void refreshStats();
          }}
        />

        {/* Scan log */}
        <div style={{ marginTop: 32 }}>
          <ScanLogSection />
        </div>
      </div>

      {/* Modals + toast */}
      {showCompModal && (
        <IssueCompModal
          onClose={() => setShowCompModal(false)}
          onIssued={onCompIssued}
        />
      )}
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            right: 20,
            bottom: 20,
            background: NAVY,
            color: '#fff',
            padding: '14px 18px',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
            maxWidth: 380,
            fontSize: 14,
            lineHeight: 1.5,
            zIndex: 50,
          }}
        >
          {toast}
        </div>
      )}
    </main>
  );

  function StatsStrip({
    stats,
    busy,
    error,
    onRefresh,
  }: {
    stats: StatsResponse['stats'] | null;
    busy: boolean;
    error: string | null;
    onRefresh: () => void;
  }) {
    return (
      <div
        style={{
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 6,
          padding: 14,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
          alignItems: 'stretch',
        }}
      >
        <StatsCard label="Main Event" bucket={stats?.main_event} />
        <StatsCard label="After Party" bucket={stats?.after_party} />
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
          <button
            onClick={onRefresh}
            disabled={busy}
            style={{
              background: 'transparent',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.2)',
              padding: '6px 14px',
              borderRadius: 4,
              fontSize: 12,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'Refreshing…' : 'Refresh ↻'}
          </button>
        </div>
        {error && (
          <div style={{ color: '#ef4444', fontSize: 12, gridColumn: '1 / -1' }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  function StatsCard({
    label,
    bucket,
  }: {
    label: string;
    bucket: StatsBucket | undefined;
  }) {
    return (
      <div
        style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 4,
          padding: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 2,
            color: GOLD,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 13 }}>
          <span>
            <strong>{bucket?.issued ?? '–'}</strong> issued
          </span>
          <span>
            <strong>{bucket?.scanned ?? '–'}</strong> scanned
          </span>
          <span>
            <strong>{bucket?.voided ?? '–'}</strong> voided
          </span>
          {bucket && bucket.refunded > 0 && (
            <span>
              <strong>{bucket.refunded}</strong> refunded
            </span>
          )}
        </div>
      </div>
    );
  }
}

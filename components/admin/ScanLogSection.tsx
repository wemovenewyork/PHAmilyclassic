'use client';
import { useCallback, useEffect, useState } from 'react';

const NAVY = '#0a1a3a';
const SUCCESS_GREEN = '#16a34a';
const ERROR_RED = '#ef4444';

interface ScanLogEntry {
  id: string;
  attempted_at: string;
  ticket_id: string | null;
  holder_name: string | null;
  event: 'main_event' | 'after_party' | null;
  result:
    | 'success'
    | 'already_used'
    | 'wrong_event'
    | 'refunded'
    | 'voided'
    | 'not_found';
  location: 'main_gate' | 'after_party' | 'manual' | null;
  source: 'qr' | 'manual_lookup' | 'offline_admit' | null;
  scanner: string;
}

const RESULT_OPTIONS: Array<{
  id: '' | ScanLogEntry['result'];
  label: string;
}> = [
  { id: '', label: 'All results' },
  { id: 'success', label: 'Admitted' },
  { id: 'already_used', label: 'Already used' },
  { id: 'wrong_event', label: 'Wrong event' },
  { id: 'refunded', label: 'Refunded' },
  { id: 'voided', label: 'Voided' },
  { id: 'not_found', label: 'Not found' },
];

function resultBadge(result: ScanLogEntry['result']) {
  const map: Record<ScanLogEntry['result'], { label: string; color: string }> = {
    success: { label: 'Admitted', color: SUCCESS_GREEN },
    already_used: { label: 'Already used', color: '#ea580c' },
    wrong_event: { label: 'Wrong event', color: '#ca8a04' },
    refunded: { label: 'Refunded', color: ERROR_RED },
    voided: { label: 'Voided', color: ERROR_RED },
    not_found: { label: 'Not found', color: '#888' },
  };
  const cfg = map[result];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: 'uppercase',
        background: cfg.color,
        color: '#fff',
        borderRadius: 4,
      }}
    >
      {cfg.label}
    </span>
  );
}

function gateLabel(location: ScanLogEntry['location']) {
  if (location === 'main_gate') return 'Main Gate';
  if (location === 'after_party') return 'After Party';
  if (location === 'manual') return 'Manual';
  return '—';
}

function formatDateNY(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
    });
  } catch {
    return iso;
  }
}

export default function ScanLogSection() {
  const [filter, setFilter] = useState<'' | ScanLogEntry['result']>('');
  const [entries, setEntries] = useState<ScanLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter) params.set('result', filter);
      params.set('limit', '50');
      const res = await fetch(`/api/admin/scan-log?${params.toString()}`, {
        cache: 'no-store',
      });
      if (res.status === 401) {
        window.location.assign('/admin/login?redirectTo=/admin');
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        entries?: ScanLogEntry[];
        nextCursor?: string | null;
      };
      setEntries(data.entries ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      setError('Could not load scan log');
    } finally {
      setBusy(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!nextCursor || busy) return;
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set('result', filter);
      params.set('cursor', nextCursor);
      params.set('limit', '50');
      const res = await fetch(`/api/admin/scan-log?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        entries?: ScanLogEntry[];
        nextCursor?: string | null;
      };
      setEntries((prev) => [...prev, ...(data.entries ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      setError('Could not load more');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 8,
        border: '1px solid #e0e0e0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          padding: 16,
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Scan log</h2>
          <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>
            Live feed from <code>ticket_scan_log</code> — most recent first.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {RESULT_OPTIONS.map((opt) => (
            <button
              key={opt.id || 'all'}
              onClick={() => setFilter(opt.id)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 999,
                border: `1px solid ${filter === opt.id ? NAVY : '#ccc'}`,
                background: filter === opt.id ? NAVY : '#fff',
                color: filter === opt.id ? '#fff' : '#333',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <Th>Time</Th>
              <Th>Ticket</Th>
              <Th>Holder</Th>
              <Th>Event</Th>
              <Th>Result</Th>
              <Th>Gate</Th>
              <Th>Source</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                <Td>{formatDateNY(e.attempted_at)}</Td>
                <Td>
                  <code
                    style={{
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      fontSize: 11,
                    }}
                  >
                    {e.ticket_id ? e.ticket_id.slice(0, 8) : '—'}
                  </code>
                </Td>
                <Td>{e.holder_name ?? '—'}</Td>
                <Td>{e.event === 'after_party' ? 'After Party' : e.event === 'main_event' ? 'Main Event' : '—'}</Td>
                <Td>{resultBadge(e.result)}</Td>
                <Td>{gateLabel(e.location)}</Td>
                <Td>
                  {e.source === 'manual_lookup'
                    ? 'Manual lookup'
                    : e.source === 'offline_admit'
                    ? 'Offline'
                    : e.source === 'qr'
                    ? 'QR'
                    : '—'}
                </Td>
              </tr>
            ))}
            {entries.length === 0 && !busy && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: 28,
                    textAlign: 'center',
                    color: '#888',
                    fontSize: 13,
                  }}
                >
                  No scan log entries{filter ? ' for this filter' : ''} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div style={{ padding: 12, color: ERROR_RED, fontSize: 13 }}>{error}</div>
      )}

      <div
        style={{
          padding: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 13,
          color: '#777',
        }}
      >
        <span>{entries.length} loaded{nextCursor ? ' · more available' : ''}</span>
        {nextCursor && (
          <button
            onClick={loadMore}
            disabled={busy}
            style={{
              padding: '8px 14px',
              border: '1px solid #ccc',
              background: '#fff',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {busy ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: '#666',
        padding: '10px 12px',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '10px 12px' }}>{children}</td>;
}

'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const NAVY = '#0a1a3a';
const GOLD = '#d4a017';
const SUCCESS_GREEN = '#16a34a';
const ORANGE = '#ea580c';
const ERROR_RED = '#ef4444';

interface TicketRow {
  id: string;
  token: string;
  shopify_order_id: string;
  shopify_order_number: string | null;
  ticket_type: 'team_registration' | 'spectator' | 'after_party' | 'comp';
  event: 'main_event' | 'after_party';
  status: 'issued' | 'scanned' | 'voided' | 'refunded';
  holder_name: string;
  holder_email: string;
  created_at: string;
}

interface ListResponse {
  ok: boolean;
  tickets: TicketRow[];
  nextCursor: string | null;
}

interface AuditEntry {
  id: string;
  ticket_id: string;
  admin_id: string;
  admin_display_name: string | null;
  action: 'issued' | 'voided' | 'restored' | 'resent' | 'email_changed';
  metadata: Record<string, unknown>;
  created_at: string;
}

const PAID_COMP_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'paid', label: 'Paid' },
  { id: 'comp', label: 'Comp' },
] as const;

const STATUS_OPTIONS = [
  { id: 'issued', label: 'Issued (Valid)' },
  { id: 'scanned', label: 'Scanned' },
  { id: 'voided', label: 'Voided' },
  { id: 'refunded', label: 'Refunded' },
] as const;

const EVENT_OPTIONS = [
  { id: 'all', label: 'All Events' },
  { id: 'main_event', label: 'Main Event' },
  { id: 'after_party', label: 'After Party' },
  { id: 'combo', label: 'Combo (comp)' },
] as const;

function statusBadge(status: TicketRow['status']) {
  const color =
    status === 'issued'
      ? SUCCESS_GREEN
      : status === 'scanned'
      ? ORANGE
      : status === 'voided' || status === 'refunded'
      ? ERROR_RED
      : '#777';
  const label =
    status === 'issued' ? 'Valid' : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: '#fff',
        background: color,
        borderRadius: 4,
      }}
    >
      {label}
    </span>
  );
}

function typeBadge(t: TicketRow['ticket_type']) {
  if (t === 'comp') {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          background: GOLD,
          color: NAVY,
          borderRadius: 4,
        }}
      >
        Comp
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: 'uppercase',
        background: '#e2e2e2',
        color: '#333',
        borderRadius: 4,
      }}
    >
      Paid
    </span>
  );
}

function eventLabel(e: TicketRow['event']) {
  return e === 'after_party' ? 'After Party' : 'Main Event';
}

function formatDateNY(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' });
  } catch {
    return iso;
  }
}

export default function TicketsSection({
  reloadKey,
  onActionCompleted,
}: {
  reloadKey: number;
  onActionCompleted: (msg: string) => void;
}) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [paidComp, setPaidComp] = useState<'all' | 'paid' | 'comp'>('all');
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [eventFilter, setEventFilter] = useState<
    'all' | 'main_event' | 'after_party' | 'combo'
  >('all');

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [voidTarget, setVoidTarget] = useState<TicketRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<TicketRow | null>(null);
  const [resendTarget, setResendTarget] = useState<TicketRow | null>(null);
  const [historyTarget, setHistoryTarget] = useState<TicketRow | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
    params.set('type', paidComp);
    if (statusFilters.size > 0) {
      params.set('status', Array.from(statusFilters).join(','));
    } else {
      params.set('status', 'all');
    }
    params.set('event', eventFilter);
    params.set('limit', '50');
    return params.toString();
  }, [debouncedQuery, paidComp, statusFilters, eventFilter]);

  const loadFirstPage = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tickets?${queryString}`, {
        cache: 'no-store',
      });
      if (res.status === 401) {
        window.location.assign('/admin/login?redirectTo=/admin');
        return;
      }
      const data = (await res.json()) as ListResponse;
      setTickets(data.tickets ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      setError('Could not load tickets');
    } finally {
      setBusy(false);
    }
  }, [queryString]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage, reloadKey]);

  async function loadMore() {
    if (!nextCursor || busy) return;
    setBusy(true);
    try {
      const params = new URLSearchParams(queryString);
      params.set('cursor', nextCursor);
      const res = await fetch(`/api/admin/tickets?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = (await res.json()) as ListResponse;
      setTickets((prev) => [...prev, ...(data.tickets ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      setError('Could not load more');
    } finally {
      setBusy(false);
    }
  }

  function toggleStatusFilter(s: string) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 8,
        border: `1px solid #e0e0e0`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Tickets</h2>
        <input
          type="text"
          placeholder="Search name, email, order #, ticket id, or token"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            marginTop: 12,
            padding: '10px 12px',
            fontSize: 14,
            border: '1px solid #ccc',
            borderRadius: 6,
            outline: 'none',
          }}
        />
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <FilterChips
            label="Type"
            options={PAID_COMP_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            value={[paidComp]}
            onToggle={(id) => setPaidComp(id as typeof paidComp)}
            singleSelect
          />
          <FilterChips
            label="Status"
            options={STATUS_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            value={Array.from(statusFilters)}
            onToggle={toggleStatusFilter}
          />
          <FilterChips
            label="Event"
            options={EVENT_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            value={[eventFilter]}
            onToggle={(id) => setEventFilter(id as typeof eventFilter)}
            singleSelect
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <Th>ID</Th>
              <Th>Type</Th>
              <Th>Holder</Th>
              <Th>Email</Th>
              <Th>Event</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr
                key={t.id}
                style={{ borderTop: '1px solid #f0f0f0', verticalAlign: 'middle' }}
              >
                <Td>
                  <code
                    style={{
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      fontSize: 11,
                    }}
                  >
                    {t.id.slice(0, 8)}
                  </code>
                </Td>
                <Td>{typeBadge(t.ticket_type)}</Td>
                <Td>{t.holder_name}</Td>
                <Td>{t.holder_email}</Td>
                <Td>{eventLabel(t.event)}</Td>
                <Td>{statusBadge(t.status)}</Td>
                <Td>{formatDateNY(t.created_at)}</Td>
                <Td align="right">
                  <div
                    style={{
                      display: 'inline-flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                    }}
                  >
                    {t.status !== 'voided' && t.status !== 'refunded' && (
                      <ActionBtn onClick={() => setResendTarget(t)}>Resend</ActionBtn>
                    )}
                    {t.status === 'issued' || t.status === 'scanned' ? (
                      <ActionBtn onClick={() => setVoidTarget(t)} variant="danger">
                        Void
                      </ActionBtn>
                    ) : null}
                    {(t.status === 'voided' || t.status === 'refunded') && (
                      <ActionBtn onClick={() => setRestoreTarget(t)}>Restore</ActionBtn>
                    )}
                    <ActionBtn onClick={() => setHistoryTarget(t)} variant="quiet">
                      History
                    </ActionBtn>
                  </div>
                </Td>
              </tr>
            ))}
            {tickets.length === 0 && !busy && (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: 28,
                    textAlign: 'center',
                    color: '#888',
                    fontSize: 13,
                  }}
                >
                  No tickets match the current filters.
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
        <span>
          {tickets.length} loaded{nextCursor ? ' · more available' : ''}
        </span>
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

      {voidTarget && (
        <VoidModal
          ticket={voidTarget}
          onClose={() => setVoidTarget(null)}
          onDone={(msg) => {
            setVoidTarget(null);
            onActionCompleted(msg);
          }}
        />
      )}
      {restoreTarget && (
        <RestoreModal
          ticket={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onDone={(msg) => {
            setRestoreTarget(null);
            onActionCompleted(msg);
          }}
        />
      )}
      {resendTarget && (
        <ResendModal
          ticket={resendTarget}
          onClose={() => setResendTarget(null)}
          onDone={(msg) => {
            setResendTarget(null);
            onActionCompleted(msg);
          }}
        />
      )}
      {historyTarget && (
        <HistoryModal
          ticket={historyTarget}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </section>
  );
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), ms);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, ms]);
  return debounced;
}

function FilterChips({
  label,
  options,
  value,
  onToggle,
  singleSelect,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string[];
  onToggle: (id: string) => void;
  singleSelect?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>{label}:</span>
      {options.map((opt) => {
        const active = value.includes(opt.id);
        return (
          <button
            key={opt.id}
            onClick={() => onToggle(opt.id)}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 999,
              border: `1px solid ${active ? NAVY : '#ccc'}`,
              background: active ? NAVY : '#fff',
              color: active ? '#fff' : '#333',
              cursor: 'pointer',
            }}
            title={singleSelect ? 'Single-select' : 'Multi-select'}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      style={{
        textAlign: align ?? 'left',
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

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <td style={{ padding: '10px 12px', textAlign: align ?? 'left' }}>{children}</td>
  );
}

function ActionBtn({
  children,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'danger' | 'quiet';
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 4,
        border: `1px solid ${
          variant === 'danger' ? ERROR_RED : variant === 'quiet' ? '#ddd' : NAVY
        }`,
        background:
          variant === 'danger' ? ERROR_RED : variant === 'quiet' ? '#fff' : '#fff',
        color: variant === 'danger' ? '#fff' : variant === 'quiet' ? '#666' : NAVY,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ---- Modals ----

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,26,58,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 10,
          padding: 22,
          maxWidth: 500,
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 18px 40px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 0,
              fontSize: 22,
              color: '#777',
              cursor: 'pointer',
              padding: '0 6px',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ marginTop: 14 }}>{children}</div>
      </div>
    </div>
  );
}

function VoidModal({
  ticket,
  onClose,
  onDone,
}: {
  ticket: TicketRow;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ticket/${ticket.id}/void`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.status === 401) {
        window.location.assign('/admin/login?redirectTo=/admin');
        return;
      }
      if (!data.ok) {
        setError(data.error ?? 'Void failed');
        return;
      }
      onDone(`Voided ticket ${ticket.id.slice(0, 8)} for ${ticket.holder_email}.`);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalShell title={`Void ticket #${ticket.id.slice(0, 8)}?`} onClose={onClose}>
      <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 0 }}>
        Void ticket <strong>#{ticket.id.slice(0, 8)}</strong> for{' '}
        <strong>{ticket.holder_email}</strong>?
      </p>
      <p style={{ fontSize: 13, color: '#555', lineHeight: 1.55 }}>
        This will invalidate the QR code immediately. The next scan attempt will fail.
      </p>
      <p style={{ fontSize: 13, color: '#555', lineHeight: 1.55 }}>
        This does NOT refund the Shopify order. If this is a paid ticket and the customer
        needs a refund, issue the refund separately in Shopify after voiding here.
      </p>
      <p style={{ fontSize: 13, color: '#555', lineHeight: 1.55 }}>
        You can restore this ticket later from the ticket list if this was a mistake.
      </p>
      {error && <p style={{ color: ERROR_RED, fontSize: 13 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button
          onClick={onClose}
          disabled={busy}
          style={{ padding: '10px 18px', border: '1px solid #ccc', background: '#fff', borderRadius: 6, cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={busy}
          style={{
            padding: '10px 18px',
            background: ERROR_RED,
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Voiding…' : 'Void Ticket'}
        </button>
      </div>
    </ModalShell>
  );
}

function RestoreModal({
  ticket,
  onClose,
  onDone,
}: {
  ticket: TicketRow;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ticket/${ticket.id}/restore`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.status === 401) {
        window.location.assign('/admin/login?redirectTo=/admin');
        return;
      }
      if (!data.ok) {
        setError(data.error ?? 'Restore failed');
        return;
      }
      onDone(`Restored ticket ${ticket.id.slice(0, 8)} for ${ticket.holder_email}.`);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalShell title={`Restore ticket #${ticket.id.slice(0, 8)}?`} onClose={onClose}>
      <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 0 }}>
        Restore ticket <strong>#{ticket.id.slice(0, 8)}</strong> for{' '}
        <strong>{ticket.holder_email}</strong>?
      </p>
      <p style={{ fontSize: 13, color: '#555', lineHeight: 1.55 }}>
        The QR code will become valid again and the ticket will scan at the gate.
      </p>
      {error && <p style={{ color: ERROR_RED, fontSize: 13 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button
          onClick={onClose}
          disabled={busy}
          style={{ padding: '10px 18px', border: '1px solid #ccc', background: '#fff', borderRadius: 6, cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={busy}
          style={{
            padding: '10px 18px',
            background: NAVY,
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Restoring…' : 'Restore Ticket'}
        </button>
      </div>
    </ModalShell>
  );
}

function ResendModal({
  ticket,
  onClose,
  onDone,
}: {
  ticket: TicketRow;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailOverride, setEmailOverride] = useState('');
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ticket/${ticket.id}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_override: emailOverride.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sent_to?: string;
      };
      if (res.status === 401) {
        window.location.assign('/admin/login?redirectTo=/admin');
        return;
      }
      if (!data.ok) {
        setError(data.error ?? 'Resend failed');
        return;
      }
      const note =
        emailOverride && emailOverride.trim() !== ticket.holder_email
          ? ` (holder email updated to ${data.sent_to})`
          : '';
      onDone(`Resent ticket ${ticket.id.slice(0, 8)} to ${data.sent_to}${note}.`);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalShell title={`Resend ticket #${ticket.id.slice(0, 8)}?`} onClose={onClose}>
      <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 0 }}>
        By default, the ticket email will be re-sent to{' '}
        <strong>{ticket.holder_email}</strong>.
      </p>
      <label style={{ fontSize: 13, color: '#555', display: 'block', marginTop: 12 }}>
        Send to a different email instead? (optional)
        <input
          type="email"
          value={emailOverride}
          onChange={(e) => setEmailOverride(e.target.value)}
          placeholder=""
          disabled={busy}
          style={{
            width: '100%',
            padding: '10px 12px',
            marginTop: 6,
            fontSize: 14,
            border: '1px solid #ccc',
            borderRadius: 4,
            outline: 'none',
          }}
        />
      </label>
      <p style={{ fontSize: 12, color: '#777', lineHeight: 1.55, marginTop: 10 }}>
        If you enter a different email, this ticket&apos;s holder email will be updated to
        the new address and the change will be logged.
      </p>
      {error && <p style={{ color: ERROR_RED, fontSize: 13 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button
          onClick={onClose}
          disabled={busy}
          style={{ padding: '10px 18px', border: '1px solid #ccc', background: '#fff', borderRadius: 6, cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={busy}
          style={{
            padding: '10px 18px',
            background: NAVY,
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Resending…' : 'Resend'}
        </button>
      </div>
    </ModalShell>
  );
}

function HistoryModal({
  ticket,
  onClose,
}: {
  ticket: TicketRow;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/admin/ticket/${ticket.id}/history`, {
          cache: 'no-store',
        });
        if (res.status === 401) {
          window.location.assign('/admin/login?redirectTo=/admin');
          return;
        }
        const data = (await res.json()) as { ok?: boolean; entries?: AuditEntry[] };
        if (data.ok) setEntries(data.entries ?? []);
        else setError('Could not load history');
      } catch {
        setError('Network error');
      } finally {
        setBusy(false);
      }
    })();
  }, [ticket.id]);

  return (
    <ModalShell title={`History — #${ticket.id.slice(0, 8)}`} onClose={onClose}>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 14 }}>
        Holder: <strong>{ticket.holder_name}</strong> · {ticket.holder_email}
      </div>
      {busy && <p style={{ fontSize: 13, color: '#777' }}>Loading…</p>}
      {error && <p style={{ color: ERROR_RED, fontSize: 13 }}>{error}</p>}
      {!busy && !error && entries.length === 0 && (
        <p style={{ fontSize: 13, color: '#777' }}>No admin actions recorded for this ticket.</p>
      )}
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {entries.map((e) => (
          <li
            key={e.id}
            style={{
              border: '1px solid #eee',
              borderLeft: `3px solid ${NAVY}`,
              borderRadius: 4,
              padding: '10px 12px',
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong style={{ textTransform: 'capitalize' }}>{e.action.replace('_', ' ')}</strong>
              <span style={{ color: '#888', fontSize: 12 }}>{formatDateNY(e.created_at)}</span>
            </div>
            <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
              by {e.admin_display_name ?? 'admin'}
            </div>
            {Object.keys(e.metadata).length > 0 && (
              <pre
                style={{
                  fontSize: 11,
                  background: '#fafafa',
                  padding: 8,
                  borderRadius: 4,
                  marginTop: 6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                }}
              >
                {JSON.stringify(e.metadata, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ol>
    </ModalShell>
  );
}

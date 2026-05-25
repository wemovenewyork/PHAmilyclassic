'use client';
import { useState } from 'react';

const NAVY = '#0a1a3a';
const GOLD = '#d4a017';

const REASONS = [
  'Lodge Officer',
  'Performer',
  'Sponsor',
  'Vendor',
  'Press',
  'Staff/Volunteer',
  'Honorary Guest',
  'Make-Good (replacement)',
  'Other',
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function IssueCompModal({
  onClose,
  onIssued,
}: {
  onClose: () => void;
  onIssued: (message: string) => void;
}) {
  const [holderName, setHolderName] = useState('');
  const [holderEmail, setHolderEmail] = useState('');
  const [event, setEvent] = useState<'main_event' | 'after_party' | 'combo'>('main_event');
  const [compReason, setCompReason] = useState<string>(REASONS[0]);
  const [compNotes, setCompNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!holderName.trim()) {
      setError('Holder name is required');
      return;
    }
    if (!EMAIL_RE.test(holderEmail.trim())) {
      setError('Enter a valid holder email');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/comp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holder_name: holderName.trim(),
          holder_email: holderEmail.trim(),
          event,
          comp_reason: compReason,
          comp_notes: compNotes.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        email_sent?: boolean;
        email_error?: string | null;
      };
      if (res.status === 401) {
        window.location.assign('/admin/login?redirectTo=/admin');
        return;
      }
      if (!data.ok) {
        setError(data.error || 'Comp issuance failed');
        return;
      }
      const note = data.email_sent
        ? ''
        : data.email_error
        ? ` Email did not send: ${data.email_error}`
        : ' Email was not sent.';
      onIssued(
        `Comp ticket issued to ${holderName.trim()}. Email sent to ${holderEmail.trim()}.${note}`,
      );
    } catch {
      setError('Network error — try again');
    } finally {
      setBusy(false);
    }
  }

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
      <form
        onSubmit={onSubmit}
        style={{
          background: '#fff',
          borderRadius: 10,
          padding: 22,
          maxWidth: 520,
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 18px 40px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 2,
                color: GOLD,
                textTransform: 'uppercase',
              }}
            >
              Admin
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 0' }}>
              Issue Comp Ticket
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'transparent',
              border: 0,
              fontSize: 22,
              cursor: 'pointer',
              color: '#777',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 18, display: 'grid', gap: 14 }}>
          <Field label="Holder name">
            <input
              type="text"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              required
              disabled={busy}
              style={inputStyle}
            />
          </Field>
          <Field label="Holder email">
            <input
              type="email"
              value={holderEmail}
              onChange={(e) => setHolderEmail(e.target.value)}
              required
              disabled={busy}
              style={inputStyle}
            />
          </Field>
          <Field label="Event">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(
                [
                  ['main_event', 'Main Event'],
                  ['after_party', 'After Party'],
                  ['combo', 'Combo (both)'],
                ] as const
              ).map(([val, label]) => (
                <label
                  key={val}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: `1px solid ${event === val ? NAVY : '#ccc'}`,
                    background: event === val ? '#f3f5fb' : '#fff',
                    padding: '8px 14px',
                    borderRadius: 4,
                    cursor: busy ? 'wait' : 'pointer',
                    fontSize: 14,
                  }}
                >
                  <input
                    type="radio"
                    name="event"
                    value={val}
                    checked={event === val}
                    onChange={() => setEvent(val)}
                    disabled={busy}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Comp reason">
            <select
              value={compReason}
              onChange={(e) => setCompReason(e.target.value)}
              disabled={busy}
              style={inputStyle}
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes (optional)">
            <textarea
              value={compNotes}
              onChange={(e) => setCompNotes(e.target.value)}
              disabled={busy}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
        </div>

        {error && (
          <div
            role="alert"
            style={{ color: '#ef4444', fontSize: 14, marginTop: 12 }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 22, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '12px 22px',
              fontSize: 14,
              border: '1px solid #ccc',
              background: '#fff',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            style={{
              padding: '12px 22px',
              fontSize: 14,
              fontWeight: 700,
              background: GOLD,
              color: NAVY,
              border: 0,
              borderRadius: 6,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy ? 'Issuing…' : 'Issue Comp'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          fontSize: 12,
          color: '#555',
          textTransform: 'uppercase',
          letterSpacing: 1,
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <div style={{ marginTop: 6 }}>{children}</div>
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 15,
  border: '1px solid #ccc',
  borderRadius: 4,
  outline: 'none',
  fontFamily: 'inherit',
};

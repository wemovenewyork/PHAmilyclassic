'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import {
  getQueuedAdmits,
  markReconcile,
  newClientScanId,
  queueOfflineAdmit,
  removeQueuedAdmit,
  type QueuedAdmit,
} from '@/lib/scanner-offline';

/**
 * The event-day scanner page.
 *
 * Camera, scan, success / failure overlays, manual lookup, and offline
 * queue + sync, all in one component. Sub-states are visible via the
 * `overlay` value:
 *   - 'idle'    — camera active, scanning
 *   - 'success' — green check overlay (auto-dismiss 2s)
 *   - 'failure' — red X overlay (manual tap)
 *   - 'lookup'  — manual-lookup sheet (modal)
 *   - 'confirm' — confirm-admit dialog inside lookup flow
 */

const NAVY = '#0a1a3a';
const GOLD = '#d4a017';
const SUCCESS_GREEN = '#22c55e';
const ERROR_RED = '#ef4444';

type Event = 'main_event' | 'after_party';

const GATE_LABEL: Record<Event, string> = {
  main_event: 'Main Event',
  after_party: 'After Party',
};

type FailureKind =
  | 'already_used'
  | 'wrong_event'
  | 'refunded'
  | 'voided'
  | 'not_found';

interface SuccessInfo {
  holder_name: string;
  ticket_type: 'team_registration' | 'spectator' | 'after_party' | 'comp';
  event: Event;
  team_slug: string | null;
  age_group: 'adult' | 'youth' | null;
  guardian_name: string | null;
  offline?: boolean;
}

interface FailureInfo {
  kind: FailureKind;
  holder_name?: string;
  detail?: string;
}

interface LookupResult {
  id: string;
  token: string;
  holder_name: string;
  holder_email: string;
  ticket_type: SuccessInfo['ticket_type'];
  event: Event;
  status: 'issued' | 'scanned' | 'voided' | 'refunded';
  shopify_order_number: string | null;
}

function teamSlugToLabel(slug: string | null): string | null {
  if (!slug) return null;
  // Cheap title-case-ish conversion. The exhaustive lookup lives in
  // lib/teams-config but we don't want to pull it client-side for a label
  // when the slug itself is human-readable enough.
  return slug
    .replace(/-/g, ' ')
    .replace(/\b(nj|ny|oes)\b/gi, (m) => m.toUpperCase())
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ticketTypeLabel(t: SuccessInfo): string {
  if (t.ticket_type === 'team_registration') {
    const team = teamSlugToLabel(t.team_slug);
    return team ? `Team Member · ${team}` : 'Team Member';
  }
  if (t.ticket_type === 'after_party') return 'After Party';
  if (t.ticket_type === 'comp') return 'Comp Ticket';
  return 'Spectator';
}

function failureCopy(f: FailureInfo): { title: string; subtitle?: string } {
  switch (f.kind) {
    case 'already_used':
      return {
        title: 'ALREADY SCANNED',
        subtitle: f.detail ?? f.holder_name,
      };
    case 'wrong_event':
      return { title: 'WRONG GATE', subtitle: f.detail ?? f.holder_name };
    case 'refunded':
      return { title: 'TICKET REFUNDED', subtitle: f.holder_name };
    case 'voided':
      return {
        title: 'TICKET VOIDED',
        subtitle: f.detail ?? f.holder_name,
      };
    case 'not_found':
      return { title: 'TICKET NOT FOUND', subtitle: 'Not in our system' };
  }
}

function extractTokenFromQr(decoded: string): string | null {
  // QR encodes the hosted ticket URL — pull the final path segment.
  try {
    const url = new URL(decoded);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'ticket' && parts[1]) return parts[1];
  } catch {
    // Not a URL — maybe the raw token was scanned. Accept if it looks like
    // a 43-ish-char base64url string.
    if (/^[A-Za-z0-9_-]{40,}$/.test(decoded.trim())) return decoded.trim();
  }
  return null;
}

export default function ScannerPageClient({ event }: { event: Event }) {
  const [overlay, setOverlay] = useState<
    'idle' | 'success' | 'failure' | 'lookup' | 'confirm'
  >('idle');
  const [success, setSuccess] = useState<SuccessInfo | null>(null);
  const [failure, setFailure] = useState<FailureInfo | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [reconcileCount, setReconcileCount] = useState(0);
  const [showReconcileList, setShowReconcileList] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastDecodedRef = useRef<string | null>(null);
  const lastDecodedAtRef = useRef<number>(0);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- Online state + offline queue tracking
  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      void drainQueue();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // Initial queue refresh
    void refreshQueueCounts();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshQueueCounts = useCallback(async () => {
    const items = await getQueuedAdmits();
    setQueueCount(items.length);
    setReconcileCount(items.filter((i) => i.reconcile_result).length);
  }, []);

  const drainQueue = useCallback(async () => {
    const items = await getQueuedAdmits();
    for (const item of items) {
      if (item.reconcile_result) continue; // already attempted and failed — leave for review
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: item.token,
            event_at_gate: item.event_at_gate,
            client_scan_id: item.client_scan_id,
          }),
        });
        const data = await res.json().catch(() => null);
        if (data?.result === 'success') {
          await removeQueuedAdmit(item.client_scan_id);
        } else if (
          data?.result === 'already_used' ||
          data?.result === 'wrong_event' ||
          data?.result === 'refunded' ||
          data?.result === 'voided' ||
          data?.result === 'not_found'
        ) {
          await markReconcile(
            item.client_scan_id,
            data.result,
            `Server: ${data.result}`,
          );
        }
      } catch {
        // still offline / transient — try again next reconnect
        return;
      }
    }
    await refreshQueueCounts();
  }, [refreshQueueCounts]);

  // ----- Camera lifecycle
  useEffect(() => {
    if (overlay !== 'idle') {
      return;
    }
    let cancelled = false;
    let instance: Html5Qrcode | null = null;
    let active = false;

    (async () => {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (cancelled) return;
      instance = new Html5Qrcode('reader');
      scannerRef.current = instance;
      try {
        await instance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decoded) => {
            const now = Date.now();
            // Debounce the same value within 2s — html5-qrcode fires
            // multiple times per second while the QR stays in frame.
            if (
              lastDecodedRef.current === decoded &&
              now - lastDecodedAtRef.current < 2000
            ) {
              return;
            }
            lastDecodedRef.current = decoded;
            lastDecodedAtRef.current = now;
            handleDecodedQr(decoded);
          },
          () => {
            // per-frame failure callback — silently ignored (it's normal
            // to fail-to-decode most frames)
          },
        );
        active = true;
      } catch (err) {
        if (cancelled) return;
        // Camera not available / permission denied — surface as a failure
        // overlay with manual-lookup as the recovery path.
        setFailure({
          kind: 'not_found',
          detail:
            err instanceof Error && err.message
              ? `Camera: ${err.message}`
              : 'Camera unavailable. Use Lookup.',
        });
        setOverlay('failure');
      }
    })();

    return () => {
      cancelled = true;
      if (instance && active) {
        instance.stop().catch(() => {});
      }
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay]);

  // ----- Scan handler (QR path)
  async function handleDecodedQr(decoded: string) {
    const token = extractTokenFromQr(decoded);
    if (!token) {
      setFailure({ kind: 'not_found' });
      setOverlay('failure');
      return;
    }

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, event_at_gate: event }),
      });
      const data = await res.json();
      handleAdmitResponse(data, /* offline */ false);
    } catch {
      // Network failure → optimistic-offline admit
      const csid = newClientScanId();
      await queueOfflineAdmit({
        client_scan_id: csid,
        token,
        event_at_gate: event,
        attempted_at: Date.now(),
        holder_name_if_known: null,
      });
      void refreshQueueCounts();
      setSuccess({
        holder_name: 'Holder (offline)',
        ticket_type: event === 'after_party' ? 'after_party' : 'spectator',
        event,
        team_slug: null,
        age_group: null,
        guardian_name: null,
        offline: true,
      });
      setOverlay('success');
      window.setTimeout(() => {
        setOverlay('idle');
        setSuccess(null);
      }, 2000);
      setScanCount((c) => c + 1);
    }
  }

  function handleAdmitResponse(data: unknown, offline: boolean) {
    const d = (data ?? {}) as { result?: string; ticket?: Record<string, unknown> };
    if (d.result === 'success' && d.ticket) {
      setSuccess({
        holder_name: String(d.ticket.holder_name ?? ''),
        ticket_type: (d.ticket.ticket_type as SuccessInfo['ticket_type']) ?? 'spectator',
        event: (d.ticket.event as Event) ?? event,
        team_slug: (d.ticket.team_slug as string | null) ?? null,
        age_group: (d.ticket.age_group as SuccessInfo['age_group']) ?? null,
        guardian_name: (d.ticket.guardian_name as string | null) ?? null,
        offline,
      });
      setOverlay('success');
      setScanCount((c) => c + 1);
      window.setTimeout(() => {
        setOverlay('idle');
        setSuccess(null);
      }, 2000);
      return;
    }
    // Failure paths
    if (
      d.result === 'already_used' ||
      d.result === 'wrong_event' ||
      d.result === 'refunded' ||
      d.result === 'voided' ||
      d.result === 'not_found'
    ) {
      const holder =
        d.ticket && typeof d.ticket.holder_name === 'string'
          ? (d.ticket.holder_name as string)
          : undefined;
      let detail: string | undefined;
      if (d.result === 'already_used' && d.ticket?.scanned_at) {
        const when = new Date(String(d.ticket.scanned_at)).toLocaleString();
        detail = `Scanned at ${when}${holder ? ` · ${holder}` : ''}`;
      } else if (d.result === 'wrong_event' && d.ticket?.event) {
        const other = d.ticket.event === 'after_party' ? 'After Party' : 'Main Event';
        detail = `This is a ${other} ticket — try the other gate${holder ? ` · ${holder}` : ''}`;
      } else if (d.result === 'voided' && d.ticket?.voided_reason) {
        detail = String(d.ticket.voided_reason);
      }
      setFailure({ kind: d.result as FailureKind, holder_name: holder, detail });
      setOverlay('failure');
      return;
    }
    setFailure({ kind: 'not_found' });
    setOverlay('failure');
  }

  function onDismissFailure() {
    setFailure(null);
    setOverlay('idle');
  }

  // ----- Manual lookup
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<LookupResult | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  function openLookup() {
    setLookupQuery('');
    setLookupResults([]);
    setOverlay('lookup');
  }
  function closeLookup() {
    setOverlay('idle');
    setLookupQuery('');
    setLookupResults([]);
  }
  function onLookupChange(q: string) {
    setLookupQuery(q);
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    if (q.trim().length < 2) {
      setLookupResults([]);
      return;
    }
    lookupTimerRef.current = setTimeout(async () => {
      setLookupBusy(true);
      try {
        const res = await fetch(
          `/api/scan/lookup?q=${encodeURIComponent(q.trim())}`,
        );
        const data = await res.json().catch(() => ({ results: [] }));
        setLookupResults((data.results ?? []) as LookupResult[]);
      } catch {
        setLookupResults([]);
      } finally {
        setLookupBusy(false);
      }
    }, 250);
  }
  async function confirmManualAdmit() {
    if (!pendingConfirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      const res = await fetch('/api/scan/manual-admit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: pendingConfirm.token,
          event_at_gate: event,
        }),
      });
      const data = await res.json();
      setPendingConfirm(null);
      setOverlay('idle');
      handleAdmitResponse(data, false);
    } catch {
      setPendingConfirm(null);
      setOverlay('idle');
      setFailure({ kind: 'not_found', detail: 'Network error during admit' });
      setOverlay('failure');
    } finally {
      setConfirmBusy(false);
    }
  }

  const successLabel = success ? ticketTypeLabel(success) : '';
  const isYouth = success?.age_group === 'youth';
  const failureUi = failure ? failureCopy(failure) : null;

  const onlineIndicator = useMemo(() => {
    if (!online) return { color: ERROR_RED, label: `OFFLINE — ${queueCount} queued` };
    if (queueCount > 0) return { color: GOLD, label: `Syncing ${queueCount}…` };
    return { color: SUCCESS_GREEN, label: 'Online' };
  }, [online, queueCount]);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: NAVY,
        color: '#fff',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      {/* Top bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: NAVY,
          padding: '12px 14px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: GOLD, textTransform: 'uppercase' }}>
              Gate
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>
              {GATE_LABEL[event]}
            </div>
          </div>
          <button
            type="button"
            onClick={openLookup}
            style={{
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              padding: '14px 18px',
              fontSize: 16,
              fontWeight: 700,
              minHeight: 56,
              cursor: 'pointer',
            }}
          >
            Lookup
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
            fontSize: 12,
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          <span>{scanCount} scanned this session</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: onlineIndicator.color,
                display: 'inline-block',
              }}
            />
            {onlineIndicator.label}
          </span>
        </div>
        {reconcileCount > 0 && (
          <button
            onClick={() => setShowReconcileList((v) => !v)}
            style={{
              marginTop: 8,
              width: '100%',
              background: 'rgba(239,68,68,0.18)',
              border: `1px solid ${ERROR_RED}`,
              color: '#fff',
              padding: '10px 12px',
              borderRadius: 6,
              fontSize: 13,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            {reconcileCount} offline admit{reconcileCount > 1 ? 's' : ''} need{reconcileCount === 1 ? 's' : ''} review — tap to {showReconcileList ? 'hide' : 'see'}
          </button>
        )}
      </header>

      {/* Reconcile list */}
      {showReconcileList && (
        <ReconcileList
          onChange={refreshQueueCounts}
          onClose={() => setShowReconcileList(false)}
        />
      )}

      {/* Camera viewfinder */}
      <div
        id="reader"
        style={{
          width: '100%',
          maxWidth: 480,
          margin: '0 auto',
          aspectRatio: '1 / 1',
          background: '#000',
        }}
      />

      <p
        style={{
          textAlign: 'center',
          color: 'rgba(255,255,255,0.55)',
          fontSize: 13,
          padding: '10px 16px',
        }}
      >
        Allow camera access to scan tickets. Hold the QR steady in the frame.
      </p>

      {/* SUCCESS overlay */}
      {overlay === 'success' && success && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: NAVY,
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 10,
          }}
        >
          <CheckIcon color={SUCCESS_GREEN} />
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              textAlign: 'center',
              marginTop: 18,
              lineHeight: 1.2,
            }}
          >
            {success.holder_name}
          </div>
          <div
            style={{
              fontSize: 15,
              color: GOLD,
              marginTop: 8,
              letterSpacing: 1,
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            {successLabel}
          </div>
          {isYouth && (
            <div
              style={{
                marginTop: 18,
                background: ERROR_RED,
                color: '#fff',
                padding: '10px 18px',
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: 2,
              }}
            >
              VERIFY GUARDIAN
              {success.guardian_name ? ` · ${success.guardian_name}` : ''}
            </div>
          )}
          {success.offline && (
            <div
              style={{
                marginTop: 14,
                fontSize: 12,
                color: 'rgba(255,255,255,0.65)',
              }}
            >
              OFFLINE — queued for sync
            </div>
          )}
        </div>
      )}

      {/* FAILURE overlay */}
      {overlay === 'failure' && failureUi && (
        <button
          onClick={onDismissFailure}
          style={{
            position: 'fixed',
            inset: 0,
            background: NAVY,
            color: '#fff',
            border: 0,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 10,
            textAlign: 'center',
            fontFamily: 'inherit',
          }}
        >
          <XIcon color={ERROR_RED} />
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              marginTop: 18,
              letterSpacing: 2,
            }}
          >
            {failureUi.title}
          </div>
          {failureUi.subtitle && (
            <div
              style={{
                fontSize: 15,
                color: 'rgba(255,255,255,0.7)',
                marginTop: 8,
                maxWidth: 320,
              }}
            >
              {failureUi.subtitle}
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              bottom: 28,
              fontSize: 13,
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            Tap anywhere to dismiss
          </div>
        </button>
      )}

      {/* LOOKUP sheet */}
      {(overlay === 'lookup' || overlay === 'confirm') && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 12,
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <div
            style={{
              background: '#fff',
              color: '#1a1a1a',
              width: '100%',
              maxHeight: '88vh',
              overflowY: 'auto',
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: GOLD, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                Manual Lookup
              </div>
              <button
                onClick={closeLookup}
                style={{
                  border: 0,
                  background: 'transparent',
                  fontSize: 22,
                  cursor: 'pointer',
                  color: '#777',
                  padding: '4px 8px',
                }}
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              placeholder="Name, email, or order #"
              value={lookupQuery}
              onChange={(e) => onLookupChange(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                marginTop: 12,
                padding: '14px 12px',
                fontSize: 17,
                borderRadius: 6,
                border: '1px solid #ccc',
                outline: 'none',
                color: '#1a1a1a',
              }}
            />
            <div style={{ marginTop: 12, minHeight: 60 }}>
              {lookupBusy && <div style={{ color: '#777', fontSize: 13 }}>Searching…</div>}
              {!lookupBusy && lookupResults.length === 0 && lookupQuery.trim().length >= 2 && (
                <div style={{ color: '#777', fontSize: 13 }}>No matches.</div>
              )}
              {lookupResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setPendingConfirm(r);
                    setOverlay('confirm');
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: '#f6f6f6',
                    border: '1px solid #eee',
                    borderRadius: 6,
                    padding: '12px 14px',
                    marginBottom: 8,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.holder_name}</div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                    {r.holder_email} · {r.shopify_order_number ?? '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>
                    {r.ticket_type === 'team_registration'
                      ? 'Team Member'
                      : r.ticket_type === 'after_party'
                      ? 'After Party'
                      : r.ticket_type === 'comp'
                      ? 'Comp'
                      : 'Spectator'}
                    {' · '}
                    {r.event === 'after_party' ? 'After Party' : 'Main Event'}
                    {' · '}
                    <span
                      style={{
                        color:
                          r.status === 'issued'
                            ? SUCCESS_GREEN
                            : r.status === 'scanned'
                            ? '#ea580c'
                            : ERROR_RED,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {r.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Confirm dialog */}
            {overlay === 'confirm' && pendingConfirm && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 20,
                  zIndex: 20,
                }}
              >
                <div
                  style={{
                    background: '#fff',
                    color: '#1a1a1a',
                    padding: 20,
                    borderRadius: 10,
                    width: '100%',
                    maxWidth: 360,
                  }}
                >
                  <h2 style={{ fontSize: 19, marginTop: 0 }}>Admit this ticket?</h2>
                  <p style={{ fontSize: 14, color: '#444', lineHeight: 1.5 }}>
                    <strong>{pendingConfirm.holder_name}</strong>
                    <br />
                    {pendingConfirm.ticket_type === 'team_registration'
                      ? 'Team Member'
                      : pendingConfirm.ticket_type === 'after_party'
                      ? 'After Party'
                      : pendingConfirm.ticket_type === 'comp'
                      ? 'Comp'
                      : 'Spectator'}
                    {' · '}
                    {pendingConfirm.event === 'after_party' ? 'After Party' : 'Main Event'}
                  </p>
                  <p style={{ fontSize: 13, color: '#777', marginTop: 12 }}>
                    This will burn the QR — the ticket can&apos;t be re-admitted.
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                    <button
                      onClick={() => {
                        setPendingConfirm(null);
                        setOverlay('lookup');
                      }}
                      disabled={confirmBusy}
                      style={{
                        flex: 1,
                        padding: '14px',
                        fontSize: 15,
                        border: '1px solid #ccc',
                        background: '#fff',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmManualAdmit}
                      disabled={confirmBusy}
                      style={{
                        flex: 1,
                        padding: '14px',
                        fontSize: 15,
                        background: ERROR_RED,
                        color: '#fff',
                        border: 0,
                        borderRadius: 6,
                        fontWeight: 700,
                        cursor: confirmBusy ? 'wait' : 'pointer',
                      }}
                    >
                      {confirmBusy ? 'Admitting…' : 'Admit'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function ReconcileList({
  onChange,
  onClose,
}: {
  onChange: () => Promise<void>;
  onClose: () => void;
}) {
  const [items, setItems] = useState<QueuedAdmit[]>([]);
  useEffect(() => {
    void (async () => {
      const all = await getQueuedAdmits();
      setItems(all.filter((i) => i.reconcile_result));
    })();
  }, []);
  if (items.length === 0) {
    return null;
  }
  return (
    <div
      style={{
        background: 'rgba(239,68,68,0.08)',
        borderBottom: `1px solid ${ERROR_RED}`,
        padding: 12,
      }}
    >
      {items.map((it) => (
        <div
          key={it.client_scan_id}
          style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 6,
            padding: 10,
            marginBottom: 8,
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 700 }}>
            {it.holder_name_if_known ?? 'Unknown holder'} · {it.reconcile_result}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
            Token …{it.token.slice(-8)} · {new Date(it.attempted_at).toLocaleString()}
          </div>
          <button
            onClick={async () => {
              await removeQueuedAdmit(it.client_scan_id);
              await onChange();
              setItems((arr) => arr.filter((x) => x.client_scan_id !== it.client_scan_id));
            }}
            style={{
              marginTop: 8,
              fontSize: 12,
              padding: '6px 12px',
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'transparent',
              color: '#fff',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      ))}
      <button
        onClick={onClose}
        style={{
          fontSize: 12,
          padding: '6px 12px',
          border: 0,
          background: 'transparent',
          color: 'rgba(255,255,255,0.6)',
          cursor: 'pointer',
        }}
      >
        Hide
      </button>
    </div>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="96" height="96" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={color} />
      <path
        d="M8 12.5l2.5 2.5L16 9"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon({ color }: { color: string }) {
  return (
    <svg width="96" height="96" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={color} />
      <path
        d="M9 9l6 6M15 9l-6 6"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

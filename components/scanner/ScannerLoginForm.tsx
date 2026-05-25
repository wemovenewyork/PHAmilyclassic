'use client';
import { useState } from 'react';

const NAVY = '#0a1a3a';
const GOLD = '#d4a017';
const ERROR_RED = '#ef4444';

export default function ScannerLoginForm({
  redirectTo,
}: {
  redirectTo: string;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/scanner-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Hard navigation so the new cookie is sent on subsequent requests.
        window.location.assign(redirectTo);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(
        (data && data.error) ||
          (res.status === 429
            ? 'Too many attempts. Wait a few minutes.'
            : 'Invalid password'),
      );
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: NAVY,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      <div style={{ width: '100%', maxWidth: 360 }}>
        <header style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: 3,
              color: GOLD,
              textTransform: 'uppercase',
            }}
          >
            PHAmily Classic
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
            Scanner Login
          </h1>
        </header>

        <form onSubmit={onSubmit}>
          <label
            htmlFor="scanner-password"
            style={{
              display: 'block',
              fontSize: 13,
              color: 'rgba(255,255,255,0.7)',
              marginBottom: 8,
            }}
          >
            Password
          </label>
          <input
            id="scanner-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            style={{
              width: '100%',
              padding: '16px 14px',
              fontSize: 18,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              outline: 'none',
            }}
          />
          {error && (
            <div
              role="alert"
              style={{
                color: ERROR_RED,
                fontSize: 14,
                marginTop: 10,
              }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || password.length === 0}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 18,
              padding: '16px 22px',
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              borderRadius: 6,
              border: 0,
              background: GOLD,
              color: NAVY,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy || !password ? 0.6 : 1,
            }}
          >
            {busy ? 'Checking…' : 'Unlock Scanner'}
          </button>
        </form>
      </div>
    </main>
  );
}

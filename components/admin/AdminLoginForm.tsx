'use client';
import { useState } from 'react';

const NAVY = '#0a1a3a';
const GOLD = '#d4a017';
const ERROR_RED = '#ef4444';

export default function AdminLoginForm({ redirectTo }: { redirectTo: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        window.location.assign(redirectTo);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || 'Invalid email or password');
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
        padding: '32px 16px',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
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
            Admin
          </h1>
        </header>

        <form onSubmit={onSubmit}>
          <label
            htmlFor="admin-email"
            style={{
              display: 'block',
              fontSize: 13,
              color: 'rgba(255,255,255,0.7)',
              marginBottom: 6,
            }}
          >
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            autoFocus
            style={inputStyle}
          />

          <label
            htmlFor="admin-password"
            style={{
              display: 'block',
              fontSize: 13,
              color: 'rgba(255,255,255,0.7)',
              marginTop: 14,
              marginBottom: 6,
            }}
          >
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            style={inputStyle}
          />

          {error && (
            <div
              role="alert"
              style={{
                color: ERROR_RED,
                fontSize: 14,
                marginTop: 12,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !email || !password}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 18,
              padding: '14px 22px',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              borderRadius: 6,
              border: 0,
              background: GOLD,
              color: NAVY,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy || !email || !password ? 0.6 : 1,
            }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 16,
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  outline: 'none',
};

'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  JERSEY_SIZES,
  SHORTS_SIZES,
  EVENT,
  type Team,
} from '@/lib/teams-config';
import { registrationFormSchema } from '@/lib/registration-schema';

interface TeamWithCount extends Team {
  confirmedCount: number;
  spotsRemaining: number;
  isFull: boolean;
}

type Step = 'team' | 'details' | 'sizes' | 'confirm';

interface FormState {
  team_slug: string;
  full_name: string;
  email: string;
  phone: string;
  jersey_size: string;
  shorts_size: string;
  guardian_name: string;
  guardian_phone: string;
  guardian_email: string;
  refund_acknowledged: boolean;
  sizes_acknowledged: boolean;
}

const initialForm: FormState = {
  team_slug: '',
  full_name: '',
  email: '',
  phone: '',
  jersey_size: '',
  shorts_size: '',
  guardian_name: '',
  guardian_phone: '',
  guardian_email: '',
  refund_acknowledged: false,
  sizes_acknowledged: false,
};

// ============================================================================
// Shared styling primitives — keeps the JSX below readable
// ============================================================================

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  color: 'var(--white)',
  fontSize: '1rem',
  outline: 'none',
  transition: 'border-color 0.2s',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-barlow-condensed)',
  fontSize: '0.8rem',
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'var(--gray)',
  marginBottom: 8,
};

const errorStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#ff7a85',
  marginTop: 6,
  fontFamily: 'var(--font-barlow)',
};

const primaryButton: React.CSSProperties = {
  background: 'var(--red)',
  color: 'var(--white)',
  padding: '16px 32px',
  fontFamily: 'var(--font-oswald)',
  fontWeight: 600,
  fontSize: '1rem',
  letterSpacing: 2,
  textTransform: 'uppercase',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  transition: 'background 0.3s, transform 0.2s',
};

const secondaryButton: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--light-gray)',
  padding: '16px 28px',
  fontFamily: 'var(--font-oswald)',
  fontWeight: 600,
  fontSize: '0.95rem',
  letterSpacing: 2,
  textTransform: 'uppercase',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 4,
  cursor: 'pointer',
};

// ============================================================================
// The form
// ============================================================================

export default function RegistrationForm({ teams }: { teams: TeamWithCount[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('team');
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.slug === form.team_slug),
    [teams, form.team_slug]
  );

  const isYouth = selectedTeam?.ageGroup === 'youth';
  const jerseySizes = isYouth ? JERSEY_SIZES.youth : JERSEY_SIZES.adult;
  const shortsSizes = isYouth ? SHORTS_SIZES.youth : SHORTS_SIZES.adult;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }

  function pickTeam(slug: string) {
    const team = teams.find((t) => t.slug === slug);
    if (!team || team.isFull) return;
    // Reset sizes when team changes (adult vs youth options differ)
    setForm((f) => ({
      ...f,
      team_slug: slug,
      jersey_size: '',
      shorts_size: '',
      // Wipe guardian fields if switching to adult; clear youth req if going youth
      guardian_name: team.ageGroup === 'youth' ? f.guardian_name : '',
      guardian_phone: team.ageGroup === 'youth' ? f.guardian_phone : '',
      guardian_email: team.ageGroup === 'youth' ? f.guardian_email : '',
    }));
    setStep('details');
    // Smooth scroll to the form
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  function validateDetailsStep(): boolean {
    const e: Record<string, string> = {};
    if (form.full_name.trim().length < 2) e.full_name = 'Enter your full name';
    if (!form.email.includes('@')) e.email = 'Enter a valid email';
    if (form.phone.trim().length < 7) e.phone = 'Enter a phone number';
    if (isYouth) {
      if (!form.guardian_name.trim()) e.guardian_name = "Guardian's name is required";
      if (!form.guardian_phone.trim()) e.guardian_phone = "Guardian's phone is required";
      if (!form.guardian_email.includes('@'))
        e.guardian_email = "Guardian's email is required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateSizesStep(): boolean {
    const e: Record<string, string> = {};
    if (!form.jersey_size) e.jersey_size = 'Pick a jersey size';
    if (!form.shorts_size) e.shorts_size = 'Pick a shorts size';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleFinalSubmit() {
    setServerError(null);

    // Final client-side validation through zod
    const parsed = registrationFormSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? '_';
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      // Bounce back to whichever step has the error
      if (
        fieldErrors.full_name ||
        fieldErrors.email ||
        fieldErrors.phone ||
        fieldErrors.guardian_name ||
        fieldErrors.guardian_phone ||
        fieldErrors.guardian_email
      ) {
        setStep('details');
      } else if (fieldErrors.jersey_size || fieldErrors.shorts_size) {
        setStep('sizes');
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body?.error === 'team-full') {
          setServerError(
            'That team just filled up while you were registering. Pick another team.'
          );
          setStep('team');
          // Refresh to get fresh counts
          router.refresh();
          return;
        }
        setServerError(body?.error ?? 'Something went wrong. Please try again.');
        return;
      }
      // Normal path: checkoutUrl is set by /api/register after Shopify
      // cart creation succeeds. Buyer redirects to Shopify-hosted checkout.
      // Pending fallback only fires on the (unlikely) case where the API
      // returned ok but somehow without a URL.
      if (body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
      } else {
        router.push(`/register/pending?id=${body.registrationId}`);
      }
    } catch (err) {
      console.error('[register] submit failed', err);
      setServerError('Network error. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ==========================================================================
  // STEP: Team picker
  // ==========================================================================
  if (step === 'team') {
    return (
      <section aria-label="Team selection">
        <h2
          className="display"
          style={{ fontSize: '1.4rem', marginBottom: 8, color: 'var(--gold)' }}
        >
          Step 1 of 4 — Pick Your Team
        </h2>
        <p
          style={{
            color: 'var(--gray)',
            marginBottom: 24,
            fontSize: '0.95rem',
          }}
        >
          Each team caps at 15 players. Once a team fills, registration for it closes.
        </p>

        {serverError && (
          <div
            role="alert"
            style={{
              padding: '12px 16px',
              background: 'rgba(196,30,42,0.15)',
              border: '1px solid rgba(196,30,42,0.4)',
              borderRadius: 6,
              color: '#ff7a85',
              marginBottom: 20,
              fontSize: '0.9rem',
            }}
          >
            {serverError}
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {teams.map((t) => (
            <button
              key={t.slug}
              type="button"
              disabled={t.isFull}
              onClick={() => pickTeam(t.slug)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                gap: 16,
                padding: '18px 20px',
                background: t.isFull
                  ? 'rgba(255,255,255,0.02)'
                  : 'rgba(255,255,255,0.04)',
                border: t.isFull
                  ? '1px solid rgba(255,255,255,0.05)'
                  : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                color: t.isFull ? 'rgba(255,255,255,0.4)' : 'var(--white)',
                cursor: t.isFull ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.2s, transform 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!t.isFull) e.currentTarget.style.borderColor = 'var(--gold)';
              }}
              onMouseLeave={(e) => {
                if (!t.isFull)
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
              }}
              aria-label={`${t.name}, ${
                t.isFull
                  ? 'team full'
                  : t.spotsRemaining <= 2
                  ? 'almost full'
                  : t.spotsRemaining <= 5
                  ? 'filling up'
                  : 'spots available'
              }`}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-oswald)',
                    fontWeight: 600,
                    fontSize: '1.05rem',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 4,
                  }}
                >
                  {t.name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-barlow-condensed)',
                    fontSize: '0.78rem',
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    color: t.region === 'NY' ? '#7fb3ff' : '#ff7a85',
                  }}
                >
                  {t.ageGroup === 'youth' ? 'Youth (ages 9–20)' : 'Adult'} ·{' '}
                  {t.region} {t.sport === 'knights-of-pythagoras' ? 'Youth Games' : t.sport}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {t.isFull ? (
                  <span
                    style={{
                      fontFamily: 'var(--font-oswald)',
                      fontSize: '0.85rem',
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      color: 'var(--gray)',
                    }}
                  >
                    Full
                  </span>
                ) : (
                  (() => {
                    const status =
                      t.spotsRemaining <= 2
                        ? { label: 'Almost Full', color: '#ff7a85' }
                        : t.spotsRemaining <= 5
                        ? { label: 'Filling Up', color: 'var(--gold)' }
                        : { label: 'Spots Available', color: 'var(--gold)' };
                    return (
                      <span
                        style={{
                          fontFamily: 'var(--font-oswald)',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          letterSpacing: 2,
                          textTransform: 'uppercase',
                          color: status.color,
                        }}
                      >
                        {status.label}
                      </span>
                    );
                  })()
                )}
              </div>
            </button>
          ))}
        </div>
      </section>
    );
  }

  // ==========================================================================
  // STEP: Player details (with branching guardian fields)
  // ==========================================================================
  if (step === 'details' && selectedTeam) {
    return (
      <section aria-label="Player details">
        <p
          style={{
            fontFamily: 'var(--font-barlow-condensed)',
            fontSize: '0.8rem',
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'var(--gold)',
            marginBottom: 8,
          }}
        >
          Registering for: {selectedTeam.name}
        </p>
        <h2
          className="display"
          style={{ fontSize: '1.4rem', marginBottom: 8, color: 'var(--gold)' }}
        >
          Step 2 of 4 — {isYouth ? 'Player & Guardian' : 'Your Details'}
        </h2>

        <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
          <div>
            <label style={labelStyle} htmlFor="full_name">
              {isYouth ? "Player's Full Name" : 'Full Name'}
            </label>
            <input
              id="full_name"
              type="text"
              autoComplete="name"
              value={form.full_name}
              onChange={(e) => update('full_name', e.target.value)}
              style={inputStyle}
              placeholder={isYouth ? 'Joseph Pannetta Jr.' : 'Joseph Pannetta'}
            />
            {errors.full_name && <div style={errorStyle}>{errors.full_name}</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle} htmlFor="email">
                {isYouth ? "Player's Email (optional)" : 'Email'}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                style={inputStyle}
                placeholder="you@email.com"
              />
              {errors.email && <div style={errorStyle}>{errors.email}</div>}
            </div>
            <div>
              <label style={labelStyle} htmlFor="phone">
                {isYouth ? "Player's Phone (optional)" : 'Phone'}
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                style={inputStyle}
                placeholder="(555) 123-4567"
              />
              {errors.phone && <div style={errorStyle}>{errors.phone}</div>}
            </div>
          </div>

          {isYouth && (
            <div
              style={{
                marginTop: 12,
                padding: 20,
                border: '1px solid rgba(245,197,24,0.25)',
                borderRadius: 8,
                background: 'rgba(245,197,24,0.04)',
                display: 'grid',
                gap: 16,
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-oswald)',
                  fontSize: '0.95rem',
                  textTransform: 'uppercase',
                  letterSpacing: 1.5,
                  color: 'var(--gold)',
                }}
              >
                Parent / Guardian Information
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--gray)', lineHeight: 1.6 }}>
                Required for Youth Games (youth) registrations. The
                guardian must be present for uniform pickup with valid ID.
              </p>

              <div>
                <label style={labelStyle} htmlFor="guardian_name">
                  Guardian&apos;s Full Name
                </label>
                <input
                  id="guardian_name"
                  type="text"
                  value={form.guardian_name}
                  onChange={(e) => update('guardian_name', e.target.value)}
                  style={inputStyle}
                />
                {errors.guardian_name && (
                  <div style={errorStyle}>{errors.guardian_name}</div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle} htmlFor="guardian_phone">
                    Guardian&apos;s Phone
                  </label>
                  <input
                    id="guardian_phone"
                    type="tel"
                    value={form.guardian_phone}
                    onChange={(e) => update('guardian_phone', e.target.value)}
                    style={inputStyle}
                  />
                  {errors.guardian_phone && (
                    <div style={errorStyle}>{errors.guardian_phone}</div>
                  )}
                </div>
                <div>
                  <label style={labelStyle} htmlFor="guardian_email">
                    Guardian&apos;s Email
                  </label>
                  <input
                    id="guardian_email"
                    type="email"
                    value={form.guardian_email}
                    onChange={(e) => update('guardian_email', e.target.value)}
                    style={inputStyle}
                  />
                  {errors.guardian_email && (
                    <div style={errorStyle}>{errors.guardian_email}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 32,
            justifyContent: 'space-between',
          }}
        >
          <button type="button" onClick={() => setStep('team')} style={secondaryButton}>
            ← Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (validateDetailsStep()) setStep('sizes');
            }}
            style={primaryButton}
          >
            Next → Sizes
          </button>
        </div>
      </section>
    );
  }

  // ==========================================================================
  // STEP: Size selection
  // ==========================================================================
  if (step === 'sizes' && selectedTeam) {
    return (
      <section aria-label="Size selection">
        <p
          style={{
            fontFamily: 'var(--font-barlow-condensed)',
            fontSize: '0.8rem',
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: 'var(--gold)',
            marginBottom: 8,
          }}
        >
          Registering for: {selectedTeam.name}
        </p>
        <h2
          className="display"
          style={{ fontSize: '1.4rem', marginBottom: 8, color: 'var(--gold)' }}
        >
          Step 3 of 4 — Uniform Sizes
        </h2>
        <p style={{ color: 'var(--gray)', marginBottom: 24, fontSize: '0.95rem' }}>
          Jersey and shorts sized independently. Sizes can&apos;t be changed after payment.
        </p>

        <div style={{ display: 'grid', gap: 24 }}>
          <div>
            <label style={labelStyle}>Jersey Size</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                gap: 8,
              }}
            >
              {jerseySizes.map((s) => (
                <SizeButton
                  key={`j-${s}`}
                  size={s}
                  selected={form.jersey_size === s}
                  onClick={() => update('jersey_size', s)}
                />
              ))}
            </div>
            {errors.jersey_size && <div style={errorStyle}>{errors.jersey_size}</div>}
          </div>

          <div>
            <label style={labelStyle}>Shorts Size</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                gap: 8,
              }}
            >
              {shortsSizes.map((s) => (
                <SizeButton
                  key={`s-${s}`}
                  size={s}
                  selected={form.shorts_size === s}
                  onClick={() => update('shorts_size', s)}
                />
              ))}
            </div>
            {errors.shorts_size && <div style={errorStyle}>{errors.shorts_size}</div>}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 32,
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            onClick={() => setStep('details')}
            style={secondaryButton}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (validateSizesStep()) setStep('confirm');
            }}
            style={primaryButton}
          >
            Review →
          </button>
        </div>
      </section>
    );
  }

  // ==========================================================================
  // STEP: Confirm + acknowledgments
  // ==========================================================================
  if (step === 'confirm' && selectedTeam) {
    return (
      <section aria-label="Review and confirm">
        <h2
          className="display"
          style={{ fontSize: '1.4rem', marginBottom: 8, color: 'var(--gold)' }}
        >
          Step 4 of 4 — Review &amp; Pay
        </h2>
        <p style={{ color: 'var(--gray)', marginBottom: 24, fontSize: '0.95rem' }}>
          Double-check everything. Sizes are final once you pay.
        </p>

        <dl
          style={{
            display: 'grid',
            gap: 14,
            padding: 24,
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
            marginBottom: 24,
          }}
        >
          <Row label="Team" value={selectedTeam.name} />
          <Row label={isYouth ? "Player's name" : 'Name'} value={form.full_name} />
          <Row label="Email" value={form.email} />
          <Row label="Phone" value={form.phone} />
          {isYouth && (
            <>
              <Row label="Guardian's name" value={form.guardian_name} />
              <Row label="Guardian's phone" value={form.guardian_phone} />
              <Row label="Guardian's email" value={form.guardian_email} />
            </>
          )}
          <Row label="Jersey size" value={form.jersey_size} />
          <Row label="Shorts size" value={form.shorts_size} />
          <Row label="Total" value={`$${EVENT.registrationFee}.00`} accent />
        </dl>

        <div
          style={{
            padding: 20,
            border: '1px solid rgba(196,30,42,0.35)',
            borderRadius: 8,
            background: 'rgba(196,30,42,0.06)',
            marginBottom: 24,
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              cursor: 'pointer',
              marginBottom: 14,
            }}
          >
            <input
              type="checkbox"
              checked={form.sizes_acknowledged}
              onChange={(e) => update('sizes_acknowledged', e.target.checked)}
              style={{ marginTop: 4, width: 18, height: 18, accentColor: 'var(--gold)' }}
            />
            <span style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--light-gray)' }}>
              I confirm my jersey size <strong>{form.jersey_size}</strong> and shorts
              size <strong>{form.shorts_size}</strong> are correct. Sizes cannot be
              changed after payment.
            </span>
          </label>
          {errors.sizes_acknowledged && (
            <div style={errorStyle}>{errors.sizes_acknowledged}</div>
          )}

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={form.refund_acknowledged}
              onChange={(e) => update('refund_acknowledged', e.target.checked)}
              style={{ marginTop: 4, width: 18, height: 18, accentColor: 'var(--gold)' }}
            />
            <span style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--light-gray)' }}>
              I understand <strong>all registration sales are final</strong>. No
              refunds, exchanges, or transfers will be issued for any reason,
              including injury, schedule conflict, or inability to attend.
            </span>
          </label>
          {errors.refund_acknowledged && (
            <div style={errorStyle}>{errors.refund_acknowledged}</div>
          )}
        </div>

        <div
          style={{
            padding: '14px 18px',
            background: 'rgba(245,197,24,0.08)',
            border: '1px solid rgba(245,197,24,0.25)',
            borderRadius: 6,
            marginBottom: 24,
            fontSize: '0.9rem',
            color: 'var(--light-gray)',
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: 'var(--gold)' }}>Uniform Pickup:</strong> Your
          jersey and shorts will be available for pickup{' '}
          <strong>1 hour prior to the start of the event</strong> at{' '}
          {EVENT.venue} on {EVENT.date}. Bring valid ID.
        </div>

        {serverError && (
          <div
            role="alert"
            style={{
              padding: '12px 16px',
              background: 'rgba(196,30,42,0.15)',
              border: '1px solid rgba(196,30,42,0.4)',
              borderRadius: 6,
              color: '#ff7a85',
              marginBottom: 20,
              fontSize: '0.9rem',
            }}
          >
            {serverError}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => setStep('sizes')}
            style={secondaryButton}
            disabled={submitting}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleFinalSubmit}
            disabled={submitting}
            style={{
              ...primaryButton,
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? 'wait' : 'pointer',
              background: submitting ? 'var(--dark-red)' : 'var(--red)',
            }}
          >
            {submitting ? 'Processing…' : `Continue to Payment — $${EVENT.registrationFee}`}
          </button>
        </div>
      </section>
    );
  }

  return null;
}

// ============================================================================
// Helpers
// ============================================================================

function SizeButton({
  size,
  selected,
  onClick,
}: {
  size: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        padding: '14px 8px',
        background: selected ? 'var(--gold)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${selected ? 'var(--gold)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 6,
        color: selected ? 'var(--navy)' : 'var(--white)',
        fontFamily: 'var(--font-oswald)',
        fontWeight: 700,
        fontSize: '1rem',
        letterSpacing: 1,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {size}
    </button>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
      <dt style={labelStyle}>{label}</dt>
      <dd
        style={{
          fontSize: accent ? '1.2rem' : '1rem',
          color: accent ? 'var(--gold)' : 'var(--white)',
          fontFamily: accent ? 'var(--font-oswald)' : 'inherit',
          fontWeight: accent ? 700 : 500,
        }}
      >
        {value || <span style={{ color: 'var(--gray)' }}>—</span>}
      </dd>
    </div>
  );
}

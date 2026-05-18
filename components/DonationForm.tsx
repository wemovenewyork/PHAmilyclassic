'use client';

import { useState } from 'react';
import { donationSchema } from '@/lib/donations-schema';
import {
  DONATION_TIERS,
  CUSTOM_MIN_USD,
  CUSTOM_MAX_USD,
} from '@/lib/donations-config';

// ============================================================================
// Module-level style objects, matching the VendorForm convention.
// ============================================================================

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-barlow-condensed)',
  fontSize: '0.8rem',
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'var(--gray)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  color: 'var(--white)',
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.95rem',
  outline: 'none',
};

const fieldWrap: React.CSSProperties = {
  marginBottom: 20,
};

const tierButtonBase: React.CSSProperties = {
  padding: '12px 18px',
  borderRadius: 6,
  fontFamily: 'var(--font-oswald)',
  fontWeight: 600,
  fontSize: '0.95rem',
  letterSpacing: 1,
  textTransform: 'uppercase',
  border: '1px solid var(--gold)',
  transition: 'background 0.15s, color 0.15s',
};

const tierButtonSelected: React.CSSProperties = {
  ...tierButtonBase,
  background: 'var(--gold)',
  color: 'var(--navy)',
};

const tierButtonUnselected: React.CSSProperties = {
  ...tierButtonBase,
  background: 'transparent',
  color: 'var(--gold)',
};

// ============================================================================

type TierAmountStr = '25' | '50' | '100' | '250';

export default function DonationForm() {
  const [donationType, setDonationType] = useState<'tier' | 'custom'>('tier');
  // Default to the middle tier — gentle nudge toward $50 without being pushy.
  const [tierAmount, setTierAmount] = useState<TierAmountStr>('50');
  const [customAmount, setCustomAmount] = useState('');
  const [donorFirstName, setDonorFirstName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [publicMessage, setPublicMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Parse the custom amount once per render. Returns the integer dollar value
  // if it's a valid whole number within [CUSTOM_MIN_USD, CUSTOM_MAX_USD], else
  // null. Used for both the submit-button text and the disabled state.
  const parsedCustomAmount: number | null = (() => {
    if (donationType !== 'custom') return null;
    const trimmed = customAmount.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    if (n < CUSTOM_MIN_USD || n > CUSTOM_MAX_USD) return null;
    return n;
  })();

  const resolvedAmount: number | null =
    donationType === 'tier' ? Number(tierAmount) : parsedCustomAmount;

  const canSubmit = !submitting && resolvedAmount !== null;

  const submitButtonText = submitting
    ? 'Processing…'
    : resolvedAmount === null
      ? 'Enter an amount to continue'
      : `Continue to Checkout — $${resolvedAmount}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Build the request body explicitly per branch — never send tier_amount
    // on a custom donation and never send custom_amount_usd on a tier
    // donation. The discriminated union narrows each branch's shape; sending
    // cross-branch fields would either be stripped (.strip default) or
    // rejected (.strict if enabled). Building per-branch is the safe choice.
    const body =
      donationType === 'tier'
        ? {
            donation_type: 'tier' as const,
            tier_amount: tierAmount,
            donor_first_name: donorFirstName,
            donor_email: donorEmail,
            public_message: publicMessage,
            is_anonymous: isAnonymous,
          }
        : {
            donation_type: 'custom' as const,
            // parsedCustomAmount is non-null whenever canSubmit is true, so
            // this branch only executes with a valid number; null guard is
            // defensive in case the form is submitted via keyboard while
            // canSubmit is false (the disabled button would normally prevent).
            custom_amount_usd: parsedCustomAmount ?? 0,
            donor_first_name: donorFirstName,
            donor_email: donorEmail,
            public_message: publicMessage,
            is_anonymous: isAnonymous,
          };

    // Client-side zod validation — server revalidates regardless.
    const parsed = donationSchema.safeParse(body);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        if (!errs[path]) errs[path] = issue.message;
      }
      setFieldErrors(errs);
      setError('Please fix the highlighted fields and try again.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        if (json.error === 'validation' && Array.isArray(json.issues)) {
          const errs: Record<string, string> = {};
          for (const issue of json.issues) {
            errs[issue.path] = issue.message;
          }
          setFieldErrors(errs);
          setError('Please fix the highlighted fields and try again.');
        } else {
          setError(
            'Something went wrong. Please try again, or email info@phamilyclassic.com if the problem persists.'
          );
        }
        setSubmitting(false);
        return;
      }

      // Success — redirect to Shopify checkout (tier) or hosted draft order
      // invoice URL (custom). Full-page navigation, NOT router.push.
      window.location.href = json.checkoutUrl;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[DonationForm] submit failed', err);
      setError(
        'Network error. Check your connection and try again, or email info@phamilyclassic.com.'
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* ---- Tier picker --------------------------------------------------- */}
      <div style={fieldWrap}>
        <label style={{ ...labelStyle, marginBottom: 12 }}>
          Choose an amount
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {DONATION_TIERS.map((tier) => {
            const tierStr = String(tier.amount) as TierAmountStr;
            const selected =
              donationType === 'tier' && tierAmount === tierStr;
            return (
              <button
                key={tier.amount}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setDonationType('tier');
                  setTierAmount(tierStr);
                }}
                disabled={submitting}
                style={{
                  ...(selected ? tierButtonSelected : tierButtonUnselected),
                  cursor: submitting ? 'default' : 'pointer',
                }}
              >
                ${tier.amount} {tier.label}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={donationType === 'custom'}
            onClick={() => setDonationType('custom')}
            disabled={submitting}
            style={{
              ...(donationType === 'custom'
                ? tierButtonSelected
                : tierButtonUnselected),
              cursor: submitting ? 'default' : 'pointer',
            }}
          >
            Custom amount
          </button>
        </div>
      </div>

      {/* ---- Custom amount input — only when 'custom' is selected ---------- */}
      {donationType === 'custom' && (
        <div style={fieldWrap}>
          <label htmlFor="custom_amount" style={labelStyle}>
            Amount in USD (${CUSTOM_MIN_USD}–${CUSTOM_MAX_USD.toLocaleString()})
          </label>
          <input
            id="custom_amount"
            type="number"
            inputMode="numeric"
            min={CUSTOM_MIN_USD}
            max={CUSTOM_MAX_USD}
            step={1}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="75"
            style={inputStyle}
            disabled={submitting}
          />
          {fieldErrors.custom_amount_usd && (
            <div
              style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}
            >
              {fieldErrors.custom_amount_usd}
            </div>
          )}
        </div>
      )}

      {/* ---- Donor first name ---------------------------------------------- */}
      <div style={fieldWrap}>
        <label htmlFor="donor_first_name" style={labelStyle}>
          First name (optional)
        </label>
        <input
          id="donor_first_name"
          type="text"
          value={donorFirstName}
          onChange={(e) => setDonorFirstName(e.target.value)}
          maxLength={60}
          style={inputStyle}
          disabled={submitting}
        />
        {fieldErrors.donor_first_name && (
          <div
            style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}
          >
            {fieldErrors.donor_first_name}
          </div>
        )}
      </div>

      {/* ---- Email — dynamic label (optional/required) --------------------- */}
      <div style={fieldWrap}>
        <label htmlFor="donor_email" style={labelStyle}>
          Email {donationType === 'custom' ? '*' : '(optional)'}
        </label>
        <input
          id="donor_email"
          type="email"
          value={donorEmail}
          onChange={(e) => setDonorEmail(e.target.value)}
          maxLength={254}
          required={donationType === 'custom'}
          style={inputStyle}
          disabled={submitting}
        />
        {fieldErrors.donor_email && (
          <div
            style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}
          >
            {fieldErrors.donor_email}
          </div>
        )}
      </div>

      {/* ---- Public message with live character counter -------------------- */}
      <div style={fieldWrap}>
        <label htmlFor="public_message" style={labelStyle}>
          Public message (optional)
        </label>
        <textarea
          id="public_message"
          rows={3}
          value={publicMessage}
          onChange={(e) => setPublicMessage(e.target.value)}
          maxLength={280}
          placeholder="A short note that will appear on the donor wall."
          style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
          disabled={submitting}
        />
        <div
          aria-live="polite"
          style={{
            fontFamily: 'var(--font-barlow-condensed)',
            fontSize: '0.75rem',
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: 'var(--gray)',
            marginTop: 4,
            textAlign: 'right',
          }}
        >
          {publicMessage.length} / 280
        </div>
        {fieldErrors.public_message && (
          <div
            style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}
          >
            {fieldErrors.public_message}
          </div>
        )}
      </div>

      {/* ---- Anonymous checkbox -------------------------------------------- */}
      <div style={{ ...fieldWrap, marginTop: 12 }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            cursor: submitting ? 'default' : 'pointer',
            fontFamily: 'var(--font-barlow)',
            fontSize: '0.9rem',
            lineHeight: 1.5,
            color: 'var(--gray)',
          }}
        >
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            style={{ marginTop: 4 }}
            disabled={submitting}
          />
          <span>Show me as Anonymous on the donor wall</span>
        </label>
      </div>

      {/* ---- Top-level error ----------------------------------------------- */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            background: 'rgba(196,30,42,0.1)',
            border: '1px solid rgba(196,30,42,0.4)',
            borderRadius: 6,
            color: 'var(--white)',
            fontSize: '0.9rem',
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {/* ---- Submit -------------------------------------------------------- */}
      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          width: '100%',
          padding: '16px 24px',
          background: !canSubmit ? 'rgba(245,197,24,0.4)' : 'var(--gold)',
          color: 'var(--navy)',
          border: 'none',
          borderRadius: 6,
          fontFamily: 'var(--font-oswald)',
          fontSize: '1rem',
          fontWeight: 600,
          letterSpacing: 2,
          textTransform: 'uppercase',
          cursor: canSubmit ? 'pointer' : 'default',
        }}
      >
        {submitButtonText}
      </button>

      <p
        style={{
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.8rem',
          color: 'var(--gray)',
          marginTop: 16,
          textAlign: 'center',
        }}
      >
        You&apos;ll be redirected to Shopify&apos;s secure checkout to complete
        payment.
      </p>
    </form>
  );
}

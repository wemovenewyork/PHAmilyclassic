'use client';

import { useState } from 'react';
import { vendorFormSchema, type VendorFormData } from '@/lib/vendor-schema';

type FormState = {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  product_description: string;
  website: string;
  terms_acknowledged: boolean;
};

const initialState: FormState = {
  company_name: '',
  contact_name: '',
  email: '',
  phone: '',
  product_description: '',
  website: '',
  terms_acknowledged: false,
};

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

export default function VendorForm() {
  const [state, setState] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side zod validation — server revalidates regardless.
    const parsed = vendorFormSchema.safeParse(state);
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
      const res = await fetch('/api/vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data satisfies VendorFormData),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        if (json.error === 'vendors-full') {
          setError(
            'Sorry — all 20 vendor spots have just been claimed. Please reload the page.'
          );
        } else if (json.error === 'validation' && Array.isArray(json.issues)) {
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

      // Success — redirect to Shopify checkout.
      window.location.href = json.checkoutUrl;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[VendorForm] submit failed', err);
      setError(
        'Network error. Check your connection and try again, or email info@phamilyclassic.com.'
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={fieldWrap}>
        <label htmlFor="company_name" style={labelStyle}>
          Company / Organization Name *
        </label>
        <input
          id="company_name"
          type="text"
          required
          value={state.company_name}
          onChange={(e) => update('company_name', e.target.value)}
          style={inputStyle}
          disabled={submitting}
        />
        {fieldErrors.company_name && (
          <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}>
            {fieldErrors.company_name}
          </div>
        )}
      </div>

      <div style={fieldWrap}>
        <label htmlFor="contact_name" style={labelStyle}>
          Primary Contact Name *
        </label>
        <input
          id="contact_name"
          type="text"
          required
          value={state.contact_name}
          onChange={(e) => update('contact_name', e.target.value)}
          style={inputStyle}
          disabled={submitting}
        />
        {fieldErrors.contact_name && (
          <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}>
            {fieldErrors.contact_name}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <label htmlFor="email" style={labelStyle}>
            Email *
          </label>
          <input
            id="email"
            type="email"
            required
            value={state.email}
            onChange={(e) => update('email', e.target.value)}
            style={inputStyle}
            disabled={submitting}
          />
          {fieldErrors.email && (
            <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}>
              {fieldErrors.email}
            </div>
          )}
        </div>
        <div>
          <label htmlFor="phone" style={labelStyle}>
            Phone *
          </label>
          <input
            id="phone"
            type="tel"
            required
            value={state.phone}
            onChange={(e) => update('phone', e.target.value)}
            style={inputStyle}
            disabled={submitting}
          />
          {fieldErrors.phone && (
            <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}>
              {fieldErrors.phone}
            </div>
          )}
        </div>
      </div>

      <div style={fieldWrap}>
        <label htmlFor="product_description" style={labelStyle}>
          What will you be selling or promoting? *
        </label>
        <textarea
          id="product_description"
          required
          rows={4}
          value={state.product_description}
          onChange={(e) => update('product_description', e.target.value)}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }}
          placeholder="Describe your products, services, or organization."
          disabled={submitting}
        />
        {fieldErrors.product_description && (
          <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}>
            {fieldErrors.product_description}
          </div>
        )}
      </div>

      <div style={fieldWrap}>
        <label htmlFor="website" style={labelStyle}>
          Website or Social (optional)
        </label>
        <input
          id="website"
          type="text"
          value={state.website}
          onChange={(e) => update('website', e.target.value)}
          style={inputStyle}
          placeholder="https://example.com or @yourhandle"
          disabled={submitting}
        />
        {fieldErrors.website && (
          <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}>
            {fieldErrors.website}
          </div>
        )}
      </div>

      <div style={{ ...fieldWrap, marginTop: 28 }}>
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
            checked={state.terms_acknowledged}
            onChange={(e) => update('terms_acknowledged', e.target.checked)}
            style={{ marginTop: 4 }}
            disabled={submitting}
          />
          <span>
            I understand this is a non-refundable $100 vendor package, limited
            to merchandise and information/service vendors (no food vendors). I
            agree to follow event signage and conduct guidelines and
            acknowledge all sales are final.
          </span>
        </label>
        {fieldErrors.terms_acknowledged && (
          <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}>
            {fieldErrors.terms_acknowledged}
          </div>
        )}
      </div>

      {error && (
        <div
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

      <button
        type="submit"
        disabled={submitting}
        style={{
          width: '100%',
          padding: '16px 24px',
          background: submitting ? 'rgba(245,197,24,0.4)' : 'var(--gold)',
          color: 'var(--navy)',
          border: 'none',
          borderRadius: 6,
          fontFamily: 'var(--font-oswald)',
          fontSize: '1rem',
          fontWeight: 600,
          letterSpacing: 2,
          textTransform: 'uppercase',
          cursor: submitting ? 'default' : 'pointer',
        }}
      >
        {submitting ? 'Processing…' : 'Continue to Checkout — $100'}
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
        You'll be redirected to Shopify's secure checkout to complete payment.
      </p>
    </form>
  );
}

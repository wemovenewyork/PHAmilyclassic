import ScannerLoginForm from '@/components/scanner/ScannerLoginForm';

/**
 * /scan/login — shared-password gate.
 *
 * Server component just renders the metadata + the client form. The form
 * POSTs to /api/scanner-auth and, on success, navigates the browser to the
 * `redirectTo` query parameter (sanitized to only allow same-origin /scan/*
 * targets) or to /scan as the default.
 */

export const metadata = {
  title: 'Scanner Login — PHAmily Classic',
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: { redirectTo?: string };
}

export default function ScannerLoginPage({ searchParams }: Props) {
  const raw = searchParams.redirectTo ?? '/scan';
  // Only allow same-origin /scan paths — protect against open-redirect.
  const safeRedirect =
    raw.startsWith('/scan') && !raw.startsWith('//') ? raw : '/scan';

  return <ScannerLoginForm redirectTo={safeRedirect} />;
}

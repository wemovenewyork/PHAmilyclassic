import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionJwt,
} from '@/lib/admin-auth';
import AdminLoginForm from '@/components/admin/AdminLoginForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin Login — PHAmily Classic',
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: { redirectTo?: string };
}

export default async function AdminLoginPage({ searchParams }: Props) {
  // If already logged in, redirect straight to /admin.
  const jwt = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  const session = await verifyAdminSessionJwt(jwt);
  if (session) {
    redirect('/admin');
  }
  // Touch headers() so this page is rendered dynamically (cookies above
  // already does this, but referencing headers is a no-op safety net).
  headers();

  const raw = searchParams.redirectTo ?? '/admin';
  const safeRedirect =
    raw.startsWith('/admin') && !raw.startsWith('//') ? raw : '/admin';

  return <AdminLoginForm redirectTo={safeRedirect} />;
}

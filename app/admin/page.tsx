import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionJwt,
} from '@/lib/admin-auth';
import AdminDashboard from '@/components/admin/AdminDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin Dashboard — PHAmily Classic',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const jwt = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  const session = await verifyAdminSessionJwt(jwt);
  if (!session) {
    redirect('/admin/login?redirectTo=/admin');
  }
  return (
    <AdminDashboard
      adminEmail={session.email}
      adminDisplayName={session.display_name}
    />
  );
}

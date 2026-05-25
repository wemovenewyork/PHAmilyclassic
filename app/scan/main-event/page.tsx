import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ScannerPageClient from '@/components/scanner/ScannerPageClient';
import {
  SCANNER_SESSION_COOKIE,
  verifySessionCookie,
} from '@/lib/scanner-auth';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Main Event Scanner — PHAmily Classic',
  robots: { index: false, follow: false },
};

export default function MainEventScannerPage() {
  const cookie = cookies().get(SCANNER_SESSION_COOKIE)?.value;
  if (!verifySessionCookie(cookie)) {
    redirect('/scan/login?redirectTo=/scan/main-event');
  }
  return <ScannerPageClient event="main_event" />;
}

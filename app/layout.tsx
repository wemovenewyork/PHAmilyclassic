import type { Metadata } from 'next';
import { Oswald, Barlow, Barlow_Condensed } from 'next/font/google';
import './globals.css';
import SiteFooter from '@/components/SiteFooter';

// next/font/google self-hosts font files in the build output, eliminating
// layout shift and 3rd-party font requests. On Vercel this works automatically.
// Local builds require network access to fonts.googleapis.com at build time.
const oswald = Oswald({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-oswald',
  display: 'swap',
});

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-barlow',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-barlow-condensed',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Interstate PHAmily Classic',
    template: '%s | Interstate PHAmily Classic',
  },
  description:
    'The 1st Annual Interstate PHAmily Classic — NY vs NJ Basketball & Kickball. August 29, 2026 at Riverbank State Park, NYC. Presented by Adelphic Union Lodge #14.',
  metadataBase: new URL('https://theinterstatephamilyclassic.org'),
  openGraph: {
    title: 'Interstate PHAmily Classic | August 29, 2026',
    description:
      'NY vs NJ Basketball & Kickball. Community celebration at Riverbank State Park, NYC. Presented by AUL #14.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Interstate PHAmily Classic',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Interstate PHAmily Classic | August 29, 2026',
    description:
      'NY vs NJ Basketball & Kickball. Presented by Adelphic Union Lodge #14. Riverbank State Park, NYC.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${oswald.variable} ${barlow.variable} ${barlowCondensed.variable}`}
    >
      <body>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}

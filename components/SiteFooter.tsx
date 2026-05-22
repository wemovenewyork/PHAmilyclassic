import Link from 'next/link';

/**
 * Site-wide footer rendered on every Next.js route via app/layout.tsx.
 * The static homepage at public/index.html has its own equivalent footer
 * and is served via a Next.js rewrite that bypasses this layout, so this
 * component does NOT render on /.
 *
 * Markup and styling mirror the static footer's .footer / .footer-grid /
 * .footer-bottom blocks (see app/globals.css). In-page anchors point at
 * /#section so they navigate back to the homepage from any route.
 */
export default function SiteFooter() {
  return (
    <footer className="footer" role="contentinfo">
      <div className="footer-grid">
        <div className="footer-col">
          <div className="footer-brand">Interstate PHAmily Classic</div>
          <div className="footer-brand-sub">Presented by Adelphic Union Lodge #14</div>
          <p>
            A celebration of community, fellowship, and jurisdictional pride.
            Bringing together the NY and NJ Prince Hall Families at Riverbank State Park.
          </p>
          <div className="footer-social">
            <a href="#" aria-label="Facebook">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
              </svg>
            </a>
            <a href="#" aria-label="Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5" />
                <circle cx="12" cy="12" r="5" />
              </svg>
            </a>
            <a href="#" aria-label="X formerly Twitter">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a href="#" aria-label="YouTube">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </a>
            <a href="#" aria-label="TikTok">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V12.5a8.27 8.27 0 004.77 1.52V10.6a4.83 4.83 0 01-.81.07 4.81 4.81 0 01-.38-3.98z" />
              </svg>
            </a>
          </div>
        </div>

        <div className="footer-col">
          <h4>Quick Links</h4>
          <Link href="/register">Register to Play</Link>
          <Link href="/teams">Rosters</Link>
          <a href="/#about">About</a>
          <a href="/#schedule">Schedule</a>
          <a href="/#games">Games</a>
          <a href="/#community">Community</a>
          <a href="/#vendor">Vendor Opportunity</a>
          <a href="/#tickets">Tickets</a>
        </div>

        <div className="footer-col">
          <h4>Information</h4>
          <a href="/#faq">FAQ</a>
          <a href="/#venue">Venue &amp; Parking</a>
          <a href="/#afterparty">After Party</a>
          <a href="/#vendor">Vendor Application</a>
          <a href="/#contact">Contact Us</a>
          <a href="/#newsletter">Newsletter</a>
        </div>

        <div className="footer-col">
          <h4>Contact</h4>
          <p style={{ marginBottom: 8 }}>
            <a href="mailto:info@phamilyclassic.com" style={{ color: 'var(--gold)' }}>
              info@phamilyclassic.com
            </a>
          </p>
          <p style={{ marginBottom: 8 }}>
            Riverbank State Park
            <br />
            679 Riverside Dr
            <br />
            New York, NY 10031
          </p>
          <p>
            August 29, 2026
            <br />
            12:30 PM – 7:00 PM
          </p>
        </div>
      </div>

      <div className="footer-bottom">
        <p className="footer-copy">
          &copy; 2026 Adelphic Union Lodge #14, F. &amp; A.M. All Rights Reserved.
        </p>
        <p className="footer-copy">
          Interstate PHAmily Classic |{' '}
          <Link href="/privacy" style={{ color: 'var(--gray)' }}>
            Privacy Policy
          </Link>{' '}
          |{' '}
          <Link href="/terms" style={{ color: 'var(--gray)' }}>
            Terms &amp; Conditions
          </Link>
        </p>
        <p
          className="footer-copy"
          style={{ flexBasis: '100%', textAlign: 'center' }}
        >
          MW Darren M. Morton, Ed.D — Grand Master
        </p>
      </div>
    </footer>
  );
}

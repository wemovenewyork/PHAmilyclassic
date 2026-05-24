/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Serve the legacy static landing page at root.
  // We keep the original index.html / terms.html / privacy.html in /public
  // and rewrite the root URL to them so nothing visual changes vs the current site.
  async rewrites() {
    return [
      { source: '/', destination: '/index.html' },
      { source: '/terms', destination: '/terms.html' },
      { source: '/privacy', destination: '/privacy.html' },
    ];
  },
  // pdfkit reads its built-in .afm font metric files from
  // node_modules/pdfkit/js/data/ at runtime via fs.readFileSync. Next.js's
  // tracer can't detect that dynamic read, so the files are normally NOT
  // copied into the deployed Lambda — every ticket-generating webhook hits
  // ENOENT inside dispatchTicketEmail(). Explicitly include them.
  // (Next 14 puts this under experimental; Next 15 will promote it to
  // top-level.)
  experimental: {
    outputFileTracingIncludes: {
      '/api/shopify-webhook': ['./node_modules/pdfkit/js/data/**/*'],
    },
  },
};

module.exports = nextConfig;

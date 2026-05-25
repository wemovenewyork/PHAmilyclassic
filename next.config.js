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
  // pdfkit ships .afm font metric files in node_modules/pdfkit/js/data/
  // and reads them at runtime via fs.readFileSync(__dirname + "/data/...").
  //
  // Two configs work together:
  //
  // 1. serverComponentsExternalPackages: ['pdfkit'] keeps webpack from
  //    inlining pdfkit's source into the route bundle. Without this,
  //    pdfkit's font loader runs with __dirname = the route's directory
  //    (e.g. /var/task/.next/server/app/api/shopify-webhook/) and throws
  //    ENOENT for /var/task/.next/server/app/api/shopify-webhook/data/
  //    Helvetica.afm. With pdfkit external, the route calls require('pdfkit')
  //    at runtime and pdfkit's __dirname resolves to its native location
  //    (node_modules/pdfkit/js/) where the data/ dir lives.
  //
  // 2. outputFileTracingIncludes explicitly tells Next's tracer to ship
  //    pdfkit's .afm + ICC files into the Lambda. Belt-and-braces: in
  //    principle the externalized-package path should pull them in via
  //    Vercel's deploy pipeline, but we can't verify that locally and
  //    PR #11 already shipped tickets stuck mid-pipeline (orders 1077,
  //    1078), so we explicit-trace as well to remove the uncertain leg.
  //
  // (Both move under different keys in Next 15: serverExternalPackages
  //  promotes to top-level; outputFileTracingIncludes likewise.)
  experimental: {
    serverComponentsExternalPackages: ['pdfkit'],
    outputFileTracingIncludes: {
      '/api/shopify-webhook': ['./node_modules/pdfkit/js/data/**/*'],
    },
  },
};

module.exports = nextConfig;

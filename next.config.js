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
};

module.exports = nextConfig;

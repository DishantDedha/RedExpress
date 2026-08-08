/**
 * Extra origins Server Actions may be invoked from.
 *
 * Next rejects a Server Action whose `Origin` does not match the `Host` — that is the CSRF
 * check protecting mark-dead, reactivate and the call log. Behind a proxy or CDN the host the
 * browser saw is not the host Next sees, and every action would fail with an opaque error, so
 * the public origin has to be named. Comma-separated hostnames, no scheme: `crm.example.org`.
 *
 * Empty by default, which means same-origin only — the safe reading. Do not add a wildcard to
 * make an error go away; the mistake it prevents is a page on another site pressing "Mark as
 * unreachable" in a staff member's browser.
 */
const serverActionOrigins = (process.env.CRM_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Plain JavaScript, no TypeScript — see ARCHITECTURE.md. Nothing here should ever
  // introduce a .ts/.tsx build step.
  reactStrictMode: true,

  // The CRM renders personal data (phones, addresses, coordinates). Nothing it serves
  // should be cached by an intermediary, and no framework version banner should leak.
  poweredByHeader: false,

  experimental: {
    serverActions: {
      ...(serverActionOrigins.length ? { allowedOrigins: serverActionOrigins } : {}),
      // No action here accepts a file. The default is 1 MB; this is the size of the largest
      // thing staff actually submit — a call note — with room to spare.
      bodySizeLimit: '64kb',
    },
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          // Staff data must not be framed by another site — clickjacking a "mark dead"
          // button is exactly the kind of thing this prevents.
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;

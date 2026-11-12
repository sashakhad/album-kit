import type { NextConfig } from 'next';

import { CONTENT_SECURITY_POLICY } from './src/lib/album/content-security';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY }],
      },
      {
        source: '/access',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    '/*': ['./album/**/*.json', './album/**/*.md'],
  },
};

export default nextConfig;

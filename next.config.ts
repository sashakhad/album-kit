import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
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

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/*': ['./album/**/*.json', './album/**/*.md'],
  },
};

export default nextConfig;

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript/ESM sources (ui) or are consumed from dist (contracts, auth); Next must compile them.
  transpilePackages: ['@erp/ui', '@erp/contracts', '@erp/auth'],
};

export default nextConfig;

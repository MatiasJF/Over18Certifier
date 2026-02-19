import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['knex', '@bsv/wallet-toolbox'],
}

export default nextConfig

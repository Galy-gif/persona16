import type { NextConfig } from 'next';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';

// 本地开发时从仓库根目录读 .env；生产构建只使用部署环境变量。
if (process.env.NODE_ENV !== 'production') {
  loadEnv({ path: join(__dirname, '..', '..', '.env') });
}

const nextConfig: NextConfig = {
  // Keep development and production artifacts separate. Running `next build`
  // while the local prototype is open must not invalidate the dev asset graph.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  transpilePackages: ['@persona16/engine', '@persona16/runtime-pi'],
  serverExternalPackages: ['@earendil-works/pi-agent-core', '@earendil-works/pi-ai'],
};

export default nextConfig;

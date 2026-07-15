import type { NextConfig } from 'next';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';

// 本地开发时从仓库根目录读 .env（Vercel 上用环境变量，不走这里）
loadEnv({ path: join(__dirname, '..', '..', '.env') });

const nextConfig: NextConfig = {
  transpilePackages: ['@persona16/engine', '@persona16/runtime-pi'],
  serverExternalPackages: ['@earendil-works/pi-agent-core', '@earendil-works/pi-ai'],
};

export default nextConfig;

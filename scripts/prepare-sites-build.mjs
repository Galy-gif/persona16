import { copyFile, cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const openNextOutput = resolve(repositoryRoot, 'apps/web/.open-next');
const bundledWorker = resolve(repositoryRoot, '.sites-worker/worker.js');
const distRoot = resolve(repositoryRoot, 'dist');
const serverRoot = resolve(distRoot, 'server');

await rm(distRoot, { recursive: true, force: true });
await mkdir(serverRoot, { recursive: true });
await copyFile(bundledWorker, resolve(serverRoot, 'index.js'));
await cp(resolve(openNextOutput, 'assets'), resolve(distRoot, 'assets'), {
  recursive: true,
});

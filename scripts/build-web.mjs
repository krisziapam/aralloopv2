import { cp, mkdir, rm } from 'node:fs/promises';

const webDir = new URL('../www/', import.meta.url);
await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

for (const item of ['index.html', 'manifest.json', 'service-worker.js', 'assets', 'css', 'js']) {
  await cp(new URL(`../${item}`, import.meta.url), new URL(item, webDir), { recursive: true });
}

console.log('AralLoop web assets prepared in www/ for Capacitor.');

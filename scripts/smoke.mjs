#!/usr/bin/env node
// Lance la vraie appli Electron en mode test (CHUT_SMOKE) : exemple synthétique →
// débruitage via IPC → export WAV → capture d'écran. Usage : npm run test:e2e [chemin/appli]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.smoke');
mkdirSync(outDir, { recursive: true });
const target = process.argv[2];
const electron = createRequire(import.meta.url)('electron');
const [cmd, args] = target ? [resolve(target), []] : [electron, [root]];

const res = spawnSync(cmd, args, { env: { ...process.env, CHUT_SMOKE: outDir }, stdio: 'inherit', timeout: 120000 });
let result;
try {
  result = JSON.parse(readFileSync(join(outDir, 'result.json'), 'utf8'));
} catch {
  result = { ok: false, error: 'pas de result.json' };
}
console.log(JSON.stringify(result, null, 2));
if (res.status !== 0 || !result.ok) {
  console.error(`Échec du test de fumée (code ${res.status})`);
  process.exit(1);
}
console.log(`OK : bruit réduit de ${result.reductionDb.toFixed(1)} dB, capture dans .smoke/screenshot.png`);

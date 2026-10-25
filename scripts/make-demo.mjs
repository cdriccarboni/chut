#!/usr/bin/env node
// Génère la démo avant/après de la page web (docs/demo/) : exemple synthétique
// « voix + souffle » passé dans le vrai moteur DeepFilterNet, puis encodé en MP3 (ffmpeg).
// Aucun enregistrement réel. Usage : npm run demo
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { syntheticNoisyVoice, rmsDb } = require('../src/shared/dsp.js');
const { encodeWav } = require('../src/shared/wav.js');
const { resolveEngine, denoise } = require('../src/main/engine.js');

const binary = resolveEngine({ appRoot: root });
if (!binary) throw new Error('moteur introuvable : lancez npm run fetch-engine');

const { sampleRate, noisy, voiceStart } = syntheticNoisyVoice({ seconds: 6, noiseLevel: 0.05, seed: 7 });
const [clean] = await denoise(binary, { sampleRate, channels: [noisy] });

const outDir = join(root, 'docs', 'demo');
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'chut-demo-'));
for (const [name, samples] of [['avant', noisy], ['apres', clean]]) {
  const wav = join(tmp, `${name}.wav`);
  writeFileSync(wav, Buffer.from(encodeWav([samples], sampleRate)));
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-b:a', '96k', join(outDir, `${name}.mp3`)], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg a échoué pour ${name}`);
}
rmSync(tmp, { recursive: true, force: true });
const before = rmsDb(noisy, 0, voiceStart);
const after = rmsDb(clean, 0, voiceStart);
console.log(`Bruit seul : ${before.toFixed(1)} dB → ${after.toFixed(1)} dB (${(after - before).toFixed(1)} dB)`);

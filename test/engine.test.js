'use strict';
// Débruitage réel d'un signal synthétique (aucun enregistrement personnel).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const engine = require('../src/main/engine');
const dsp = require('../src/shared/dsp');

const root = path.join(__dirname, '..');

test('platformDir / binaryName', () => {
  assert.equal(engine.platformDir('darwin', 'arm64'), 'mac-arm64');
  assert.equal(engine.platformDir('win32', 'x64'), 'win-x64');
  assert.equal(engine.binaryName('win32'), 'deep-filter.exe');
  assert.equal(engine.binaryName('linux'), 'deep-filter');
});

test('resolveEngine préfère la copie packagée', () => {
  const found = engine.resolveEngine({
    resourcesPath: '/app/Resources',
    appRoot: '/src',
    platform: 'linux',
    arch: 'x64',
    exists: (p) => p.startsWith('/app') || p.startsWith('/src'),
  });
  assert.equal(found, path.join('/app/Resources', 'engine', 'deep-filter'));
  assert.equal(engine.resolveEngine({ appRoot: '/x', exists: () => false }), null);
});

test('refuse une fréquence autre que 48 kHz', async () => {
  await assert.rejects(engine.denoise('/bin/true', { sampleRate: 44100, channels: [new Float32Array(10)] }), /48000/);
});

const binary = engine.resolveEngine({ appRoot: root });
test('DeepFilterNet réduit le bruit et garde la voix', { skip: !binary && 'moteur absent : npm run fetch-engine' }, async () => {
  const s = dsp.syntheticNoisyVoice({ seconds: 4 });
  const [out] = await engine.denoise(binary, { sampleRate: s.sampleRate, channels: [s.noisy] });
  assert.equal(out.length, s.noisy.length, 'même longueur');

  const noiseBefore = dsp.rmsDb(s.noisy, 0, s.voiceStart);
  const noiseAfter = dsp.rmsDb(out, 0, s.voiceStart);
  assert.ok(noiseBefore - noiseAfter > 20, `bruit seul : ${noiseBefore.toFixed(1)} → ${noiseAfter.toFixed(1)} dB`);

  // la voix reste présente et alignée (corrélation au décalage 0 > décalages voisins)
  const voiceAfter = dsp.rmsDb(out, s.voiceStart);
  const voiceRef = dsp.rmsDb(s.voice, s.voiceStart);
  assert.ok(voiceRef - voiceAfter < 10, `voix : ${voiceRef.toFixed(1)} → ${voiceAfter.toFixed(1)} dB`);
  const corr = (lag) => {
    let sum = 0;
    for (let i = s.voiceStart; i < out.length - 2000; i++) sum += out[i] * s.voice[i + lag];
    return sum;
  };
  const c0 = corr(0);
  for (const lag of [-480, -96, 96, 480]) assert.ok(c0 > corr(lag), `alignement (décalage ${lag})`);
});

test('stéréo : deux canaux en sortie', { skip: !binary && 'moteur absent' }, async () => {
  const s = dsp.syntheticNoisyVoice({ seconds: 2 });
  const out = await engine.denoise(binary, { sampleRate: 48000, channels: [s.noisy, s.noisy.map((v) => v * 0.5)] });
  assert.equal(out.length, 2);
  assert.equal(out[1].length, s.noisy.length);
});

// Pilote du moteur DeepFilterNet (binaire officiel `deep-filter`, MIT/Apache-2.0).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { encodeWav, decodeWav } = require('../shared/wav');
const { fitLength } = require('../shared/dsp');

const ENGINE_SAMPLE_RATE = 48000;
// Le binaire, avec compensation du délai (-D), rend ~1440 échantillons de moins :
// on complète la fin par du silence puis on retaille à la longueur d'origine.
const TAIL_PADDING = 4800;

function platformDir(platform = process.platform, arch = process.arch) {
  const osName = { darwin: 'mac', win32: 'win', linux: 'linux' }[platform] || platform;
  return `${osName}-${arch}`;
}

function binaryName(platform = process.platform) {
  return platform === 'win32' ? 'deep-filter.exe' : 'deep-filter';
}

/** Cherche le binaire : d'abord dans l'appli packagée, puis dans engines/ du dépôt. */
function resolveEngine({ resourcesPath, appRoot, platform = process.platform, arch = process.arch, exists = fs.existsSync } = {}) {
  const name = binaryName(platform);
  const candidates = [];
  if (process.env.CHUT_ENGINE) candidates.push(process.env.CHUT_ENGINE);
  if (resourcesPath) candidates.push(path.join(resourcesPath, 'engine', name));
  if (appRoot) candidates.push(path.join(appRoot, 'engines', platformDir(platform, arch), name));
  return candidates.find((p) => exists(p)) || null;
}

function run(binary, args, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, signal });
    let stderr = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`deep-filter a échoué (code ${code}) ${stderr.trim()}`.trim()));
    });
  });
}

/**
 * Débruite des canaux à 48 kHz.
 * @param {string} binary chemin du binaire deep-filter
 * @param {{sampleRate: number, channels: Float32Array[]}} audio
 * @returns {Promise<Float32Array[]>} canaux débruités, même longueur que l'entrée
 */
async function denoise(binary, audio, { signal } = {}) {
  if (!binary) throw new Error('moteur DeepFilterNet introuvable');
  if (audio.sampleRate !== ENGINE_SAMPLE_RATE) {
    throw new Error(`le moteur attend du ${ENGINE_SAMPLE_RATE} Hz (reçu ${audio.sampleRate} Hz)`);
  }
  const length = audio.channels[0].length;
  const padded = audio.channels.map((ch) => {
    const p = new Float32Array(length + TAIL_PADDING);
    p.set(ch);
    return p;
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chut-'));
  const input = path.join(dir, 'input.wav');
  const outDir = path.join(dir, 'out');
  const output = path.join(outDir, 'input.wav');
  try {
    fs.writeFileSync(input, Buffer.from(encodeWav(padded, ENGINE_SAMPLE_RATE, { float: true })));
    await run(binary, ['--compensate-delay', '--atten-lim-db', '100', '--output-dir', outDir, input], { signal });
    const result = decodeWav(fs.readFileSync(output));
    return result.channels.map((ch) => fitLength(ch, length));
  } finally {
    for (const f of [output, input]) fs.rmSync(f, { force: true });
    for (const d of [outDir, dir]) {
      try {
        fs.rmdirSync(d);
      } catch {
        /* déjà absent */
      }
    }
  }
}

module.exports = { ENGINE_SAMPLE_RATE, TAIL_PADDING, platformDir, binaryName, resolveEngine, denoise };

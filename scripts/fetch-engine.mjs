#!/usr/bin/env node
// Télécharge le binaire officiel DeepFilterNet (deep-filter v0.5.6, MIT/Apache-2.0)
// et vérifie son empreinte SHA-256. Usage :
//   node scripts/fetch-engine.mjs            → plateforme courante
//   node scripts/fetch-engine.mjs mac-x64 …  → cibles précises
//   node scripts/fetch-engine.mjs --all      → toutes les cibles
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.5.6';
const BASE = `https://github.com/Rikorose/DeepFilterNet/releases/download/v${VERSION}`;
const TARGETS = {
  'mac-arm64': ['aarch64-apple-darwin', '4601e7f4e4c03e59a4c5b5000216ef3add3e808799cfccd95e14e83ea4611081'],
  'mac-x64': ['x86_64-apple-darwin', 'd3be84003acb7c23e738ad7f70a158ec779a8d233a82e7fa3e717d112eb5b50f'],
  'win-x64': ['x86_64-pc-windows-msvc.exe', '75e11fa16445f560cb6b021521ddb89e89270d13b83089705d98776f58fd7915'],
  'linux-x64': ['x86_64-unknown-linux-musl', '70775e251eee44c0f2451a1e833326cf8bcbbe304d3e7cd12851e6fce72ef7da'],
  'linux-arm64': ['aarch64-unknown-linux-gnu', '14e02a1c0028f3ca0bdf83b62b3336e56ba0556894ef295a95e8573f06557166'],
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const osName = { darwin: 'mac', win32: 'win', linux: 'linux' }[process.platform];
const args = process.argv.slice(2);
const wanted = args.includes('--all') ? Object.keys(TARGETS) : args.length ? args : [`${osName}-${process.arch}`];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

for (const target of wanted) {
  const entry = TARGETS[target];
  if (!entry) {
    console.error(`Cible inconnue : ${target} (connues : ${Object.keys(TARGETS).join(', ')})`);
    process.exit(1);
  }
  const [suffix, expected] = entry;
  const file = join(root, 'engines', target, target.startsWith('win') ? 'deep-filter.exe' : 'deep-filter');
  if (existsSync(file) && sha256(readFileSync(file)) === expected) {
    console.log(`${target} : déjà présent`);
    continue;
  }
  const url = `${BASE}/deep-filter-${VERSION}-${suffix}`;
  console.log(`${target} : téléchargement de ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== expected) throw new Error(`${target} : empreinte inattendue ${got}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  chmodSync(file, 0o755);
  console.log(`${target} : OK (${(buf.length / 1e6).toFixed(1)} Mo)`);
}

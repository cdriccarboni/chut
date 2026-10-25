#!/usr/bin/env node
// À partir de build/icon.png (1024) : build/icon.icns (macOS, via sips + iconutil) et build/icon.ico.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'build', 'icon.png');
if (process.platform !== 'darwin') {
  console.error('make-icons nécessite macOS (sips, iconutil).');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'chut-icons-'));
const resize = (size, out) => execFileSync('sips', ['-z', String(size), String(size), src, '--out', out], { stdio: 'ignore' });

// .icns
const set = join(work, 'icon.iconset');
execFileSync('mkdir', [set]);
for (const size of [16, 32, 128, 256, 512]) {
  resize(size, join(set, `icon_${size}x${size}.png`));
  resize(size * 2, join(set, `icon_${size}x${size}@2x.png`));
}
execFileSync('iconutil', ['-c', 'icns', set, '-o', join(root, 'build', 'icon.icns')]);

// .ico (entrées PNG, acceptées depuis Windows Vista)
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((s) => {
  const out = join(work, `ico-${s}.png`);
  resize(s, out);
  return readFileSync(out);
});
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s >= 256 ? 0 : s, e);
  header.writeUInt8(s >= 256 ? 0 : s, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
writeFileSync(join(root, 'build', 'icon.ico'), Buffer.concat([header, ...pngs]));

// nettoyage du dossier temporaire (fichiers puis dossiers, sans suppression récursive)
for (const f of readdirSync(set)) rmSync(join(set, f));
rmdirSync(set);
for (const f of readdirSync(work)) rmSync(join(work, f));
rmdirSync(work);
console.log('build/icon.icns et build/icon.ico écrits');

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeWav, decodeWav } = require('../src/shared/wav');

const ramp = (n) => Float32Array.from({ length: n }, (_, i) => Math.sin(i / 7) * 0.9);

for (const opts of [{ bitDepth: 16 }, { bitDepth: 24 }, { bitDepth: 32 }, { float: true }]) {
  test(`aller-retour WAV ${JSON.stringify(opts)}`, () => {
    const left = ramp(1000);
    const right = left.map((v) => -v / 2);
    const out = decodeWav(encodeWav([left, right], 48000, opts));
    assert.equal(out.sampleRate, 48000);
    assert.equal(out.channels.length, 2);
    assert.equal(out.channels[0].length, 1000);
    const tol = opts.bitDepth === 16 ? 1e-4 : 1e-6;
    for (let i = 0; i < 1000; i++) {
      assert.ok(Math.abs(out.channels[0][i] - left[i]) < tol);
      assert.ok(Math.abs(out.channels[1][i] - right[i]) < tol);
    }
  });
}

test('écrête les valeurs hors [-1, 1] et remplace NaN par 0', () => {
  const out = decodeWav(encodeWav([Float32Array.from([2, -2, NaN])], 8000, { bitDepth: 16 }));
  assert.ok(out.channels[0][0] > 0.999);
  assert.equal(out.channels[0][1], -1);
  assert.equal(out.channels[0][2], 0);
});

test('en-tête RIFF cohérent', () => {
  const buf = encodeWav([new Float32Array(10)], 44100, { bitDepth: 24 });
  const v = new DataView(buf);
  assert.equal(buf.byteLength, 44 + 30);
  assert.equal(v.getUint32(4, true), buf.byteLength - 8);
  assert.equal(v.getUint16(34, true), 24);
});

test('refuse un fichier qui n’est pas un WAV', () => {
  assert.throws(() => decodeWav(new Uint8Array(64)), /WAV invalide/);
});

test('décode un WAV PCM 8 bits construit à la main', () => {
  const samples = [0, 128, 255, 64];
  const buf = Buffer.alloc(44 + samples.length);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(8000, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length, 40);
  samples.forEach((v, i) => buf.writeUInt8(v, 44 + i));
  const out = decodeWav(buf);
  assert.equal(out.sampleRate, 8000);
  assert.deepEqual([...out.channels[0]], samples.map((v) => (v - 128) / 128));
});

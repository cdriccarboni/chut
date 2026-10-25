'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dsp = require('../src/shared/dsp');

test('intensité → gain du signal d’origine', () => {
  assert.equal(dsp.intensityToDryGain(0), 1);
  assert.equal(dsp.intensityToDryGain(100), 0);
  assert.equal(dsp.intensityToDryGain(150), 0);
  assert.equal(dsp.intensityToDryGain(-5), 1);
  assert.ok(Math.abs(dsp.intensityToDb(50) - 30) < 1e-9);
  let prev = 2;
  for (let i = 0; i <= 100; i++) {
    const g = dsp.intensityToDryGain(i);
    assert.ok(g < prev, `décroissant à ${i}`);
    prev = g;
  }
});

test('mélange avant/après', () => {
  const orig = [Float32Array.from([1, 1, 1])];
  const clean = [Float32Array.from([0, 0, 0])];
  assert.deepEqual([...dsp.mixChannels(orig, clean, 0)[0]], [1, 1, 1]);
  assert.deepEqual([...dsp.mixChannels(orig, clean, 100)[0]], [0, 0, 0]);
  const half = dsp.mixChannels(orig, clean, 50)[0][0];
  assert.ok(Math.abs(half - Math.pow(10, -30 / 20)) < 1e-6);
});

test('fitLength tronque ou complète', () => {
  assert.deepEqual([...dsp.fitLength(Float32Array.from([1, 2, 3]), 2)], [1, 2]);
  assert.deepEqual([...dsp.fitLength(Float32Array.from([1]), 3)], [1, 0, 0]);
});

test('waveformPeaks donne min/max par colonne', () => {
  const p = dsp.waveformPeaks(Float32Array.from([0.5, -0.25, 1, -1]), 2);
  assert.deepEqual([...p], [-0.25, 0.5, -1, 1]);
});

test('exemple synthétique déterministe, bruit seul pendant 1 s', () => {
  const a = dsp.syntheticNoisyVoice({ seconds: 2 });
  const b = dsp.syntheticNoisyVoice({ seconds: 2 });
  assert.deepEqual(a.noisy.slice(0, 50), b.noisy.slice(0, 50));
  assert.equal(dsp.rmsDb(a.voice, 0, a.voiceStart), -Infinity);
  assert.ok(dsp.rmsDb(a.voice, a.voiceStart) > -40);
});

test('normalisation de pic -1 dB, limite +12 dB, sans écrêtage', () => {
  const x = [Float32Array.from([0.1, -0.2, 0.05])];
  const out = dsp.normalizePeak(x);
  assert.ok(Math.abs(out[0][1]) < 0.8); // gain limité à +12 dB
  assert.ok(Math.abs(x[0][1] + 0.2) < 1e-6); // source intacte
  const loud = dsp.normalizePeak([Float32Array.from([1, -0.8])]);
  assert.ok(Math.abs(loud[0][0] - Math.pow(10, -1/20)) < 1e-6);
  assert.equal(dsp.normalizePeak([new Float32Array(2)])[0][0], 0);
});

test('v2: reconstitution original depuis les couches',()=>{
 const source=[Float32Array.from([0.2,0.7,-0.4])],clean=[Float32Array.from([0.1,0.5,-0.1])];
 const {voice,residual}=dsp.splitStems(source,clean),out=dsp.mixStems(voice,residual);
 for(let i=0;i<3;i++) assert.ok(Math.abs(source[0][i]-out[0][i])<1e-6);
});
test('v2: notch 50 Hz atténue le ronflement',()=>{
 const n=48000,x=Float32Array.from({length:n},(_,i)=>Math.sin(2*Math.PI*50*i/n));
 const y=dsp.notchChannels([x])[0];
 const rms=a=>Math.sqrt(a.slice(24000).reduce((sum,v)=>sum+v*v,0)/24000);
 assert.ok(rms(y)<rms(x)*0.25);
});

test('v2: trois plans fréquentiels reconstituent la source lorsque tous à 100%',()=>{
 const src=[Float32Array.from({length:2000},(_,i)=>.2*Math.sin(i*.03)+.1*Math.sin(i*.5))];
 const output=dsp.mixFrequencyBands(src,1,1,1);
 for(let i=0;i<src[0].length;i++) assert.ok(Math.abs(output[0][i]-src[0][i])<1e-6);
});
test('v2: grave de 50 Hz dominant dans bande basse',()=>{
 const src=[Float32Array.from({length:48000},(_,i)=>Math.sin(2*Math.PI*50*i/48000))];
 const bands=dsp.splitFrequencyBands(src)[0];
 const rms=x=>Math.sqrt(x.slice(12000).reduce((a,b)=>a+b*b,0)/36000);
 assert.ok(rms(bands.low)>rms(bands.high)*2);
});

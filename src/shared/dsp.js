// Petites fonctions audio pures, partagées entre Node (tests) et le renderer.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChutDsp = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Atténuation maximale (dB) appliquée juste sous 100 % ; 100 % = débruitage complet. */
  const MAX_LIMITED_DB = 60;

  /** Intensité 0-100 % → atténuation du bruit en dB (Infinity = sans limite). */
  function intensityToDb(intensity) {
    const i = clamp(Number(intensity) || 0, 0, 100);
    if (i >= 100) return Infinity;
    return (i / 100) * MAX_LIMITED_DB;
  }

  /**
   * Part du signal d'origine à remélanger au signal débruité.
   * 0 % → 1 (rien ne change), 100 % → 0 (signal débruité seul).
   */
  function intensityToDryGain(intensity) {
    const db = intensityToDb(intensity);
    return db === Infinity ? 0 : Math.pow(10, -db / 20);
  }

  /** sortie = (1 - g) · débruité + g · original, canal par canal. */
  function mixChannels(original, denoised, intensity) {
    const g = intensityToDryGain(intensity);
    return original.map((orig, c) => {
      const clean = denoised[c] || denoised[0];
      const out = new Float32Array(orig.length);
      for (let i = 0; i < orig.length; i++) out[i] = (1 - g) * (clean[i] || 0) + g * orig[i];
      return out;
    });
  }

  /** Normalisation de pic prudente, sans écrêtage, plafonnée à +12 dB. */
  function normalizePeak(channels, targetDb = -1, maxBoostDb = 12) {
    let peak = 0;
    for (const ch of channels) for (const sample of ch) {
      if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
    }
    if (peak <= 0) return channels.map(ch => new Float32Array(ch));
    const target = Math.pow(10, targetDb / 20);
    const gain = Math.min(target / peak, Math.pow(10, maxBoostDb / 20));
    return channels.map(ch => Float32Array.from(ch, sample => Number.isFinite(sample) ? Math.max(-1, Math.min(1, sample * gain)) : 0));
  }

  // La couche résiduelle est la différence entre la prise et le résultat DeepFilterNet.
  function splitStems(original, denoised) {
    const voice = original.map((c,i) => fitLength(denoised[i] || denoised[0], c.length));
    const residual = original.map((c,i) => Float32Array.from(c,(v,n)=>v-voice[i][n]));
    return {voice,residual};
  }
  function mixStems(voice,residual,voiceGain=1,residualGain=1) {
    return voice.map((c,i)=>Float32Array.from(c,(v,n)=>v*voiceGain+(residual[i]||residual[0])[n]*residualGain));
  }
  function notchChannels(channels,f=50,rate=48000,q=25) {
    const w=2*Math.PI*f/rate, alpha=Math.sin(w)/(2*q), norm=1+alpha;
    const b0=1/norm,b1=-2*Math.cos(w)/norm,b2=b0,a1=b1,a2=(1-alpha)/norm;
    return channels.map(ch=>{const out=new Float32Array(ch.length);let x1=0,x2=0,y1=0,y2=0;
      for(let i=0;i<ch.length;i++){const x=ch[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;
        out[i]=y;x2=x1;x1=x;y2=y1;y1=y;}return out;});
  }

  // Trois bandes complémentaires : basse ambiance / corps / aigus (pas des objets sonores).
  function splitFrequencyBands(channels,rate=48000) {
    const filter=(ch,frequency)=>{const a=1-Math.exp(-2*Math.PI*frequency/rate);const out=new Float32Array(ch.length);let y=0;for(let i=0;i<ch.length;i++){y+=a*(ch[i]-y);out[i]=y;}return out;};
    return channels.map(ch=>{const low=filter(ch,120),belowMid=filter(ch,1800),mid=new Float32Array(ch.length),high=new Float32Array(ch.length);
      for(let i=0;i<ch.length;i++){mid[i]=belowMid[i]-low[i];high[i]=ch[i]-belowMid[i];}return {low,mid,high};});
  }
  function mixFrequencyBands(channels,lowGain=1,midGain=1,highGain=1,rate=48000) {
    return splitFrequencyBands(channels,rate).map(({low,mid,high})=>Float32Array.from(low,(v,i)=>v*lowGain+mid[i]*midGain+high[i]*highGain));
  }

  /** Ajuste la longueur (troncature ou zéros) pour réaligner avec l'original. */
  function fitLength(samples, length) {
    if (samples.length === length) return samples;
    const out = new Float32Array(length);
    out.set(samples.subarray(0, Math.min(length, samples.length)));
    return out;
  }

  function rmsDb(samples, start = 0, end = samples.length) {
    let sum = 0;
    const n = Math.max(1, end - start);
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / n);
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  }

  /** Pics min/max par colonne, pour dessiner une forme d'onde. */
  function waveformPeaks(samples, columns) {
    const peaks = new Float32Array(columns * 2);
    const step = samples.length / columns;
    for (let x = 0; x < columns; x++) {
      const from = Math.floor(x * step);
      const to = Math.max(from + 1, Math.floor((x + 1) * step));
      let min = 0;
      let max = 0;
      for (let i = from; i < to && i < samples.length; i++) {
        const s = samples[i];
        if (s < min) min = s;
        if (s > max) max = s;
      }
      peaks[x * 2] = min;
      peaks[x * 2 + 1] = max;
    }
    return peaks;
  }

  /** Générateur pseudo-aléatoire déterministe (mulberry32). */
  function prng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Exemple synthétique « voix + souffle » : 1 s de bruit seul, puis des
   * syllabes harmoniques (fondamentale glissante, formants grossiers) dans le bruit.
   * Aucun enregistrement réel : sert à la démo et aux tests.
   */
  function syntheticNoisyVoice({ sampleRate = 48000, seconds = 4, noiseLevel = 0.04, seed = 42 } = {}) {
    const n = Math.round(sampleRate * seconds);
    const voice = new Float32Array(n);
    const noise = new Float32Array(n);
    const rand = prng(seed);
    const voiceStart = sampleRate; // 1 s de bruit seul
    let phase = 0;
    let brown = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      // bruit : blanc + un peu de grave (ventilation)
      const white = rand() * 2 - 1;
      brown = 0.995 * brown + 0.05 * white;
      noise[i] = noiseLevel * (0.8 * white + 0.6 * brown);
      if (i < voiceStart) continue;
      const tv = t - 1;
      const syllable = Math.floor(tv / 0.32);
      const local = (tv % 0.32) / 0.32;
      const envelope = local < 0.75 ? Math.sin((Math.PI * local) / 0.75) ** 2 : 0;
      const f0 = 120 + 25 * Math.sin(2 * Math.PI * 0.7 * tv) + 15 * ((syllable * 7) % 5);
      phase += (2 * Math.PI * f0) / sampleRate;
      const formant = syllable % 2 ? [700, 1200] : [400, 2200];
      let s = 0;
      for (let h = 1; h <= 30; h++) {
        const fh = f0 * h;
        if (fh > sampleRate / 2 - 1000) break;
        const w = Math.exp(-(((fh - formant[0]) / 250) ** 2)) + 0.6 * Math.exp(-(((fh - formant[1]) / 300) ** 2)) + 0.05;
        s += (w / h ** 0.3) * Math.sin(h * phase);
      }
      voice[i] = 0.08 * envelope * s;
    }
    const noisy = new Float32Array(n);
    for (let i = 0; i < n; i++) noisy[i] = voice[i] + noise[i];
    return { sampleRate, voice, noise, noisy, voiceStart };
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  return {
    MAX_LIMITED_DB,
    intensityToDb,
    intensityToDryGain,
    mixChannels,
    splitStems,
    mixStems,
    notchChannels,
    splitFrequencyBands,
    mixFrequencyBands,
    normalizePeak,
    fitLength,
    rmsDb,
    waveformPeaks,
    syntheticNoisyVoice,
  };
});

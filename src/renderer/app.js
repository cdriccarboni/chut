'use strict';
/* global ChutWav, ChutDsp */

const RATE = 48000;
const $ = (id) => document.getElementById(id);
const ui = {
  drop: $('drop'),
  empty: $('empty'),
  wave: $('wave'),
  canvas: $('canvas'),
  time: $('time'),
  status: $('status'),
  file: $('file'),
  pick: $('pick'),
  demo: $('demo'),
  play: $('play'),
  playIcon: $('play-icon'),
  before: $('before'),
  after: $('after'),
  amount: $('amount'),
  amountOut: $('amount-out'),
  exportBtn: $('export'),
  other: $('other'),
};

const state = {
  name: '',
  original: null, // Float32Array[] à 48 kHz
  denoised: null,
  peaksOrig: null,
  peaksClean: null,
  intensity: Number(ui.amount.value),
  mode: 'after',
  busy: false,
  engineAvailable: false,
};

// ---------- Lecture : deux sources synchronisées, on bascule les gains (A/B sans coupure)
const player = {
  ctx: null,
  bufOrig: null,
  bufClean: null,
  gainOrig: null,
  gainClean: null,
  sources: [],
  startedAt: 0,
  offset: 0,
  playing: false,
};

function audioCtx() {
  if (!player.ctx) {
    player.ctx = new AudioContext({ sampleRate: RATE });
    player.gainOrig = player.ctx.createGain();
    player.gainClean = player.ctx.createGain();
    player.gainOrig.connect(player.ctx.destination);
    player.gainClean.connect(player.ctx.destination);
  }
  return player.ctx;
}

function toAudioBuffer(channels) {
  const ctx = audioCtx();
  const buf = ctx.createBuffer(channels.length, channels[0].length, RATE);
  channels.forEach((ch, i) => buf.copyToChannel(ch, i));
  return buf;
}

function duration() {
  return state.original ? state.original[0].length / RATE : 0;
}

function currentTime() {
  if (!player.playing) return player.offset;
  return Math.min(duration(), player.offset + (player.ctx.currentTime - player.startedAt));
}

function applyGains(immediate) {
  if (!player.ctx) return;
  let orig = 1;
  let clean = 0;
  if (state.mode === 'after' && state.denoised) {
    const g = ChutDsp.intensityToDryGain(state.intensity);
    orig = g;
    clean = 1 - g;
  }
  const t = player.ctx.currentTime;
  for (const [node, value] of [[player.gainOrig, orig], [player.gainClean, clean]]) {
    node.gain.cancelScheduledValues(t);
    if (immediate) node.gain.setValueAtTime(value, t);
    else node.gain.setTargetAtTime(value, t, 0.015);
  }
}

function stopSources() {
  for (const s of player.sources) {
    s.onended = null;
    try {
      s.stop();
    } catch {
      /* déjà arrêtée */
    }
  }
  player.sources = [];
}

function play() {
  if (!state.original) return;
  const ctx = audioCtx();
  ctx.resume();
  stopSources();
  if (player.offset >= duration() - 0.01) player.offset = 0;
  const when = ctx.currentTime + 0.03;
  const pairs = [[player.bufOrig, player.gainOrig]];
  if (player.bufClean) pairs.push([player.bufClean, player.gainClean]);
  for (const [buf, gain] of pairs) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.start(when, player.offset);
    player.sources.push(src);
  }
  player.sources[0].onended = () => {
    if (player.playing && currentTime() >= duration() - 0.05) {
      player.playing = false;
      player.offset = 0;
      renderPlayState();
    }
  };
  applyGains(true);
  player.startedAt = when;
  player.playing = true;
  renderPlayState();
  requestAnimationFrame(tick);
}

function pause() {
  player.offset = currentTime();
  player.playing = false;
  stopSources();
  renderPlayState();
}

function seek(seconds) {
  const wasPlaying = player.playing;
  if (wasPlaying) pause();
  player.offset = Math.max(0, Math.min(duration(), seconds));
  if (wasPlaying) play();
  draw();
}

function tick() {
  draw();
  if (player.playing) requestAnimationFrame(tick);
}

// ---------- Dessin de la forme d'onde
function draw() {
  const canvas = ui.canvas;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    computePeaks();
  }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  if (!state.peaksOrig) return;
  const mid = h / 2;
  let peak = 0.05;
  for (let i = 0; i < state.peaksOrig.length; i++) peak = Math.max(peak, Math.abs(state.peaksOrig[i]));
  const scale = (h * 0.46) / peak;
  const cols = state.peaksOrig.length / 2;
  const css = getComputedStyle(document.documentElement);

  // Le bruit d'origine, en fond
  g.fillStyle = css.getPropertyValue('--lip');
  g.globalAlpha = state.mode === 'before' ? 0.85 : 0.35;
  for (let x = 0; x < cols; x++) {
    const min = state.peaksOrig[x * 2];
    const max = state.peaksOrig[x * 2 + 1];
    g.fillRect(x, mid - max * scale, 1, Math.max(1, (max - min) * scale));
  }

  // Ce qu'on entend en mode « Après »
  if (state.peaksClean && state.mode === 'after') {
    const dry = ChutDsp.intensityToDryGain(state.intensity);
    g.fillStyle = css.getPropertyValue('--mint');
    g.globalAlpha = 1;
    for (let x = 0; x < cols; x++) {
      const min = (1 - dry) * state.peaksClean[x * 2] + dry * state.peaksOrig[x * 2];
      const max = (1 - dry) * state.peaksClean[x * 2 + 1] + dry * state.peaksOrig[x * 2 + 1];
      g.fillRect(x, mid - max * scale, 1, Math.max(1, (max - min) * scale));
    }
  }

  // Tête de lecture
  g.globalAlpha = 1;
  const px = (currentTime() / duration()) * w;
  g.fillStyle = css.getPropertyValue('--ink');
  g.fillRect(Math.round(px), 0, Math.max(1, Math.round(dpr * 1.5)), h);
  ui.time.textContent = `${fmt(currentTime())} / ${fmt(duration())}`;
}

function computePeaks() {
  const cols = ui.canvas.width;
  if (!state.original || !cols) return;
  state.peaksOrig = ChutDsp.waveformPeaks(state.original[0], cols);
  state.peaksClean = state.denoised ? ChutDsp.waveformPeaks(state.denoised[0], cols) : null;
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

// ---------- Interface
function setStatus(text, kind) {
  ui.status.textContent = text;
  ui.status.className = `status${kind ? ' ' + kind : ''}`;
}

function renderPlayState() {
  ui.playIcon.setAttribute('d', player.playing ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5v14l11-7z');
  ui.play.setAttribute('aria-label', player.playing ? 'Pause' : 'Lecture');
}

function renderControls() {
  const loaded = !!state.original;
  const ready = loaded && !!state.denoised && !state.busy;
  ui.play.disabled = !loaded || state.busy;
  ui.before.disabled = !ready;
  ui.after.disabled = !ready;
  ui.amount.disabled = !ready;
  ui.exportBtn.disabled = !ready;
  ui.other.disabled = !loaded || state.busy;
  ui.pick.disabled = state.busy;
  ui.demo.disabled = state.busy;
  ui.before.setAttribute('aria-checked', String(state.mode === 'before'));
  ui.after.setAttribute('aria-checked', String(state.mode === 'after'));
  ui.amountOut.textContent = state.intensity >= 100 ? '100 %' : `${state.intensity} %`;
  ui.empty.hidden = loaded;
  ui.wave.hidden = !loaded;
  ui.drop.classList.toggle('loaded', loaded);
}

function setMode(mode) {
  state.mode = mode;
  applyGains(false);
  renderControls();
  draw();
}

async function decodeToChannels(arrayBuffer) {
  // L'OfflineAudioContext à 48 kHz rééchantillonne au format attendu par DeepFilterNet.
  const ctx = new OfflineAudioContext(1, 1, RATE);
  const buf = await ctx.decodeAudioData(arrayBuffer);
  const channels = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) channels.push(new Float32Array(buf.getChannelData(c)));
  return channels;
}

async function loadChannels(channels, name) {
  pause();
  player.offset = 0;
  state.name = name;
  state.original = channels;
  state.denoised = null;
  state.mode = 'after';
  player.bufOrig = toAudioBuffer(channels);
  player.bufClean = null;
  renderControls();
  computePeaks();
  draw();
  await runDenoise();
}

async function runDenoise() {
  if (!state.engineAvailable) {
    setStatus("Le moteur de débruitage est introuvable. Réinstallez CHUT !!! depuis la page des versions.", 'error');
    return;
  }
  state.busy = true;
  renderControls();
  const started = performance.now();
  setStatus(`Débruitage de « ${state.name} »…`, 'busy');
  try {
    const result = await window.chut.denoise({ sampleRate: RATE, channels: state.original });
    state.denoised = result.map((c) => (c instanceof Float32Array ? c : new Float32Array(c)));
    player.bufClean = toAudioBuffer(state.denoised);
    computePeaks();
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    setStatus(`« ${state.name} » débruité en ${secs} s. Comparez avec B, puis exportez.`);
  } catch (err) {
    setStatus(`Le débruitage a échoué : ${cleanError(err)}`, 'error');
  } finally {
    state.busy = false;
    renderControls();
    applyGains(true);
    draw();
  }
}

function cleanError(err) {
  return String((err && err.message) || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

async function openFile(file) {
  if (!file || state.busy) return;
  setStatus(`Lecture de « ${file.name} »…`, 'busy');
  try {
    const channels = await decodeToChannels(await file.arrayBuffer());
    await loadChannels(channels, file.name);
  } catch {
    setStatus(`Impossible de lire « ${file.name} ». Essayez un WAV, MP3, FLAC, OGG ou M4A.`, 'error');
  }
}

async function exportWav() {
  if (!state.denoised) return;
  const mixed = ChutDsp.mixChannels(state.original, state.denoised, state.intensity);
  const bytes = ChutWav.encodeWav(mixed, RATE, { bitDepth: 24 });
  const base = state.name.replace(/\.[^.]+$/, '') || 'audio';
  const saved = await window.chut.saveWav(bytes, `${base} (chut).wav`);
  if (saved) setStatus(`Exporté : « ${saved.split(/[\\/]/).pop()} ».`);
  return { saved, bytes: bytes.byteLength };
}

function loadDemo() {
  const demo = ChutDsp.syntheticNoisyVoice({ sampleRate: RATE, seconds: 6 });
  return loadChannels([demo.noisy], 'exemple synthétique');
}

ui.pick.addEventListener('click', () => ui.file.click());
ui.other.addEventListener('click', () => ui.file.click());
ui.demo.addEventListener('click', loadDemo);
ui.file.addEventListener('change', () => {
  openFile(ui.file.files[0]);
  ui.file.value = '';
});
ui.play.addEventListener('click', () => (player.playing ? pause() : play()));
ui.before.addEventListener('click', () => setMode('before'));
ui.after.addEventListener('click', () => setMode('after'));
ui.amount.addEventListener('input', () => {
  state.intensity = Number(ui.amount.value);
  applyGains(false);
  renderControls();
  draw();
});
ui.exportBtn.addEventListener('click', exportWav);
ui.canvas.addEventListener('click', (e) => {
  const rect = ui.canvas.getBoundingClientRect();
  seek(((e.clientX - rect.left) / rect.width) * duration());
});

for (const type of ['dragenter', 'dragover']) {
  ui.drop.addEventListener(type, (e) => {
    e.preventDefault();
    ui.drop.classList.add('dragging');
  });
}
for (const type of ['dragleave', 'drop']) {
  ui.drop.addEventListener(type, (e) => {
    e.preventDefault();
    ui.drop.classList.remove('dragging');
  });
}
ui.drop.addEventListener('drop', (e) => openFile(e.dataTransfer.files[0]));
// Un fichier lâché ailleurs dans la fenêtre ne doit pas remplacer la page.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  if (e.code === 'Space' && !ui.play.disabled) {
    e.preventDefault();
    player.playing ? pause() : play();
  } else if (e.key.toLowerCase() === 'b' && !ui.before.disabled) {
    setMode(state.mode === 'after' ? 'before' : 'after');
  }
});
window.addEventListener('resize', draw);

// Parcours complet piloté par le test de fumée (CHUT_SMOKE).
window.chutSmoke = async () => {
  await ready;
  await loadDemo();
  if (!state.denoised) return { ok: false, error: ui.status.textContent };
  const noiseEnd = RATE; // 1re seconde : bruit seul
  const before = ChutDsp.rmsDb(state.original[0], 0, noiseEnd);
  const full = ChutDsp.mixChannels(state.original, state.denoised, 100)[0];
  const after = ChutDsp.rmsDb(full, 0, noiseEnd);
  const voiceKept = ChutDsp.rmsDb(full, noiseEnd, full.length);
  const exported = await exportWav();
  draw();
  const reductionDb = before - after;
  return {
    ok: reductionDb > 15 && exported.bytes > 0,
    noiseBeforeDb: before,
    noiseAfterDb: after,
    reductionDb,
    voiceSectionDb: voiceKept,
    export: exported,
  };
};

const ready = window.chut.engineInfo().then((info) => {
  state.engineAvailable = info.available;
  if (!info.available) setStatus('Moteur de débruitage introuvable : lancez « npm run fetch-engine ».', 'error');
});
renderControls();

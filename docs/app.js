// Page de Chut !!! : liens vers la dernière version, système mis en avant, démo avant/après.
(function () {
  'use strict';

  const REPO = 'cdriccarboni/chut';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Système de l'utilisateur ---------- */

  function detectOs() {
    const ua = navigator.userAgent;
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/iPhone|iPad|iPod|Android/i.test(ua)) return null; // pas d'appli mobile : on ne met rien en avant
    if (/Mac/i.test(platform) || /Mac OS X/.test(ua)) return 'mac';
    if (/Win/i.test(platform) || /Windows/.test(ua)) return 'windows';
    if (/Linux|X11|CrOS/i.test(platform + ua)) return 'linux';
    return null;
  }

  const LABELS = {
    mac: 'Télécharger pour Mac',
    windows: 'Télécharger pour Windows',
    linux: 'Télécharger pour Linux',
  };

  const os = detectOs();
  const ctaMain = document.getElementById('cta-main');
  const ctaNote = document.getElementById('cta-note');

  function card(name) {
    return document.querySelector('.os[data-os="' + name + '"]');
  }

  if (os) {
    card(os).classList.add('is-mine');
    ctaMain.textContent = LABELS[os];
    ctaMain.href = card(os).querySelector('.btn').href;
    ctaNote.innerHTML = 'Autre système ? <a href="#telecharger">Toutes les versions</a>';
  }

  // Mac Intel : seul Chromium sait le dire (les Mac Apple Silicon annoncent « arm »).
  if (os === 'mac' && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    navigator.userAgentData
      .getHighEntropyValues(['architecture'])
      .then(function (v) {
        if (v.architecture !== 'x86') return;
        const mac = card('mac');
        const arm = mac.querySelector('[data-asset="mac-arm64.dmg"]');
        const intel = mac.querySelector('[data-asset="mac-x64.dmg"]');
        const armHref = arm.href;
        arm.href = intel.href;
        arm.dataset.asset = 'mac-x64.dmg';
        arm.textContent = 'Télécharger (Intel)';
        intel.href = armHref;
        intel.dataset.asset = 'mac-arm64.dmg';
        intel.textContent = 'Version pour Mac Apple Silicon';
        ctaMain.href = arm.href;
      })
      .catch(function () {});
  }

  /* ---------- Dernière version publiée ---------- */
  // Les liens du HTML pointent déjà vers une version qui existe ; on les met à jour
  // avec la plus récente (pré-versions comprises, que releases/latest ignore).

  fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=10', {
    headers: { Accept: 'application/vnd.github+json' },
  })
    .then(function (r) {
      if (!r.ok) throw new Error('API GitHub : ' + r.status);
      return r.json();
    })
    .then(function (releases) {
      const latest = releases.find(function (r) {
        return !r.draft && r.assets && r.assets.length;
      });
      if (!latest) return;
      document.getElementById('version').textContent = latest.tag_name.replace(/^v/, '');
      document.querySelectorAll('[data-asset]').forEach(function (link) {
        const asset = latest.assets.find(function (a) {
          return a.name.endsWith('-' + link.dataset.asset);
        });
        if (asset) link.href = asset.browser_download_url;
      });
      if (os) ctaMain.href = card(os).querySelector('.btn').href;
    })
    .catch(function () {
      /* hors ligne ou quota atteint : les liens du HTML restent valables */
    });

  /* ---------- Démo avant/après ---------- */

  const player = document.getElementById('player');
  const canvas = document.getElementById('wave');
  const playBtn = document.getElementById('play');
  const btnAvant = document.getElementById('btn-avant');
  const btnApres = document.getElementById('btn-apres');
  const meter = document.getElementById('meter');
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx || !canvas.getContext) return;

  const ctx = new AudioCtx();
  let buffers = null; // { avant, apres }
  let floors = null; // bruit de fond en dB pendant la première seconde (bruit seul)
  let mode = 'avant';
  let mix = 0; // 0 = avant, 1 = après (animé pour la forme d'onde)
  let sources = [];
  let gains = null;
  let startedAt = 0;
  let offset = 0;
  let playing = false;

  function load(name) {
    return fetch('demo/' + name + '.mp3')
      .then(function (r) {
        if (!r.ok) throw new Error(name + ' : ' + r.status);
        return r.arrayBuffer();
      })
      .then(function (data) {
        return new Promise(function (resolve, reject) {
          ctx.decodeAudioData(data, resolve, reject);
        });
      });
  }

  function floorDb(buffer) {
    const s = buffer.getChannelData(0);
    const n = Math.min(s.length, Math.floor(buffer.sampleRate * 0.9));
    let sum = 0;
    for (let i = 0; i < n; i++) sum += s[i] * s[i];
    return 20 * Math.log10(Math.sqrt(sum / n) || 1e-9);
  }

  function formatDb(db) {
    return '−' + Math.abs(Math.round(db)) + ' dB';
  }

  function updateMeter() {
    if (!floors) return;
    meter.textContent =
      mode === 'avant'
        ? 'Bruit de fond : ' + formatDb(floors.avant)
        : 'Bruit de fond : ' + formatDb(floors.apres) + ', soit ' + Math.round(floors.avant - floors.apres) + ' dB de moins';
  }

  Promise.all([load('avant'), load('apres')])
    .then(function (list) {
      buffers = { avant: list[0], apres: list[1] };
      floors = { avant: floorDb(list[0]), apres: floorDb(list[1]) };
      playBtn.disabled = false;
      updateMeter();
      draw();
    })
    .catch(function () {
      meter.textContent = 'La démo n’a pas pu se charger. Rechargez la page pour réessayer.';
    });

  function duration() {
    return buffers ? buffers.avant.duration : 1;
  }

  function position() {
    if (!playing) return offset;
    return Math.min(duration(), offset + ctx.currentTime - startedAt);
  }

  function start() {
    if (offset >= duration() - 0.05) offset = 0;
    gains = { avant: ctx.createGain(), apres: ctx.createGain() };
    gains.avant.gain.value = mode === 'avant' ? 1 : 0;
    gains.apres.gain.value = mode === 'apres' ? 1 : 0;
    const when = ctx.currentTime + 0.03;
    sources = ['avant', 'apres'].map(function (name) {
      const src = ctx.createBufferSource();
      src.buffer = buffers[name];
      src.connect(gains[name]).connect(ctx.destination);
      src.start(when, offset);
      return src;
    });
    sources[0].onended = function () {
      if (playing && position() >= duration() - 0.05) {
        stop();
        offset = 0;
        draw();
      }
    };
    startedAt = when;
    playing = true;
    player.classList.add('is-playing');
    playBtn.setAttribute('aria-label', 'Mettre en pause');
    tick();
  }

  function stop() {
    offset = position();
    playing = false;
    sources.forEach(function (s) {
      s.onended = null;
      try {
        s.stop();
      } catch (e) {
        /* déjà arrêtée */
      }
    });
    sources = [];
    player.classList.remove('is-playing');
    playBtn.setAttribute('aria-label', 'Lire');
  }

  playBtn.addEventListener('click', function () {
    if (!buffers) return;
    ctx.resume();
    if (playing) stop();
    else start();
    draw();
  });

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    player.dataset.mode = mode;
    btnAvant.setAttribute('aria-pressed', String(mode === 'avant'));
    btnApres.setAttribute('aria-pressed', String(mode === 'apres'));
    if (gains) {
      // Fondu enchaîné très court : pas de clic, pas de coupure.
      const t = ctx.currentTime;
      gains.avant.gain.setTargetAtTime(mode === 'avant' ? 1 : 0, t, 0.015);
      gains.apres.gain.setTargetAtTime(mode === 'apres' ? 1 : 0, t, 0.015);
    }
    updateMeter();
    animateMix();
  }

  btnAvant.addEventListener('click', function () {
    setMode('avant');
  });
  btnApres.addEventListener('click', function () {
    setMode('apres');
  });

  canvas.addEventListener('click', function (e) {
    if (!buffers) return;
    const rect = canvas.getBoundingClientRect();
    const wasPlaying = playing;
    if (playing) stop();
    offset = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration();
    if (wasPlaying) start();
    draw();
  });

  /* Forme d'onde : les barres du bruit s'affaissent quand on passe à « Avec Chut !!! ». */

  let peaks = null;
  let peaksFor = 0;

  function columnPeaks(buffer, columns) {
    const s = buffer.getChannelData(0);
    const step = s.length / columns;
    const out = new Float32Array(columns);
    for (let x = 0; x < columns; x++) {
      let max = 0;
      const to = Math.floor((x + 1) * step);
      for (let i = Math.floor(x * step); i < to; i++) {
        const v = Math.abs(s[i]);
        if (v > max) max = v;
      }
      out[x] = max;
    }
    return out;
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!buffers) return;

    const bar = 3;
    const gap = 2;
    const columns = Math.max(20, Math.floor(w / (bar + gap)));
    if (!peaks || peaksFor !== columns) {
      peaks = { avant: columnPeaks(buffers.avant, columns), apres: columnPeaks(buffers.apres, columns) };
      peaksFor = columns;
    }
    let top = 0;
    for (let i = 0; i < columns; i++) top = Math.max(top, peaks.avant[i], peaks.apres[i]);
    const played = (position() / duration()) * columns;
    const mid = h / 2;
    const done = mix > 0.5 ? '#8fe3c5' : '#ff7a9a';
    for (let i = 0; i < columns; i++) {
      const v = peaks.avant[i] * (1 - mix) + peaks.apres[i] * mix;
      const half = Math.max(1, (v / top) * (mid - 2));
      g.fillStyle = i < played ? done : 'rgba(243, 236, 247, 0.28)';
      g.fillRect(i * (bar + gap), mid - half, bar, half * 2);
    }
  }

  let mixAnim = 0;
  function animateMix() {
    const target = mode === 'apres' ? 1 : 0;
    cancelAnimationFrame(mixAnim);
    if (reduceMotion) {
      mix = target;
      draw();
      return;
    }
    const from = mix;
    const t0 = performance.now();
    (function step(now) {
      const k = Math.min(1, (now - t0) / 450);
      mix = from + (target - from) * (1 - Math.pow(1 - k, 3));
      draw();
      if (k < 1) mixAnim = requestAnimationFrame(step);
    })(t0);
  }

  function tick() {
    if (!playing) return;
    draw();
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', draw);
})();

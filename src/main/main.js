'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const engine = require('./engine');

const APP_NAME = 'Chut!';
const APP_ROOT = path.join(__dirname, '..', '..');
const SMOKE_DIR = process.env.CHUT_SMOKE || null;

app.setName(APP_NAME);

let mainWindow = null;
let enginePath = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 740,
    minWidth: 720,
    minHeight: 560,
    title: APP_NAME,
    backgroundColor: '#0d1117',
    show: !SMOKE_DIR,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: !SMOKE_DIR,
    },
  });

  // Aucune navigation ni fenêtre externe : l'appli reste 100 % locale.
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://github.com/')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  if (SMOKE_DIR) mainWindow.webContents.once('did-finish-load', runSmokeTest);
}

ipcMain.handle('chut:engine-info', () => ({
  available: !!enginePath,
  sampleRate: engine.ENGINE_SAMPLE_RATE,
  smoke: !!SMOKE_DIR,
}));

ipcMain.handle('chut:denoise', async (_event, audio) => {
  const channels = await engine.denoise(enginePath, {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((c) => (c instanceof Float32Array ? c : new Float32Array(c))),
  });
  return channels;
});

ipcMain.handle('chut:save-wav', async (_event, bytes, suggestedName) => {
  const data = Buffer.from(bytes);
  if (SMOKE_DIR) {
    const target = path.join(SMOKE_DIR, 'export.wav');
    fs.writeFileSync(target, data);
    return target;
  }
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter le fichier débruité',
    defaultPath: path.join(app.getPath('music'), suggestedName || 'chut.wav'),
    filters: [{ name: 'Audio WAV', extensions: ['wav'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, data);
  return filePath;
});

// Test de fumée : CHUT_SMOKE=<dossier> lance le parcours complet sur un exemple synthétique.
async function runSmokeTest() {
  let code = 1;
  try {
    fs.mkdirSync(SMOKE_DIR, { recursive: true });
    const result = await mainWindow.webContents.executeJavaScript('window.chutSmoke()');
    await new Promise((r) => setTimeout(r, 500));
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(path.join(SMOKE_DIR, 'screenshot.png'), image.toPNG());
    fs.writeFileSync(path.join(SMOKE_DIR, 'result.json'), JSON.stringify(result, null, 2));
    code = result && result.ok ? 0 : 1;
  } catch (err) {
    fs.writeFileSync(path.join(SMOKE_DIR, 'result.json'), JSON.stringify({ ok: false, error: String(err) }));
  }
  app.exit(code);
}

if (!SMOKE_DIR && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    enginePath = engine.resolveEngine({
      resourcesPath: app.isPackaged ? process.resourcesPath : null,
      appRoot: APP_ROOT,
    });
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || SMOKE_DIR) app.quit();
  });
}

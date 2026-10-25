'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chut', {
  engineInfo: () => ipcRenderer.invoke('chut:engine-info'),
  denoise: (audio) => ipcRenderer.invoke('chut:denoise', audio),
  saveWav: (bytes, suggestedName) => ipcRenderer.invoke('chut:save-wav', bytes, suggestedName),
});

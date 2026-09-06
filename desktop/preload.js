'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tshowDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  play: (payload) => ipcRenderer.invoke('tshow:play', payload)
}));

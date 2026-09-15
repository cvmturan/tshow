'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tshowDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  embeddedPlayback: process.platform === 'win32',
  stop: () => ipcRenderer.invoke('tshow:stop'),
  onPlayback: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('tshow:playback', listener);
    return () => ipcRenderer.removeListener('tshow:playback', listener);
  },
  play: (payload) => ipcRenderer.invoke('tshow:play', payload)
}));

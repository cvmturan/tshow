'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { preparePlaybackRequest } = require('./security');
const { launchPlayer } = require('./player');

const APP_ORIGIN = 'https://showt.fun';
let mainWindow;

function isTrustedSender(event) {
  try {
    return new URL(event.senderFrame.url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#090a0d',
    autoHideMenuBar: true,
    title: 'TShow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== APP_ORIGIN) {
        event.preventDefault();
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.loadURL(`${APP_ORIGIN}/?desktop=1`);
}

ipcMain.handle('tshow:play', async (event, payload) => {
  if (!isTrustedSender(event)) return { ok: false, error: 'Untrusted playback request.' };
  try {
    const request = await preparePlaybackRequest(payload);
    const result = await launchPlayer(request, {
      resourcesPath: app.isPackaged ? process.resourcesPath : path.join(__dirname, 'vendor')
    });
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error.message || 'The local player could not be opened.' };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

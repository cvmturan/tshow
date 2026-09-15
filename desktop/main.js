'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const { preparePlaybackRequest } = require('./security');
const { launchPlayer } = require('./player');
const { EmbeddedPlayer } = require('./embedded-player');

const APP_ORIGIN = 'https://showt.fun';
let mainWindow;
let playback;
let playbackRequest = 0;
const resourcesPath = () => app.isPackaged ? process.resourcesPath : path.join(__dirname, 'vendor');
function restoreBrowse() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.focus();
}
function playbackMenu() {
  mainWindow.setMenu(Menu.buildFromTemplate([
    { label: '← Back to sources', click: () => { playbackRequest++; playback.stop(); } },
    { label: 'Playback', submenu: [
      { label: 'Play / pause', click: () => playback.command(['cycle', 'pause']) },
      { label: 'Subtitles — next track', click: () => playback.command(['cycle', 'sid']) },
      { label: 'Audio — next track', click: () => playback.command(['cycle', 'aid']) },
      { label: 'Seek back 10 seconds', click: () => playback.command(['seek', -10]) },
      { label: 'Seek forward 10 seconds', click: () => playback.command(['seek', 10]) },
      { label: 'Normal speed', click: () => playback.command(['set_property', 'speed', 1]) },
      { label: 'Speed 1.25×', click: () => playback.command(['set_property', 'speed', 1.25]) }
    ] }
  ]));
  mainWindow.setMenuBarVisibility(true);
}

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
  playback = new EmbeddedPlayer({ resourcesPath: resourcesPath(), onEvent: event => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('tshow:playback', event);
    if (event.type === 'closed') restoreBrowse();
  } });
  mainWindow.on('closed', () => { playbackRequest++; playback.stop(); });
  mainWindow.webContents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace) { playbackRequest++; playback.stop(); }
  });
  mainWindow.loadURL(`${APP_ORIGIN}/?desktop=1`);
}

ipcMain.handle('tshow:stop', event => {
  if (!isTrustedSender(event)) return;
  playbackRequest++;
  playback?.stop();
});

ipcMain.handle('tshow:play', async (event, payload) => {
  if (!isTrustedSender(event)) return { ok: false, error: 'Untrusted playback request.' };
  const generation = ++playbackRequest;
  try {
    const request = await preparePlaybackRequest(payload);
    if (generation !== playbackRequest || !mainWindow || mainWindow.isDestroyed()) return { ok: false, error: 'Playback cancelled.' };
    if (request.preferredPlayer === 'vlc' || process.platform !== 'win32') {
      playback.stop();
      return { ok: true, ...await launchPlayer(request, { resourcesPath: resourcesPath() }) };
    }
    playback.stop();
    playbackMenu();
    const result = await playback.start(request, mainWindow.getNativeWindowHandle().readUInt32LE(0), {
      sessionId: typeof payload.sessionId === 'string' ? payload.sessionId.slice(0, 128) : '',
      start: Number.isFinite(payload.start) ? payload.start : 0
    });
    if (!result.ok && generation === playbackRequest) restoreBrowse();
    return result;
  } catch (error) {
    if (generation === playbackRequest) restoreBrowse();
    return { ok: false, error: error.message || 'The video could not be opened.' };
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

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function playerArguments(kind, request) {
  if (kind === 'mpv') {
    const args = [
      '--no-config',
      '--load-scripts=no',
      '--ytdl=no',
      '--force-window=immediate',
      '--keep-open=yes',
      '--idle=yes',
      '--osc=yes',
      '--input-default-bindings=yes',
      '--cursor-autohide=1000',
      '--osd-on-seek=msg-bar',
      '--no-terminal',
      `--title=TShow Player — ${request.title}`
    ];
    const fields = Object.entries(request.headers).map(([name, value]) => `${name}: ${value}`);
    if (fields.length) args.push(`--http-header-fields=${fields.join(',')}`);
    args.push(request.url);
    return args;
  }

  const args = ['--no-one-instance', '--no-play-and-exit', '--no-video-title-show', `--meta-title=${request.title}`];
  if (request.headers.Referer) args.push(`--http-referrer=${request.headers.Referer}`);
  if (request.headers['User-Agent']) args.push(`--http-user-agent=${request.headers['User-Agent']}`);
  args.push(request.url);
  return args;
}

function bundledPlayerPath(resourcesPath, platform = process.platform) {
  if (!resourcesPath || platform !== 'win32') return null;
  return path.win32.join(resourcesPath, 'mpv', 'mpv.exe');
}

function knownPlayerPaths(platform = process.platform, env = process.env) {
  const custom = env.TSHOW_PLAYER_PATH ? [env.TSHOW_PLAYER_PATH] : [];
  if (platform === 'win32') {
    return [...custom,
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'mpv', 'mpv.exe'),
      env.ProgramFiles && path.join(env.ProgramFiles, 'mpv', 'mpv.exe'),
      env.ProgramFiles && path.join(env.ProgramFiles, 'VideoLAN', 'VLC', 'vlc.exe'),
      env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'VideoLAN', 'VLC', 'vlc.exe')
    ].filter(Boolean);
  }
  if (platform === 'darwin') {
    return [...custom,
      '/opt/homebrew/bin/mpv', '/usr/local/bin/mpv',
      '/Applications/VLC.app/Contents/MacOS/VLC'
    ];
  }
  return [...custom, '/usr/bin/mpv', '/usr/local/bin/mpv', '/usr/bin/vlc', '/usr/local/bin/vlc'];
}

function playerKind(executable) {
  return /vlc(?:\.exe)?$/i.test(executable) ? 'vlc' : 'mpv';
}

async function locateOnPath(command, platform = process.platform) {
  try {
    const lookupCommand = platform === 'win32' ? 'where.exe' : 'which';
    const { stdout } = await execFileAsync(lookupCommand, [command], { windowsHide: true, timeout: 3000 });
    return String(stdout).split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
  } catch {
    return null;
  }
}

async function findPlayer(platform = process.platform, env = process.env, resourcesPath, preferredPlayer = null) {
  const bundled = preferredPlayer === 'vlc' ? null : bundledPlayerPath(resourcesPath, platform);
  if (bundled && fs.existsSync(bundled)) {
    return { executable: bundled, kind: 'mpv', bundled: true };
  }
  const known = knownPlayerPaths(platform, env).find((candidate) =>
    fs.existsSync(candidate) && (!preferredPlayer || playerKind(candidate) === preferredPlayer)
  );
  if (known) return { executable: known, kind: playerKind(known), bundled: false };
  const names = preferredPlayer === 'vlc'
    ? (platform === 'win32' ? ['vlc.exe'] : ['vlc'])
    : (platform === 'win32' ? ['mpv.exe', 'vlc.exe'] : ['mpv', 'vlc']);
  for (const name of names) {
    const executable = await locateOnPath(name, platform);
    if (executable) return { executable, kind: playerKind(executable), bundled: false };
  }
  return null;
}

async function launchPlayer(request, dependencies = {}) {
  const player = await (dependencies.findPlayer || findPlayer)(
    dependencies.platform || process.platform,
    dependencies.env || process.env,
    dependencies.resourcesPath,
    request.preferredPlayer
  );
  if (!player) throw new Error(request.preferredPlayer === 'vlc'
    ? 'VLC is not installed in a standard location on this computer.'
    : 'The TShow playback engine is missing. Reinstall the latest TShow Desktop build.');
  const spawnProcess = dependencies.spawn || spawn;
  return new Promise((resolve, reject) => {
    let child, settled = false, timer;
    const fail = message => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(message));
    };
    try {
      child = spawnProcess(player.executable, playerArguments(player.kind, request), {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
    } catch { fail('The player could not be started. Reinstall it and try again.'); return; }
    child.once('error', error => {
      const reason = error.code === 'ENOENT' ? 'The player executable was not found.' :
        error.code === 'EACCES' ? 'Windows denied permission to start the player.' :
        'Windows could not start the player (' + (error.code || 'launch error') + ').';
      fail(reason + ' Reinstall the latest player build and try again.');
    });
    child.once('exit', (code, signal) => {
      fail('The player closed before it was ready' + (code != null ? ' (exit ' + code + ')' : '') +
        '. Try another source; if this also happens with the player test video, reinstall the player.');
    });
    child.once('spawn', () => {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.unref?.();
        resolve({ player: player.bundled ? 'TShow Player' : player.kind, bundled: player.bundled });
      }, dependencies.startupWaitMs ?? 1500);
    });
  });

}

module.exports = { playerArguments, bundledPlayerPath, knownPlayerPaths, playerKind, findPlayer, launchPlayer };

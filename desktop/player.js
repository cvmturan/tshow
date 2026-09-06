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
      '--keep-open=no',
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

  const args = ['--play-and-exit', '--no-video-title-show', `--meta-title=${request.title}`];
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

async function findPlayer(platform = process.platform, env = process.env, resourcesPath) {
  const bundled = bundledPlayerPath(resourcesPath, platform);
  if (bundled && fs.existsSync(bundled)) {
    return { executable: bundled, kind: 'mpv', bundled: true };
  }
  const known = knownPlayerPaths(platform, env).find((candidate) => fs.existsSync(candidate));
  if (known) return { executable: known, kind: playerKind(known), bundled: false };
  const names = platform === 'win32' ? ['mpv.exe', 'vlc.exe'] : ['mpv', 'vlc'];
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
    dependencies.resourcesPath
  );
  if (!player) throw new Error('The TShow playback engine is missing. Reinstall the latest TShow Desktop build.');
  const spawnProcess = dependencies.spawn || spawn;
  const child = spawnProcess(player.executable, playerArguments(player.kind, request), {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  child.unref?.();
  return { player: player.bundled ? 'TShow Player' : player.kind, bundled: player.bundled };
}

module.exports = {
  playerArguments,
  bundledPlayerPath,
  knownPlayerPaths,
  playerKind,
  findPlayer,
  launchPlayer
};

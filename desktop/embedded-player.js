'use strict';

const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { bundledPlayerPath, playerArguments } = require('./player');

function embeddedArguments(request, { windowId, pipe, resourcesPath, start = 0 }) {
  if (!Number.isInteger(windowId) || windowId <= 0 || windowId > 0xffffffff) throw new Error('Invalid playback window.');
  const args = playerArguments('mpv', request);
  args.pop();
  return [...args, `--wid=${windowId}`, '--idle=no', '--keep-open=no',
    `--input-ipc-server=${pipe}`, `--input-conf=${path.join(resourcesPath, 'embedded-input.conf')}`,
    '--osd-playing-msg=Esc: back to sources | Space: pause | J: subtitles | #: audio',
    `--start=${Number.isFinite(start) ? Math.max(0, Math.min(start, 604800)) : 0}`, request.url];
}

// Each session owns its process, connection and timers. Old events cannot reach a new title.
class EmbeddedPlayer {
  constructor({ resourcesPath, spawnProcess = spawn, connect = net.createConnection, onEvent = () => {} }) {
    Object.assign(this, { resourcesPath, spawnProcess, connect, onEvent });
    this.session = null;
  }

  stop() {
    const session = this.session;
    if (!session) return;
    this.session = null;
    clearTimeout(session.retry);
    clearTimeout(session.deadline);
    session.socket?.destroy();
    session.child?.kill();
    session.resolve?.({ ok: false, error: 'Playback cancelled.' });
    this.onEvent({ type: 'closed', sessionId: session.id });
  }

  command(command) {
    const socket = this.session?.socket;
    if (socket && !socket.destroyed && socket.writable) socket.write(JSON.stringify({ command }) + '\n');
  }

  start(request, windowId, { sessionId, start = 0 } = {}) {
    this.stop();
    const session = { id: sessionId, position: 0, duration: 0 };
    this.session = session;
    const pipe = '\\\\.\\pipe\\tshow-' + randomUUID();
    const active = () => this.session === session;
    const emit = event => { if (active()) this.onEvent({ ...event, sessionId: session.id }); };
    return new Promise(resolve => {
      session.resolve = resolve;
      const fail = () => {
        if (!active()) return;
        emit({ type: 'error', error: 'This source could not play. Choose another link.' });
        resolve({ ok: false, error: 'This source could not play. Choose another link.' });
        this.stop();
      };
      try {
        session.child = this.spawnProcess(bundledPlayerPath(this.resourcesPath),
          embeddedArguments(request, { windowId, pipe, resourcesPath: this.resourcesPath, start }),
          { detached: false, stdio: 'ignore', windowsHide: true });
      } catch { fail(); return; }
      session.child.once('error', fail);
      session.child.once('exit', code => {
        if (!active()) return;
        if (code !== 0) fail();
        else this.stop();
      });
      session.deadline = setTimeout(fail, 30000);
      const attach = () => {
        if (!active()) return;
        let buffer = '';
        const socket = this.connect(pipe);
        session.socket = socket;
        socket.once('connect', () => {
          if (!active()) return socket.destroy();
          this.command(['observe_property', 1, 'time-pos']);
          this.command(['observe_property', 2, 'duration']);
          resolve({ ok: true, embedded: true, player: 'TShow' });
        });
        socket.on('error', () => {
          socket.destroy();
          if (active()) session.retry = setTimeout(attach, 100);
        });
        socket.on('data', chunk => {
          if (!active()) return;
          buffer += chunk.toString();
          if (buffer.length > 262144) return fail();
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
            let message;
            try { message = JSON.parse(line); } catch { continue; }
            if (message.event === 'file-loaded') { clearTimeout(session.deadline); emit({ type: 'playing' }); }
            if (message.event === 'end-file' && message.reason === 'error') { fail(); return; }
            if (message.event === 'property-change') {
              if (message.name === 'duration' && Number.isFinite(message.data)) session.duration = message.data;
              if (message.name === 'time-pos' && Number.isFinite(message.data)) {
                clearTimeout(session.deadline);
                session.position = message.data;
                emit({ type: 'progress', position: session.position, duration: session.duration });
              }
            }
          }
        });
      };
      attach();
    });
  }
}

module.exports = { EmbeddedPlayer, embeddedArguments };

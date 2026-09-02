const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { decodeHeaders } = require('./proxy');
const addonManager = require('../core/addonManager');

const router = express.Router();

const MAX_SESSIONS = 3;
const IDLE_MS = 3 * 60 * 1000;
const TRANSCODE_SIGNING_KEY = Buffer.from(
  process.env.TRANSCODE_SIGNING_SECRET || crypto.randomBytes(32).toString('hex')
);

let ffmpegPath = null;
try {
  const resolved = require('ffmpeg-static');
  if (resolved && fs.existsSync(resolved)) ffmpegPath = resolved;
} catch {
  // Optional dependency: transcoding stays disabled when the binary is absent.
}

const sessions = new Map();

function isAvailable() {
  return Boolean(ffmpegPath);
}

function encodePayload(params) {
  const data = Buffer.from(JSON.stringify(params)).toString('base64url');
  if (data.length > 5500) return null;
  const signature = crypto.createHmac('sha256', TRANSCODE_SIGNING_KEY)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

function decodePayload(payload) {
  if (!payload || payload.length > 5600) return null;
  try {
    const [data, signature, extra] = String(payload).split('.');
    if (!data || !signature || extra) return null;
    const expected = crypto.createHmac('sha256', TRANSCODE_SIGNING_KEY)
      .update(data)
      .digest('base64url');
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (
      actualBytes.length !== expectedBytes.length ||
      !crypto.timingSafeEqual(actualBytes, expectedBytes)
    ) return null;

    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.src !== 'string' || parsed.src.length > 8192) return null;
    return { src: parsed.src, h: typeof parsed.h === 'string' ? parsed.h : null, vc: parsed.vc === 'reencode' ? 'reencode' : 'copy' };
  } catch {
    return null;
  }
}

function sessionPath(params) {
  if (!isAvailable()) return null;
  const payload = encodePayload(params);
  if (!payload) return null;
  return `/api/transcode/p/${encodeURIComponent(payload)}/index.m3u8`;
}

function buildArgs(params, dir) {
  const args = ['-hide_banner', '-loglevel', 'warning', '-fflags', '+genpts'];
  if (/^https?:/i.test(params.src)) {
    args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
  }
  const headers = decodeHeaders(params.h);
  const entries = Object.entries(headers);
  if (entries.length) {
    args.push('-headers', entries.map(([key, value]) => `${key}: ${value}\r\n`).join(''));
    if (headers['user-agent']) args.push('-user_agent', headers['user-agent']);
  }
  args.push('-i', params.src);
  args.push('-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn');
  if (params.vc === 'reencode') {
    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '25',
      '-vf', 'scale=-2:720',
      '-force_key_frames', 'expr:gte(t,n_forced*2)'
    );
  } else {
    args.push('-c:v', 'copy');
  }
  args.push(
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '6',
    '-hls_delete_threshold', '10',
    '-hls_flags', 'delete_segments+independent_segments+temp_file',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_segment_filename', path.join(dir, 'seg-%05d.m4s'),
    path.join(dir, 'index.m3u8')
  );
  return args;
}

function stopSession(session) {
  session.stopped = true;
  if (session.proc && session.proc.exitCode === null) {
    try {
      session.proc.kill();
    } catch {
      // Already gone.
    }
  }
  fs.rm(session.dir, { recursive: true, force: true }, () => {});
}

function cleanupStaleSessionDirs() {
  try {
    for (const name of fs.readdirSync(os.tmpdir())) {
      if (!/^streamflix-transcode-/.test(name)) continue;
      const full = path.join(os.tmpdir(), name);
      try {
        if (Date.now() - fs.statSync(full).mtimeMs > IDLE_MS) {
          fs.rmSync(full, { recursive: true, force: true });
        }
      } catch {
        // Directory vanished or is in use; leave it to the next sweep.
      }
    }
  } catch {
    // Temp directory unreadable; nothing to clean.
  }
}
cleanupStaleSessionDirs();

function ensureSession(payload, callback) {
  const params = decodePayload(payload);
  if (!params) {
    return callback(new Error('Invalid transcode request.'));
  }

  let session = sessions.get(payload);
  if (session && !session.stopped) {
    session.lastAccess = Date.now();
    return callback(null, session);
  }

  if (!isAvailable()) {
    return callback(new Error('Server-side conversion is unavailable because ffmpeg could not be loaded.'));
  }

  addonManager.validateRemoteURL(params.src).then((validatedSource) => {
    params.src = validatedSource;
    startSession(payload, params, callback);
  }).catch((error) => callback(error));
}

function startSession(payload, params, callback) {
  const active = Array.from(sessions.values()).filter((entry) => !entry.stopped);
  if (active.length >= MAX_SESSIONS) {
    return callback(new Error('Too many conversions are already running. Stop another video first.'));
  }

  const sid = crypto.createHash('sha1').update(payload).digest('hex');
  const dir = path.join(os.tmpdir(), `streamflix-transcode-${sid}`);
  fs.mkdir(dir, { recursive: true }, (mkdirError) => {
    if (mkdirError) return callback(mkdirError);

    session = {
      dir,
      proc: spawn(ffmpegPath, buildArgs(params, dir), { windowsHide: true, cwd: dir }),
      stderrTail: '',
      startedAt: Date.now(),
      lastAccess: Date.now(),
      stopped: false
    };
    sessions.set(payload, session);

    session.proc.stderr.on('data', (chunk) => {
      session.stderrTail = (session.stderrTail + chunk.toString()).slice(-2000);
    });
    session.proc.once('exit', (code) => {
      if (!session.stopped) {
        // Keep completed VOD playlists and segments available to the player.
        // The idle-session sweep removes them after playback stops.
        session.exitCode = code;
        session.lastAccess = Date.now();
      }
    });

    callback(null, session);
  });
}

function waitForPlaylist(session, timeoutMs, callback) {
  const playlistFile = path.join(session.dir, 'index.m3u8');
  const startedAt = Date.now();
  const poll = () => {
    if (fs.existsSync(playlistFile)) return callback(null);
    if (session.proc.exitCode !== null && session.proc.exitCode !== 0) {
      const tail = session.stderrTail.split('\n').filter(Boolean).slice(-2).join(' ');
      return callback(new Error(`Conversion failed to start. ${tail || `ffmpeg exited with code ${session.proc.exitCode}.`}`));
    }
    if (Date.now() - startedAt > timeoutMs) {
      return callback(new Error('The converter took too long to produce a playable stream.'));
    }
    setTimeout(poll, 300);
  };
  poll();
}

function waitForFile(session, file, timeoutMs, callback) {
  const filePath = path.join(session.dir, file);
  const startedAt = Date.now();
  const poll = () => {
    if (fs.existsSync(filePath)) return callback(null);
    if (session.proc.exitCode !== null) {
      return callback(new Error('The converter stopped before this part was ready.'));
    }
    if (Date.now() - startedAt > timeoutMs) {
      return callback(new Error('Segment not produced yet.'));
    }
    setTimeout(poll, 250);
  };
  poll();
}

router.get('/p/:payload/:file', async (req, res) => {
  const file = String(req.params.file || '');
  if (!/^index\.m3u8$|^init\.mp4$|^seg-\d{5}\.m4s$/.test(file)) {
    return res.status(404).json({ error: 'Not found' });
  }

  ensureSession(req.params.payload, (error, session) => {
    if (error) return res.status(error.message.includes('Too many') ? 429 : 502).json({ error: error.message });

    const filePath = path.join(session.dir, file);
    const deliver = () => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', file.endsWith('.m4s')
        ? 'video/iso.segment'
        : file.endsWith('.mp4')
          ? 'video/mp4'
          : 'application/vnd.apple.mpegurl');
      res.sendFile(filePath, (sendError) => {
        if (sendError && !res.headersSent) res.status(sendError.statusCode || 500).end();
      });
    };

    if (file === 'index.m3u8') {
      waitForPlaylist(session, 90_000, (waitError) => {
        if (waitError) return res.status(502).json({ error: waitError.message });
        session.lastAccess = Date.now();
        deliver();
      });
      return;
    }

    fs.stat(filePath, (statError, stats) => {
      if (!statError && stats.isFile()) {
        session.lastAccess = Date.now();
        return deliver();
      }
      if (file === 'init.mp4') {
        // Players cannot start without the init segment; give the encoder a moment.
        return waitForFile(session, file, 20_000, (waitError) => {
          if (waitError) return res.status(502).json({ error: waitError.message });
          session.lastAccess = Date.now();
          deliver();
        });
      }
      res.status(502).json({ error: 'Segment not produced yet.' });
    });
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [payload, session] of sessions.entries()) {
    if (now - session.lastAccess > IDLE_MS) {
      stopSession(session);
      sessions.delete(payload);
    }
  }
}, 60_000).unref?.();

for (const signal of ['exit', 'SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    for (const session of sessions.values()) stopSession(session);
  });
}

router.sessionPath = sessionPath;
router.isAvailable = isAvailable;
router.buildArgs = buildArgs;
router.decodePayload = decodePayload;

module.exports = router;

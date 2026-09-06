'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPrivateAddress,
  validatePlaybackURL,
  sanitizePlaybackHeaders,
  preparePlaybackRequest
} = require('../security');
const { playerArguments, playerKind } = require('../player');

const publicLookup = async () => [{ address: '8.8.8.8', family: 4 }];

test('private and loopback addresses are rejected', async () => {
  for (const address of ['127.0.0.1', '10.0.0.4', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1']) {
    assert.equal(isPrivateAddress(address), true);
  }
  await assert.rejects(() => validatePlaybackURL('https://127.0.0.1/video.mp4'), /private/i);
  await assert.rejects(() => validatePlaybackURL('http://media.example/video.mp4', publicLookup), /https/i);
});

test('public HTTPS media URLs and safe playback headers are preserved', async () => {
  const request = await preparePlaybackRequest({
    url: 'https://media.example/video.mp4?token=abc',
    title: 'Example movie',
    behaviorHints: {
      proxyHeaders: {
        request: {
          Referer: 'https://provider.example/',
          'User-Agent': 'TShow test',
          Cookie: 'must-not-be-forwarded',
          Authorization: 'must-not-be-forwarded'
        }
      }
    }
  }, publicLookup);
  assert.equal(request.url, 'https://media.example/video.mp4?token=abc');
  assert.deepEqual(request.headers, {
    Referer: 'https://provider.example/',
    'User-Agent': 'TShow test'
  });
});

test('unsafe headers and embedded credentials are rejected', async () => {
  assert.deepEqual(sanitizePlaybackHeaders({
    headers: { Referer: 'https://safe.example/\r\nX-Bad: yes', 'X-Test': 'no' }
  }), {});
  await assert.rejects(
    () => validatePlaybackURL('https://user:pass@media.example/video.mp4', publicLookup),
    /credentials/i
  );
});

test('mpv and VLC arguments are built without a shell', () => {
  const request = {
    url: 'https://media.example/video.m3u8',
    title: 'Example',
    headers: { Referer: 'https://provider.example/', 'User-Agent': 'TShow' }
  };
  const mpv = playerArguments('mpv', request);
  const vlc = playerArguments('vlc', request);
  assert.ok(mpv.some((value) => value.startsWith('--http-header-fields=')));
  assert.ok(vlc.includes('--http-referrer=https://provider.example/'));
  assert.equal(mpv.at(-1), request.url);
  assert.equal(vlc.at(-1), request.url);
  assert.equal(playerKind('C:\\Program Files\\VideoLAN\\VLC\\vlc.exe'), 'vlc');
});

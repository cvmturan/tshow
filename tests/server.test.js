const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const testAddonFile = path.join(os.tmpdir(), `streamflix-addons-${process.pid}.json`);
fs.writeFileSync(testAddonFile, '[]', 'utf8');

process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.TMDB_API_KEY = '';
process.env.ADDON_REPOSITORY_URL = '';
process.env.CUSTOM_ADDONS_FILE = testAddonFile;
process.env.ALLOW_PRIVATE_ADDONS = 'false';

const { startServer } = require('../server');
const streamRouter = require('../src/api/streams');
const transcodeRouter = require('../src/api/transcode');
const addonManager = require('../src/core/addonManager');

let server;
let baseURL;

before(async () => {
  server = await startServer({ host: '127.0.0.1', port: 0 });
  const address = server.address();
  baseURL = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  fs.rmSync(testAddonFile, { force: true });
});

async function getJSON(route, options) {
  const response = await fetch(`${baseURL}${route}`, options);
  const data = await response.json();
  return { response, data };
}

test('mobile HLS playlists use a client-reachable relative init segment', () => {
  const args = transcodeRouter.buildArgs({
    src: 'https://media.example/video.mp4',
    vc: 'reencode'
  }, 'C:\\temp\\streamflix-test');
  const optionIndex = args.indexOf('-hls_fmp4_init_filename');
  assert.ok(optionIndex >= 0);
  assert.equal(args[optionIndex + 1], 'init.mp4');
  assert.ok(!path.isAbsolute(args[optionIndex + 1]));
});

test('health endpoint reports a ready local server', async () => {
  const { response, data } = await getJSON('/api/health');
  assert.equal(response.status, 200);
  assert.equal(data.status, 'ok');
  assert.equal(data.version, '1.1.0');
  assert.equal(data.hostScope, 'local');
  assert.equal(data.tmdbConfigured, false);
});

test('catalog falls back to useful offline sample data', async () => {
  const { response, data } = await getJSON('/api/tmdb/discover/movies');
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data.results));
  assert.ok(data.results.length >= 6);
  assert.equal(data.results[0].title, 'The Shawshank Redemption');
});

test('safe built-in add-ons are loaded and Torrentio is not bundled', async () => {
  const { response, data } = await getJSON('/api/addons');
  assert.equal(response.status, 200);
  const ids = data.addons.map((addon) => addon.id);
  assert.ok(ids.includes('org.streamflix.catalog'));
  assert.ok(ids.includes('org.streamflix.open-samples'));
  assert.ok(ids.includes('org.cvmturan.discovery'));
  assert.ok(!ids.some((id) => id.toLowerCase().includes('torrentio')));
});

test('stream lookup returns the public browser-playable demo', async () => {
  const { response, data } = await getJSON('/api/streams/movie/tt0111161');
  assert.equal(response.status, 200);
  assert.ok(data.count >= 1);
  assert.match(data.streams[0].url, /^https:\/\//);
  assert.match(data.streams[0].url, /interactive-examples\.mdn\.mozilla\.net\/media\/cc0-videos\/flower\.mp4$/);
});

test('manual add-on installer blocks private-network targets', async () => {
  const { response, data } = await getJSON('/api/addons/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manifestURL: 'http://127.0.0.1/manifest.json' })
  });
  assert.equal(response.status, 400);
  assert.match(data.error, /private|local/i);
});

test('manual add-on installer accepts standard Stremio install-link syntax', () => {
  assert.equal(
    addonManager.normalizeManifestURL('stremio://example.test/path/manifest.json'),
    'https://example.test/path/manifest.json'
  );
  assert.equal(
    addonManager.normalizeManifestURL('https://example.test/manifest.json'),
    'https://example.test/manifest.json'
  );
});

test('browser stream classifier rejects archives and keeps direct, HLS, and external sources distinct', () => {
  const classify = streamRouter.classifyStream;
  const direct = classify(
    { url: 'https://media.example.test/video.mp4?token=1', type: 'video/mp4' },
    'org.test',
    'Test'
  );
  const hls = classify(
    { url: 'https://media.example.test/live.m3u8?token=1' },
    'org.test',
    'Test'
  );
  const archive = classify(
    { url: 'https://media.example.test/season.zip', behaviorHints: { notWebReady: true } },
    'org.test',
    'Test'
  );
  const external = classify(
    { externalUrl: 'https://example.test/watch' },
    'org.test',
    'Test'
  );
  const headers = classify(
    {
      url: 'https://media.example.test/video.mp4',
      behaviorHints: { proxyHeaders: { response: { 'set-cookie': 'ignored' } } }
    },
    'org.test',
    'Test'
  );
  const appOnlyHls = classify(
    {
      url: 'https://media.example.test/app-only.m3u8',
      behaviorHints: { notWebReady: true }
    },
    'org.test',
    'Test'
  );
  const unknownAppOnly = classify(
    {
      url: 'https://media.example.test/opaque-download',
      behaviorHints: { notWebReady: true }
    },
    'org.test',
    'Test'
  );
  const mimeTypeHls = classify(
    {
      url: 'https://media.example.test/opaque-stream',
      type: 'application/octet-stream',
      mimeType: 'application/vnd.apple.mpegurl'
    },
    'org.test',
    'Test'
  );

  assert.equal(direct.browserReady, true);
  assert.equal(direct.playbackMode, 'direct');
  assert.match(direct.url, /^https:\/\//);
  assert.equal(hls.browserReady, true);
  assert.equal(hls.playbackMode, 'hls');
  assert.equal(archive.browserReady, false);
  assert.match(archive.unsupportedReason, /archive/i);
  assert.equal(external.playbackMode, 'external');
  assert.equal(external.browserReady, false);
  assert.equal(headers.browserReady, true);
  assert.equal(headers.playbackMode, 'direct');
  assert.equal(appOnlyHls.browserReady, true);
  assert.equal(appOnlyHls.playbackMode, 'hls');
  assert.ok(appOnlyHls.url.startsWith('/api/proxy/stream?'));
  assert.equal(unknownAppOnly.browserReady, true);
  assert.equal(unknownAppOnly.format, '');
  assert.equal(unknownAppOnly.playbackMode, 'proxy');
  assert.ok(typeof unknownAppOnly.transcodeUrl === 'string' || unknownAppOnly.transcodeUrl === null);
  assert.equal(mimeTypeHls.browserReady, true);
  assert.equal(mimeTypeHls.format, 'hls');
});

test('a lawful local Stremio fixture serves catalogs, episode metadata, and ordered browser sources', async () => {
  const requestedPaths = [];
  const manifest = {
    id: 'org.streamflix.test-fixture',
    name: 'Local Test Media',
    version: '1.0.0',
    description: 'Local lawful media fixture used only by automated tests.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['test:'],
    catalogs: [
      { type: 'movie', id: 'safe-movies', name: 'Safe movies' },
      { type: 'series', id: 'safe-series', name: 'Safe series' }
    ],
    behaviorHints: { configurable: true, configurationRequired: true }
  };
  const fixtureServer = http.createServer((req, res) => {
    requestedPaths.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);

    if (pathname === '/manifest.json') {
      res.statusCode = 302;
      res.setHeader('Location', '/final/manifest.json');
      res.end();
      return;
    }
    if (pathname === '/final/manifest.json') {
      res.end(JSON.stringify(manifest));
      return;
    }
    if (pathname.startsWith('/final/catalog/movie/safe-movies')) {
      res.end(JSON.stringify({
        metas: [{
          id: 'test:movie',
          type: 'movie',
          name: 'Fixture Film',
          description: 'A local test title.',
          releaseInfo: '2026',
          poster: 'https://images.example.test/fixture.jpg'
        }]
      }));
      return;
    }
    if (pathname === '/final/meta/series/test:series.json') {
      res.end(JSON.stringify({
        meta: {
          id: 'test:series',
          type: 'series',
          name: 'Fixture Series',
          videos: [
            { id: 'test:series:1:1', season: 1, episode: 1, title: 'Pilot' },
            { id: 'test:series:1:2', season: 1, episode: 2, title: 'Second episode' }
          ]
        }
      }));
      return;
    }
    if (pathname.startsWith('/final/stream/')) {
      res.end(JSON.stringify({
        streams: [
          {
            name: 'Fixture direct',
            url: 'https://media.example.test/fixture.mp4',
            type: 'video/mp4'
          },
          {
            name: 'Fixture HLS',
            url: 'https://media.example.test/fixture.m3u8'
          },
          {
            name: 'Fixture archive',
            url: 'https://media.example.test/fixture.zip',
            behaviorHints: { notWebReady: true }
          },
          {
            name: 'Fixture page',
            externalUrl: 'https://example.test/fixture'
          }
        ]
      }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
  const fixturePort = fixtureServer.address().port;
  process.env.ALLOW_PRIVATE_ADDONS = 'true';

  try {
    const install = await getJSON('/api/addons/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manifestURL: `http://127.0.0.1:${fixturePort}/manifest.json`
      })
    });
    assert.equal(install.response.status, 200);
    assert.equal(install.data.manifest.id, manifest.id);
    assert.equal(install.data.manifest.behaviorHints.configurable, true);
    assert.equal(install.data.manifest.behaviorHints.configurationRequired, true);
    assert.match(install.data.manifest.manifestURL, /\/final\/manifest\.json$/);
    const savedAfterInstall = JSON.parse(fs.readFileSync(testAddonFile, 'utf8'));
    assert.ok(savedAfterInstall.some((addon) => addon.id === manifest.id));

    const catalog = await getJSON(
      `/api/addons/catalog/${manifest.id}/movie/safe-movies?skip=20`
    );
    assert.equal(catalog.response.status, 200);
    assert.equal(catalog.data.metas[0].name, 'Fixture Film');
    assert.ok(requestedPaths.some((value) =>
      decodeURIComponent(value).includes('/catalog/movie/safe-movies/skip=20.json')
    ));

    const metadata = await getJSON(
      `/api/addons/meta/${manifest.id}/series/${encodeURIComponent('test:series')}`
    );
    assert.equal(metadata.response.status, 200);
    assert.equal(metadata.data.meta.videos[0].id, 'test:series:1:1');

    const streams = await getJSON(
      `/api/streams/movie/${encodeURIComponent('test:movie')}`
    );
    assert.equal(streams.response.status, 200);
    assert.equal(streams.data.streams[0].sourceAddon, manifest.id);
    assert.equal(streams.data.streams[0].browserReady, true);
    assert.equal(streams.data.streams[0].playbackMode, 'direct');
    const demoIndex = streams.data.streams.findIndex((stream) => stream.isDemo);
    const externalIndex = streams.data.streams.findIndex((stream) => stream.externalUrl);
    const archiveIndex = streams.data.streams.findIndex((stream) =>
      /archive/i.test(stream.name)
    );
    assert.ok(demoIndex > 0);
    assert.ok(externalIndex > demoIndex);
    assert.ok(archiveIndex > externalIndex);
    assert.equal(streams.data.streams[archiveIndex].browserReady, false);

    const removal = await getJSON(`/api/addons/${manifest.id}`, { method: 'DELETE' });
    assert.equal(removal.response.status, 200);
    const savedAfterRemoval = JSON.parse(fs.readFileSync(testAddonFile, 'utf8'));
    assert.ok(!savedAfterRemoval.some((addon) => addon.id === manifest.id));

    const originalAddonFile = addonManager.customAddonsFile;
    addonManager.customAddonsFile = path.join(testAddonFile, 'cannot-write.json');
    try {
      const failedSave = await getJSON('/api/addons/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manifestURL: `http://127.0.0.1:${fixturePort}/manifest.json`
        })
      });
      assert.equal(failedSave.response.status, 500);
      assert.match(failedSave.data.error, /could not save/i);
      const addonsAfterFailedSave = await getJSON('/api/addons');
      assert.ok(!addonsAfterFailedSave.data.addons.some((addon) => addon.id === manifest.id));
    } finally {
      addonManager.customAddonsFile = originalAddonFile;
    }
  } finally {
    process.env.ALLOW_PRIVATE_ADDONS = 'false';
    await new Promise((resolve) => fixtureServer.close(resolve));
  }
});

test('HTML app is served with a strict same-origin security policy', async () => {
  const response = await fetch(`${baseURL}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Manual add-ons/);
  assert.match(html, /Cvm Turan/);
  assert.match(html, /id="trailer-frame"/);
  assert.match(html, /id="try-direct-source"/);
  assert.match(html, /id="source-summary"/);
  assert.match(html, /data-source-filter="app-only"/);
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.match(
    response.headers.get('content-security-policy') || '',
    /frame-src 'self' https:\/\/www\.youtube-nocookie\.com/
  );
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { after, before, test } = require('node:test');

const TEST_CLIENT_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TEST_CLIENT_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

process.env.NODE_ENV = 'test';
process.env.HOST = '127.0.0.1';
process.env.TMDB_API_KEY = '';
process.env.ADDON_REPOSITORY_URL = '';
process.env.ALLOW_PRIVATE_ADDONS = 'false';
process.env.TRUST_PROXY = '1';

const { createApp, startServer } = require('../server');
const streamRouter = require('../src/api/streams');
const transcodeRouter = require('../src/api/transcode');
const addonManager = require('../src/core/addonManager');
const tvmaze = require('../src/core/tvmaze');
const contactRouter = require('../src/api/contact');

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
});

async function getJSON(route, options = {}) {
  const response = await fetch(`${baseURL}${route}`, {
    ...options,
    headers: {
      'X-Cvm-Client-Id': TEST_CLIENT_A,
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  return { response, data };
}

test('trusted proxy hop can be enabled for hosted deployments', () => {
  assert.equal(createApp().get('trust proxy'), 1);
});

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

test('forged unsigned transcode payloads are rejected', () => {
  const unsigned = Buffer.from(JSON.stringify({
    src: 'http://127.0.0.1/private',
    vc: 'copy'
  })).toString('base64url');
  assert.equal(transcodeRouter.decodePayload(unsigned), null);
});

test('health endpoint reports a ready local server', async () => {
  const { response, data } = await getJSON('/api/health');
  assert.equal(response.status, 200);
  assert.equal(data.status, 'ok');
  assert.equal(data.version, '1.2.0');
  assert.equal(data.hostScope, 'local');
  assert.equal(data.tmdbConfigured, false);
});

test('watch-provider endpoint validates ids and degrades safely without a TMDB key', async () => {
  const invalid = await fetch(`${baseURL}/api/tmdb/watch-providers/movie/not-a-number`);
  assert.equal(invalid.status, 400);

  const response = await fetch(`${baseURL}/api/tmdb/watch-providers/movie/550?country=IN`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.country, 'IN');
  assert.match(body.attribution, /JustWatch/);
  assert.ok(body.providers && Array.isArray(body.providers.stream));
});

test('permanent movie pages render safe metadata and provider attribution', async () => {
  const response = await fetch(`${baseURL}/movie/278/the-shawshank-redemption?country=IN`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(response.headers.get('cache-control'), /public/);
  assert.match(html, /The Shawshank Redemption/);
  assert.match(html, /TMDB/);
  assert.match(html, /JustWatch/);
  assert.match(html, /rel="canonical" href="https:\/\/showt\.fun\/movie\/278\/the-shawshank-redemption"/);
});

test('IMDb permanent pages use catalog metadata and direct legal viewing links', async () => {
  const addonManager = require('../src/core/addonManager');
  const originalMeta = addonManager.getMeta;
  const originalStreams = addonManager.getStreams;
  addonManager.getMeta = async () => ({
    meta: {
      id: 'tt1375666',
      name: 'Inception',
      description: 'A dream-heist thriller.',
      poster: 'https://images.example.test/inception.jpg',
      imdbRating: '8.8',
      genres: ['Science Fiction']
    }
  });
  addonManager.getStreams = async () => ({
    streams: [{ name: 'Legal provider', title: 'Open current offer', externalUrl: 'https://provider.example.test/watch' }]
  });
  try {
    const response = await fetch(`${baseURL}/movie/tt1375666/inception?country=IN`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /Inception/);
    assert.match(html, /8\.8[\s\S]*IMDb/);
    assert.match(html, /Legal provider/);
    assert.match(html, /viewing links returned by WatchHub/i);
    assert.match(html, /https:\/\/provider\.example\.test\/watch/);
    assert.doesNotMatch(html, /Unknown Movie/);
    assert.doesNotMatch(html, /Metadata and community rating from TMDB/);
  } finally {
    addonManager.getMeta = originalMeta;
    addonManager.getStreams = originalStreams;
  }
});

test('unknown numeric permanent pages return not found instead of fake metadata', async () => {
  const originalSearch = addonManager.searchCatalogs;
  const originalCatalog = addonManager.getCatalog;
  addonManager.searchCatalogs = async () => ({ groups: [] });
  addonManager.getCatalog = async () => ({ metas: [] });
  try {
    const response = await fetch(`${baseURL}/movie/999999999999/missing`);
    const html = await response.text();
    assert.equal(response.status, 404);
    assert.doesNotMatch(html, /Unknown Movie/);
  } finally {
    addonManager.searchCatalogs = originalSearch;
    addonManager.getCatalog = originalCatalog;
  }
});

test('numeric discovery titles render from their original public catalog', async () => {
  const originalCatalog = addonManager.getCatalog;
  addonManager.getCatalog = async (addonId, type, id) => {
    assert.equal(addonId, 'org.cvmturan.discovery');
    assert.equal(type, 'movie');
    assert.equal(id, 'top');
    return {
      metas: [{
        id: 'tt32327559',
        type: 'movie',
        name: 'The Sheep Detectives',
        description: 'A flock sets out to solve a mystery.',
        poster: 'https://images.example.test/sheep.jpg',
        imdbRating: '7.4',
        releaseInfo: '2026'
      }]
    };
  };
  try {
    const response = await fetch(`${baseURL}/movie/1301421/the-sheep-detectives?country=US`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /The Sheep Detectives/);
    assert.match(html, /7\.4[\s\S]*IMDb/);
    assert.doesNotMatch(html, /Title not found/);
  } finally {
    addonManager.getCatalog = originalCatalog;
  }
});

test('old numeric catalog links recover to their stable IMDb page', async () => {
  const originalSearch = addonManager.searchCatalogs;
  const originalCatalog = addonManager.getCatalog;
  addonManager.getCatalog = async () => ({ metas: [] });
  addonManager.searchCatalogs = async () => ({
    groups: [{
      type: 'movie',
      data: { metas: [{ id: 'tt1375666', type: 'movie', name: 'Inception' }] }
    }]
  });
  try {
    const response = await fetch(`${baseURL}/movie/999999999998/inception?country=CA`, {
      redirect: 'manual'
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/movie/tt1375666/inception?country=CA');
  } finally {
    addonManager.searchCatalogs = originalSearch;
    addonManager.getCatalog = originalCatalog;
  }
});

test('IMDb title matching validates input and resolves the requested media type', async () => {
  const tmdb = require('../src/core/tmdb');
  const original = tmdb.request;
  tmdb.request = async () => ({ movie_results: [{ id: 27205 }], tv_results: [] });
  try {
    const result = await getJSON('/api/tmdb/resolve/tt1375666?type=movie');
    assert.equal(result.data.id, 27205);
    const invalid = await getJSON('/api/tmdb/resolve/bad?type=movie');
    assert.equal(invalid.response.status, 400);
  } finally { tmdb.request = original; }
});

test('permanent title pages reject invalid identifiers', async () => {
  const response = await fetch(`${baseURL}/movie/not-a-number/title`);
  assert.equal(response.status, 404);
  assert.match(await response.text(), /not found/i);
});

test('debrid account routes are disabled without a server access key', async () => {
  const { response, data } = await getJSON('/api/debrid/services');
  assert.equal(response.status, 403);
  assert.match(data.error, /disabled/i);
});

test('contact form validation rejects unsafe or incomplete submissions', () => {
  assert.match(contactRouter.validateContactInput({}).error, /type/i);
  assert.match(contactRouter.validateContactInput({
    type: 'support', name: 'Test User', email: 'not-an-email', message: 'A useful test message', consent: true
  }).error, /email/i);
  assert.equal(contactRouter.validateContactInput({
    type: 'security', name: 'Test User', email: 'test@example.com', message: 'A useful security report', consent: true
  }).value.type, 'security');
});

test('contact form honeypot silently accepts bot submissions without delivery', async () => {
  const { response, data } = await getJSON('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ website: 'https://spam.example', type: 'support' })
  });
  assert.equal(response.status, 202);
  assert.match(data.message, /received/i);
});

test('media proxy rejects links that were not issued by the server', async () => {
  const { response, data } = await getJSON(
    `/api/proxy/stream?src=${encodeURIComponent('https://media.example.test/video.mp4')}`
  );
  assert.equal(response.status, 403);
  assert.match(data.error, /invalid|expired/i);
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
  assert.ok(ids.includes('org.streamflix.cinemeta'));
  assert.ok(ids.includes('org.cvmturan.tvmaze'));
  assert.ok(!ids.some((id) => id.toLowerCase().includes('torrentio')));
});

test('permanent legal search providers are combined without depending on user add-ons', async () => {
  const originalSearchCatalog = addonManager.searchCatalog;
  addonManager.searchCatalog = async (descriptor) => ({
    ...descriptor,
    data: {
      metas: [{
        id: descriptor.type === 'movie' ? 'tt1375666' : 'tt0903747',
        type: descriptor.type,
        name: descriptor.type === 'movie' ? 'Inception' : 'Breaking Bad',
        poster: 'https://images.example.test/poster.jpg'
      }]
    }
  });

  try {
    const { response, data } = await getJSON('/api/addons/search?query=breaking');
    assert.equal(response.status, 200);
    assert.ok(data.providers.includes('Cinemeta Search & Metadata'));
    assert.ok(data.providers.includes('TVmaze Series Search'));
    assert.equal(data.groups.length, 3);
    assert.ok(data.groups.some((group) => group.type === 'movie'));
    assert.ok(data.groups.some((group) => group.addon.id === 'org.cvmturan.tvmaze'));
  } finally {
    addonManager.searchCatalog = originalSearchCatalog;
  }
});

test('TVmaze metadata is converted to safe series cards with posters and IMDb ids', () => {
  const meta = tvmaze.normalizeShow({
    id: 169,
    name: 'Breaking Bad',
    summary: '<p>A chemistry teacher &amp; his former student.</p>',
    premiered: '2008-01-20',
    image: { original: 'https://static.tvmaze.com/poster.jpg' },
    rating: { average: 9.3 },
    genres: ['Drama', 'Crime'],
    externals: { imdb: 'tt0903747' }
  });
  assert.equal(meta.id, 'tt0903747');
  assert.equal(meta.type, 'series');
  assert.equal(meta.poster, 'https://static.tvmaze.com/poster.jpg');
  assert.equal(meta.releaseInfo, '2008');
  assert.equal(meta.description, 'A chemistry teacher & his former student.');
  assert.ok(!meta.description.includes('<'));
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

test('user-added browser streams stay direct and never receive proxy or transcode URLs', () => {
  const classify = streamRouter.classifyStream;
  const options = { externalOnly: true };
  const direct = classify(
    { name: 'Private direct', url: 'https://media.example.test/video.mp4', type: 'video/mp4' },
    'org.private',
    'Private',
    0,
    options
  );
  const withHeaders = classify(
    {
      name: 'Private headers',
      url: 'https://media.example.test/header-video.mp4',
      behaviorHints: { proxyHeaders: { request: { referer: 'https://provider.example.test/' } } }
    },
    'org.private',
    'Private',
    1,
    options
  );
  const opaqueHttps = classify(
    { name: 'Private opaque HTTPS', url: 'https://media.example.test/watch?id=opaque' },
    'org.private',
    'Private',
    2,
    options
  );
  const torrent = classify(
    { name: 'Private torrent', infoHash: '0123456789abcdef0123456789abcdef01234567' },
    'org.private',
    'Private',
    3,
    options
  );
  const unsafe = classify(
    { name: 'Unsafe', url: 'javascript:alert(1)' },
    'org.private',
    'Private',
    4,
    options
  );

  for (const source of [direct, withHeaders, torrent]) {
    assert.equal(source.transcodeUrl, null);
    assert.equal(source.transcodeLowUrl, null);
  }
  assert.equal(direct.browserReady, true);
  assert.equal(direct.playbackMode, 'direct');
  assert.equal(direct.url, 'https://media.example.test/video.mp4');
  assert.equal(direct.directFromProvider, true);
  assert.equal(direct.externalPlayerUrl, 'https://media.example.test/video.mp4');
  assert.equal(withHeaders.browserReady, false);
  assert.equal(withHeaders.url, null);
  assert.equal(withHeaders.playbackMode, 'external-player');
  assert.equal(withHeaders.requiresHeaders, true);
  assert.equal(opaqueHttps.browserReady, false);
  assert.equal(opaqueHttps.playbackMode, 'external-player');
  assert.equal(opaqueHttps.attemptUrl, 'https://media.example.test/watch?id=opaque');
  assert.equal(opaqueHttps.transcodeUrl, null);
  assert.equal(opaqueHttps.transcodeLowUrl, null);
  assert.equal(torrent.browserReady, false);
  assert.equal(torrent.url, null);
  assert.equal(torrent.playbackMode, 'external-app');
  assert.match(torrent.externalAppUrl, /^magnet:\?xt=urn%3Abtih%3A/i);
  assert.equal(unsafe, null);
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
          },
          {
            name: 'Fixture source app',
            infoHash: '0123456789abcdef0123456789abcdef01234567'
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

    const addonsForA = await getJSON('/api/addons');
    assert.ok(addonsForA.data.addons.some((addon) => addon.id === manifest.id));
    const addonsForB = await getJSON('/api/addons', {
      headers: { 'X-Cvm-Client-Id': TEST_CLIENT_B }
    });
    assert.ok(!addonsForB.data.addons.some((addon) => addon.id === manifest.id));

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
    const directSource = streams.data.streams.find((stream) => stream.name === 'Fixture direct');
    const hlsSource = streams.data.streams.find((stream) => stream.name === 'Fixture HLS');
    const sourceApp = streams.data.streams.find((stream) => stream.name === 'Fixture source app');
    assert.equal(directSource.sourceAddon, manifest.id);
    assert.equal(directSource.browserReady, true);
    assert.equal(directSource.playbackMode, 'direct');
    assert.equal(directSource.url, 'https://media.example.test/fixture.mp4');
    assert.equal(directSource.directFromProvider, true);
    assert.equal(directSource.externalPlayerUrl, 'https://media.example.test/fixture.mp4');
    assert.equal(hlsSource.browserReady, true);
    assert.equal(hlsSource.playbackMode, 'hls');
    assert.equal(hlsSource.url, 'https://media.example.test/fixture.m3u8');
    assert.equal(sourceApp.playbackMode, 'external-app');
    assert.match(sourceApp.externalAppUrl, /^magnet:/);
    for (const source of streams.data.streams.filter((stream) => stream.sourceAddon === manifest.id)) {
      assert.equal(source.transcodeUrl, null);
      assert.equal(source.transcodeLowUrl, null);
    }
    const demoIndex = streams.data.streams.findIndex((stream) => stream.isDemo);
    const archiveIndex = streams.data.streams.findIndex((stream) =>
      /archive/i.test(stream.name)
    );
    assert.equal(streams.data.streams[0].name, 'Fixture direct');
    assert.ok(demoIndex > 0);
    assert.ok(archiveIndex > demoIndex);
    assert.equal(streams.data.streams[archiveIndex].browserReady, false);

    const otherBrowserRemoval = await getJSON(`/api/addons/${manifest.id}`, {
      method: 'DELETE',
      headers: { 'X-Cvm-Client-Id': TEST_CLIENT_B }
    });
    assert.equal(otherBrowserRemoval.response.status, 404);
    const stillInstalledForA = await getJSON('/api/addons');
    assert.ok(stillInstalledForA.data.addons.some((addon) => addon.id === manifest.id));

    const savedManifestURL = install.data.manifest.manifestURL;
    addonManager.clientSessions.delete(TEST_CLIENT_A);
    const afterServerRestart = await getJSON('/api/addons');
    assert.ok(!afterServerRestart.data.addons.some((addon) => addon.id === manifest.id));
    const restored = await getJSON('/api/addons/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifestURLs: [savedManifestURL] })
    });
    assert.equal(restored.response.status, 200);
    assert.ok(restored.data.addons.some((addon) => addon.id === manifest.id));

    const removal = await getJSON(`/api/addons/${manifest.id}`, { method: 'DELETE' });
    assert.equal(removal.response.status, 200);
    const addonsAfterRemoval = await getJSON('/api/addons');
    assert.ok(!addonsAfterRemoval.data.addons.some((addon) => addon.id === manifest.id));
  } finally {
    process.env.ALLOW_PRIVATE_ADDONS = 'false';
    await new Promise((resolve) => fixtureServer.close(resolve));
  }
});

test('HTML app is served with a strict same-origin security policy', async () => {
  const response = await fetch(`${baseURL}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Make TShow yours/);
  assert.match(html, /id="calendar-view"/);
  assert.match(html, /id="addon-filter-group"/);
  assert.match(html, /TShow/);
  assert.match(html, /id="trailer-frame"/);
  assert.match(html, /id="try-direct-source"/);
  assert.match(html, /id="source-summary"/);
  assert.match(html, /id="browse-loader"/);
  assert.match(html, /id="browse-sort"/);
  assert.match(html, /id="player-pip"/);
  assert.match(html, /id="player-fullscreen"/);
  assert.match(html, /Direct provider playback/);
  assert.match(html, /data-source-filter="app-only"/);
  assert.match(html, /id="addon-legal-agreement"/);
  assert.match(html, /id="open-in-source-app"/);
  assert.match(html, /id="open-in-desktop"/);
  assert.match(html, /id="copy-source-link"/);
  assert.match(html, /\/legal\.html#terms/);
  assert.match(html, /TVmaze/);
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.match(
    response.headers.get('content-security-policy') || '',
    /frame-src 'self' https:\/\/www\.youtube-nocookie\.com/
  );
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('legal center is served with terms, privacy, copyright, and provider notices', async () => {
  const response = await fetch(`${baseURL}/legal.html`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /id="terms"/);
  assert.match(html, /id="privacy"/);
  assert.match(html, /id="copyright"/);
  assert.match(html, /id="notice"/);
  assert.match(html, /does not proxy, download, cache, or transcode video returned by user-added add-ons/i);
  assert.match(html, /copyright@showt\.fun/i);
  assert.match(html, /This product uses the TMDB API when configured but is not endorsed or certified by TMDB/);
});

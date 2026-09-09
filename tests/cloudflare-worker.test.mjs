import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { cacheTTL } from '../cloudflare/worker.mjs';

function createCache() {
  const values = new Map();
  return {
    async match(request) { return values.get(request.url)?.clone(); },
    async put(request, response) { values.set(request.url, response.clone()); }
  };
}

function createContext() {
  const pending = [];
  return { pending, waitUntil(promise) { pending.push(promise); } };
}

function env() {
  return { ASSETS: { fetch(request) { return new Response(`asset:${new URL(request.url).pathname}`); } } };
}

function addonHeader(urls) {
  return Buffer.from(JSON.stringify(urls)).toString('base64url');
}

test('only public metadata endpoints qualify for edge caching', () => {
  assert.equal(cacheTTL(new Request('https://tshow.example/api/tmdb/popular/movies')), 900);
  assert.equal(cacheTTL(new Request('https://tshow.example/api/tmdb/search?query=private')), 0);
  assert.equal(cacheTTL(new Request('https://tshow.example/api/addons')), 0);
  assert.equal(cacheTTL(new Request('https://tshow.example/api/streams/movie/tt123')), 0);
  assert.equal(cacheTTL(new Request('https://tshow.example/api/contact', { method: 'POST' })), 0);
  assert.equal(cacheTTL(new Request('https://tshow.example/api/tmdb/popular/movies', {
    headers: { Authorization: 'Bearer secret' }
  })), 0);
});

test('health reports a Cloudflare-only backend with no media relay', async () => {
  const response = await worker.fetch(new Request('https://showt.fun/api/health'), env(), createContext());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ok', hostScope: 'cloudflare', tmdbConfigured: false, mediaRelay: false
  });
});

test('legacy proxy, transcode and debrid routes remain unavailable', async () => {
  for (const path of ['/api/proxy/video', '/api/transcode/start', '/api/debrid/status']) {
    const response = await worker.fetch(new Request(`https://showt.fun${path}`), env(), createContext());
    assert.equal(response.status, 410, path);
    assert.match((await response.json()).error, /does not proxy, transcode, download, or debrid/i);
  }
});

test('public pages stay indexable while private app views and APIs do not', async () => {
  const legal = await worker.fetch(new Request('https://showt.fun/legal.html'), env(), createContext());
  assert.equal(legal.headers.get('x-robots-tag'), null);
  const privateView = await worker.fetch(new Request('https://showt.fun/?view=addons'), env(), createContext());
  assert.match(privateView.headers.get('x-robots-tag'), /noindex/);
  const api = await worker.fetch(new Request('https://showt.fun/api/health'), env(), createContext());
  assert.match(api.headers.get('x-robots-tag'), /noindex/);
});

test('permanent numeric title routes redirect into the SPA', async () => {
  const movie = await worker.fetch(
    new Request('https://showt.fun/movie/278/the-shawshank-redemption?country=IN'), env(), createContext()
  );
  assert.equal(movie.status, 302);
  assert.equal(movie.headers.get('location'), 'https://showt.fun/?title=movie%3A278');
  const series = await worker.fetch(
    new Request('https://showt.fun/series/1399/game-of-thrones'), env(), createContext()
  );
  assert.equal(series.headers.get('location'), 'https://showt.fun/?title=tv%3A1399');
  const imdb = await worker.fetch(
    new Request('https://showt.fun/movie/tt0111161/the-shawshank-redemption'), env(), createContext()
  );
  assert.equal(imdb.headers.get('location'), 'https://showt.fun/?title=movie%3Att0111161');
});

test('installed add-ons are supplied per browser request and never globally stored', async (t) => {
  const originalFetch = globalThis.fetch;
  const manifestURL = 'https://legal-addon.example/manifest.json';
  let manifestCalls = 0;
  globalThis.fetch = async (request) => {
    const url = new URL(request.url || request);
    if (url.href === manifestURL) {
      manifestCalls += 1;
      return Response.json({
        id: 'com.example.legal', name: 'Legal Test', version: '1.0.0',
        resources: ['stream'], types: ['movie']
      });
    }
    throw new Error(`Unexpected remote request: ${url.href}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const withAddon = await worker.fetch(new Request('https://showt.fun/api/addons', {
    headers: { 'X-TShow-Addon-Urls': addonHeader([manifestURL]) }
  }), env(), createContext());
  const withoutAddon = await worker.fetch(new Request('https://showt.fun/api/addons'), env(), createContext());
  assert.ok((await withAddon.json()).addons.some((addon) => addon.id === 'com.example.legal'));
  assert.ok(!(await withoutAddon.json()).addons.some((addon) => addon.id === 'com.example.legal'));
  assert.equal(manifestCalls, 1);
});

test('direct compatible video is returned unchanged and never fetched by TShow', async (t) => {
  const originalFetch = globalThis.fetch;
  const manifestURL = 'https://legal-addon.example/manifest.json';
  let mediaRequests = 0;
  globalThis.fetch = async (request) => {
    const url = new URL(request.url || request);
    if (url.href === manifestURL) return Response.json({
      id: 'com.example.legal', name: 'Legal Test', version: '1.0.0',
      resources: ['stream'], types: ['movie'], idPrefixes: ['tt']
    });
    if (url.href === 'https://legal-addon.example/stream/movie/tt1234567.json') return Response.json({
      streams: [{ name: 'Licensed sample', url: 'https://media.example/video.mp4' }]
    });
    if (url.hostname === 'media.example') mediaRequests += 1;
    throw new Error(`Unexpected request: ${url.href}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(new Request('https://showt.fun/api/streams/movie/tt1234567', {
    headers: { 'X-TShow-Addon-Urls': addonHeader([manifestURL]) }
  }), env(), createContext());
  const body = await response.json();
  const stream = body.streams.find((item) => item.sourceAddon === 'com.example.legal');
  assert.equal(stream.url, 'https://media.example/video.mp4');
  assert.equal(stream.browserReady, true);
  assert.equal(stream.directFromProvider, true);
  assert.equal(mediaRequests, 0);
});

test('add-on installation rejects local-network and insecure manifest URLs', async () => {
  for (const manifestURL of [
    'http://addon.example/manifest.json',
    'https://localhost/manifest.json',
    'https://127.0.0.1/manifest.json'
  ]) {
    const response = await worker.fetch(new Request('https://showt.fun/api/addons/install', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifestURL })
    }), env(), createContext());
    assert.equal(response.status, 502, manifestURL);
    assert.match((await response.json()).error, /public HTTPS/i);
  }
});

test('public metadata caching works without caching private add-on routes', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = createCache();
  let calls = 0;
  globalThis.caches = { default: cache };
  globalThis.fetch = async () => { calls += 1; return Response.json({ results: [{ id: calls }] }); };
  t.after(() => { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; });

  const runtime = { ...env(), TMDB_API_KEY: 'test-key' };
  const firstContext = createContext();
  const first = await worker.fetch(
    new Request('https://showt.fun/api/tmdb/trending/all/week'), runtime, firstContext
  );
  await Promise.all(firstContext.pending);
  const second = await worker.fetch(
    new Request('https://showt.fun/api/tmdb/trending/all/week'), runtime, createContext()
  );
  assert.equal(first.headers.get('x-tshow-edge-cache'), 'MISS');
  assert.equal(second.headers.get('x-tshow-edge-cache'), 'HIT');
  assert.equal(calls, 1);
});

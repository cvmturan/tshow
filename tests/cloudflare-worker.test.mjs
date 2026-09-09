import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { cacheTTL } from '../cloudflare/worker.mjs';

function createCache() {
  const values = new Map();
  return {
    async match(request) {
      return values.get(request.url)?.clone();
    },
    async put(request, response) {
      values.set(request.url, response.clone());
    }
  };
}

function createContext() {
  const pending = [];
  return {
    pending,
    waitUntil(promise) {
      pending.push(promise);
    }
  };
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

test('public static pages are indexable while private app views are not', async () => {
  let assetRequest;
  const response = await worker.fetch(
    new Request('https://tshow.example/legal.html'),
    { ASSETS: { fetch(request) { assetRequest = request; return new Response('legal'); } } },
    createContext()
  );
  assert.equal(assetRequest.url, 'https://tshow.example/legal.html');
  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.equal(await response.text(), 'legal');

  const privateResponse = await worker.fetch(
    new Request('https://tshow.example/?view=addons'),
    { ASSETS: { fetch() { return new Response('app'); } } },
    createContext()
  );
  assert.match(privateResponse.headers.get('x-robots-tag'), /noindex/);
});

test('API requests go to the fixed Render origin without forwarding Cloudflare identity headers', async (t) => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (request) => {
    upstreamRequest = request;
    return Response.json({ status: 'ok' });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(new Request('https://tshow.example/api/addons?view=all', {
    headers: {
      'CF-Connecting-IP': '203.0.113.9',
      'X-Cvm-Client-Id': 'a'.repeat(32)
    }
  }), {
    API_ORIGIN: 'https://tshow.onrender.com',
    ASSETS: { fetch() { throw new Error('assets should not run'); } }
  }, createContext());

  assert.equal(upstreamRequest.url, 'https://tshow.onrender.com/api/addons?view=all');
  assert.equal(upstreamRequest.headers.get('cf-connecting-ip'), null);
  assert.equal(upstreamRequest.headers.get('x-cvm-client-id'), 'a'.repeat(32));
  assert.equal(response.headers.get('x-tshow-edge-cache'), 'BYPASS');
});

test('public metadata is cached but browser-private routes never are', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = createCache();
  let calls = 0;
  globalThis.caches = { default: cache };
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ results: [{ id: calls }] });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  });

  const env = { API_ORIGIN: 'https://tshow.onrender.com' };
  const firstContext = createContext();
  const first = await worker.fetch(new Request('https://tshow.example/api/tmdb/trending/all/week'), env, firstContext);
  await Promise.all(firstContext.pending);
  const second = await worker.fetch(new Request('https://tshow.example/api/tmdb/trending/all/week'), env, createContext());

  assert.equal(first.headers.get('x-tshow-edge-cache'), 'MISS');
  assert.equal(second.headers.get('x-tshow-edge-cache'), 'HIT');
  assert.equal(calls, 1);

  await worker.fetch(new Request('https://tshow.example/api/addons'), env, createContext());
  await worker.fetch(new Request('https://tshow.example/api/addons'), env, createContext());
  assert.equal(calls, 3);
});

test('a same-origin or invalid API origin is rejected to prevent proxy loops', async () => {
  const env = { API_ORIGIN: 'https://tshow.example' };
  const response = await worker.fetch(
    new Request('https://tshow.example/api/health'),
    env,
    createContext()
  );
  assert.equal(response.status, 503);
});

test('API paths cannot replace the configured upstream host', async (t) => {
  const originalFetch = globalThis.fetch;
  let upstreamURL;
  globalThis.fetch = async (request) => {
    upstreamURL = new URL(request.url);
    return Response.json({ status: 'ok' });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await worker.fetch(
    new Request('https://tshow.example/api//attacker.example/path'),
    { API_ORIGIN: 'https://tshow.onrender.com' },
    createContext()
  );
  assert.equal(upstreamURL.origin, 'https://tshow.onrender.com');
  assert.equal(upstreamURL.pathname, '/api//attacker.example/path');
});

test('permanent title pages are rendered by the fixed origin', async (t) => {
  const originalFetch = globalThis.fetch;
  let upstreamURL;
  globalThis.fetch = async (request) => {
    upstreamURL = request.url;
    return new Response('<h1>Movie</h1>', { headers: { 'Content-Type': 'text/html' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await worker.fetch(
    new Request('https://showt.fun/movie/278/the-shawshank-redemption?country=IN'),
    { API_ORIGIN: 'https://tshow.onrender.com', ASSETS: { fetch() { throw new Error('assets should not run'); } } },
    createContext()
  );
  assert.equal(upstreamURL, 'https://tshow.onrender.com/movie/278/the-shawshank-redemption?country=IN');
  assert.match(await response.text(), /Movie/);
});

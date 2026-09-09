import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { cacheTTL } from '../cloudflare/worker.mjs';

function context() { const pending=[]; return { pending, waitUntil(p) { pending.push(p); } }; }

test('only public metadata endpoints qualify for edge caching', () => {
  assert.equal(cacheTTL(new Request('https://tshow.example/api/tmdb/popular/movies')), 900);
  assert.equal(cacheTTL(new Request('https://tshow.example/api/tmdb/search?query=private')), 0);
  assert.equal(cacheTTL(new Request('https://tshow.example/api/addons')), 0);
  assert.equal(cacheTTL(new Request('https://tshow.example/api/streams/movie/tt123')), 0);
});

test('public pages are indexable while private app views are not', async () => {
  const publicResponse = await worker.fetch(new Request('https://tshow.example/legal.html'), { ASSETS:{fetch(){return new Response('legal');}} }, context());
  assert.equal(publicResponse.headers.get('x-robots-tag'), null);
  const privateResponse = await worker.fetch(new Request('https://tshow.example/?view=addons'), { ASSETS:{fetch(){return new Response('app');}} }, context());
  assert.match(privateResponse.headers.get('x-robots-tag'), /noindex/);
});

test('health is served directly by Cloudflare without an API origin', async () => {
  const response = await worker.fetch(new Request('https://tshow.example/api/health'), {}, context());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.hostScope, 'cloudflare');
  assert.equal(data.mediaRelay, false);
});

test('legacy proxy, transcode, and debrid routes are permanently disabled', async () => {
  for (const path of ['/api/proxy/stream?src=https://example.com/a.mp4', '/api/transcode/p/test', '/api/debrid/services']) {
    const response = await worker.fetch(new Request('https://tshow.example'+path), {}, context());
    assert.equal(response.status, 410);
  }
});

test('permanent title pages use the Cloudflare static app', async () => {
  let assetURL = '';
  const response = await worker.fetch(new Request('https://showt.fun/movie/278/the-shawshank-redemption'), { ASSETS:{fetch(request){assetURL=request.url;return new Response('<html>app</html>');}} }, context());
  assert.equal(assetURL, 'https://showt.fun/index.html');
  assert.match(await response.text(), /app/);
});

test('remote add-on targets reject local, IP-literal, and insecure URLs', async () => {
  for (const manifestURL of ['http://127.0.0.1/manifest.json', 'http://localhost/manifest.json', 'https://192.168.1.1/manifest.json']) {
    const response = await worker.fetch(new Request('https://tshow.example/api/addons/install', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({manifestURL}) }), {}, context());
    assert.equal(response.status, 502);
  }
});

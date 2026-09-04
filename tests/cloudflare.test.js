const test = require('node:test');
const assert = require('node:assert/strict');

test('Cloudflare health endpoint works without an origin', async () => {
  const { handleApiRequest } = await import('../cloudflare/edge-proxy.mjs');
  const response = await handleApiRequest({
    request: new Request('https://tshow.pages.dev/api/cloudflare/health'),
    env: {},
    waitUntil() {}
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).originConfigured, false);
});

test('Cloudflare proxy requires a secure, separate API origin', async () => {
  const { handleApiRequest } = await import('../cloudflare/edge-proxy.mjs');
  for (const origin of [undefined, 'http://example.com', 'https://tshow.pages.dev']) {
    const response = await handleApiRequest({
      request: new Request('https://tshow.pages.dev/api/tmdb/popular/movies'),
      env: { TSHOW_ORIGIN: origin },
      waitUntil() {}
    });
    assert.equal(response.status, 503);
  }
});

test('Cloudflare proxy forwards API requests and marks uncached responses', async (t) => {
  const { handleApiRequest } = await import('../cloudflare/edge-proxy.mjs');
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (request) => {
    assert.equal(request.url, 'https://origin.example/api/addons?fresh=1');
    assert.equal(request.headers.get('x-forwarded-host'), 'tshow.pages.dev');
    return new Response(JSON.stringify({ count: 2 }), {
      headers: { 'content-type': 'application/json', server: 'origin' }
    });
  };

  const response = await handleApiRequest({
    request: new Request('https://tshow.pages.dev/api/addons?fresh=1'),
    env: { TSHOW_ORIGIN: 'https://origin.example' },
    waitUntil() {}
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-tshow-edge'), 'cloudflare-pages');
  assert.equal(response.headers.get('x-tshow-cache'), 'BYPASS');
  assert.equal(response.headers.has('server'), false);
});

test('Cloudflare proxy caches only public catalogue GET responses', async (t) => {
  const { handleApiRequest } = await import('../cloudflare/edge-proxy.mjs');
  const originalFetch = global.fetch;
  const originalCaches = global.caches;
  const entries = new Map();
  let fetches = 0;

  global.caches = {
    default: {
      async match(request) { return entries.get(request.url)?.clone(); },
      async put(request, response) { entries.set(request.url, response.clone()); }
    }
  };
  global.fetch = async () => {
    fetches += 1;
    return Response.json({ results: [{ id: 1 }] });
  };
  t.after(() => {
    global.fetch = originalFetch;
    if (originalCaches === undefined) delete global.caches;
    else global.caches = originalCaches;
  });

  const context = () => ({
    request: new Request('https://tshow.pages.dev/api/tmdb/popular/movies'),
    env: { TSHOW_ORIGIN: 'https://origin.example' },
    waitUntil(task) { return task; }
  });
  const first = await handleApiRequest(context());
  await new Promise((resolve) => setImmediate(resolve));
  const second = await handleApiRequest(context());

  assert.equal(first.headers.get('x-tshow-cache'), 'MISS');
  assert.equal(second.headers.get('x-tshow-cache'), 'HIT');
  assert.equal(fetches, 1);
});

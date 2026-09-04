const CACHEABLE_PREFIXES = [
  '/api/tmdb/',
  '/api/sample/'
];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers
    }
  });
}

function resolveOrigin(value, requestURL) {
  if (!value) return null;

  try {
    const origin = new URL(value);
    if (origin.protocol !== 'https:' || origin.username || origin.password) return null;
    if (origin.origin === requestURL.origin) return null;
    origin.search = '';
    origin.hash = '';
    return origin;
  } catch {
    return null;
  }
}

function canCache(request, url) {
  if (request.method !== 'GET') return false;
  if (!CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return false;
  return !request.headers.has('authorization') &&
    !request.headers.has('cookie') &&
    !request.headers.has('range') &&
    !request.headers.has('x-cvm-client-id');
}

function cacheTTL(pathname) {
  if (pathname.includes('/search')) return 300;
  if (pathname.includes('/trending/')) return 600;
  if (pathname.includes('/now-playing/') || pathname.includes('/airing-today/')) return 900;
  return 3600;
}

function withEdgeHeaders(response, cacheStatus = 'BYPASS') {
  const headers = new Headers(response.headers);
  headers.set('x-tshow-edge', 'cloudflare-pages');
  headers.set('x-tshow-cache', cacheStatus);
  headers.delete('server');
  headers.delete('x-powered-by');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function handleApiRequest({ request, env, waitUntil }) {
  const requestURL = new URL(request.url);

  if (requestURL.pathname === '/api/cloudflare/health') {
    return json({
      status: 'ok',
      edge: 'cloudflare-pages-functions',
      originConfigured: Boolean(resolveOrigin(env.TSHOW_ORIGIN, requestURL))
    }, 200, { 'x-tshow-edge': 'cloudflare-pages' });
  }

  const origin = resolveOrigin(env.TSHOW_ORIGIN, requestURL);
  if (!origin) {
    return json({
      error: 'TShow API origin is not configured.',
      setup: 'Set the TSHOW_ORIGIN environment variable in Cloudflare Pages.'
    }, 503, { 'x-tshow-edge': 'cloudflare-pages' });
  }

  const target = new URL(origin.origin);
  const basePath = origin.pathname === '/' ? '' : origin.pathname.replace(/\/$/, '');
  target.pathname = `${basePath}${requestURL.pathname}`;
  target.search = requestURL.search;

  const headers = new Headers(request.headers);
  const connectingIP = headers.get('cf-connecting-ip');
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ray');
  headers.delete('cf-visitor');
  if (connectingIP) headers.set('x-forwarded-for', connectingIP);
  headers.set('x-forwarded-host', requestURL.host);
  headers.set('x-forwarded-proto', requestURL.protocol.slice(0, -1));

  const upstreamRequest = new Request(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual'
  });

  const cacheable = canCache(request, requestURL);
  const cache = globalThis.caches?.default;
  const cacheKey = cacheable ? new Request(requestURL.toString(), { method: 'GET' }) : null;

  if (cache && cacheKey) {
    const cached = await cache.match(cacheKey);
    if (cached) return withEdgeHeaders(cached, 'HIT');
  }

  let upstream;
  try {
    upstream = await fetch(upstreamRequest);
  } catch {
    return json({ error: 'The TShow API origin could not be reached.' }, 502, {
      'x-tshow-edge': 'cloudflare-pages'
    });
  }

  const response = withEdgeHeaders(upstream, cacheable ? 'MISS' : 'BYPASS');
  if (
    cache && cacheKey && response.ok &&
    !response.headers.has('set-cookie') &&
    String(response.headers.get('content-type') || '').includes('application/json')
  ) {
    const cachedResponse = new Response(response.body, response);
    cachedResponse.headers.set('cache-control', `public, s-maxage=${cacheTTL(requestURL.pathname)}`);
    const task = cache.put(cacheKey, cachedResponse.clone());
    if (typeof waitUntil === 'function') waitUntil(task);
    else await task;
    return cachedResponse;
  }

  return response;
}

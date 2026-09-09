const DEFAULT_API_ORIGIN = 'https://tshow.onrender.com';

const BASE_SECURITY_HEADERS = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
};

const PRIVATE_ROBOTS = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

function apiOrigin(value, requestURL) {
  try {
    const origin = new URL(value || DEFAULT_API_ORIGIN);
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      origin.origin === requestURL.origin
    ) {
      return null;
    }
    return origin.origin;
  } catch {
    return null;
  }
}

export function cacheTTL(request) {
  if (request.method !== 'GET') return 0;

  const url = new URL(request.url);
  if (request.headers.has('authorization') || request.headers.has('cookie') || request.headers.has('range')) {
    return 0;
  }

  if (url.pathname === '/api/health' || url.pathname === '/api/tmdb/health') return 60;
  if (url.pathname.startsWith('/api/sample/')) return 3600;
  if (url.pathname.startsWith('/api/addons/catalog/org.cvmturan.discovery/')) return 900;
  if (url.pathname.startsWith('/api/tmdb/search') || url.pathname.startsWith('/api/tmdb/image/')) return 0;
  if (url.pathname.startsWith('/api/tmdb/')) return 900;
  return 0;
}

function cacheKey(request) {
  return new Request(request.url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
}

function withSecurityHeaders(response, requestURL) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) headers.set(name, value);
  if (requestURL) {
    const view = requestURL.searchParams.get('view');
    const privateView = ['list', 'calendar', 'history', 'addons', 'settings', 'help'].includes(view);
    if (requestURL.pathname === '/api' || requestURL.pathname.startsWith('/api/') || privateView) {
      headers.set('X-Robots-Tag', PRIVATE_ROBOTS);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function withEdgeHeaders(response, cacheStatus, requestURL) {
  const secured = withSecurityHeaders(response, requestURL);
  const headers = new Headers(secured.headers);
  headers.set('X-TShow-Edge-Cache', cacheStatus);
  return new Response(secured.body, {
    status: secured.status,
    statusText: secured.statusText,
    headers
  });
}

async function proxyAPI(request, env, ctx) {
  const incomingURL = new URL(request.url);
  const origin = apiOrigin(env.API_ORIGIN, incomingURL);
  if (!origin) {
    return Response.json(
      { error: 'The TShow API origin is not configured correctly.' },
      { status: 503, headers: { ...BASE_SECURITY_HEADERS, 'X-Robots-Tag': PRIVATE_ROBOTS } }
    );
  }

  const ttl = cacheTTL(request);
  const key = ttl ? cacheKey(request) : null;
  const edgeCache = globalThis.caches?.default;

  if (key && edgeCache) {
    try {
      const cached = await edgeCache.match(key);
      if (cached) return withEdgeHeaders(cached, 'HIT', incomingURL);
    } catch {
      // A cache outage must not make the API unavailable.
    }
  }

  const upstreamURL = new URL(origin);
  upstreamURL.pathname = incomingURL.pathname;
  upstreamURL.search = incomingURL.search;
  const headers = new Headers(request.headers);
  for (const name of [
    'host',
    'cf-connecting-ip',
    'cf-ipcountry',
    'cf-ray',
    'cf-visitor',
    'x-forwarded-for',
    'x-forwarded-proto'
  ]) headers.delete(name);

  const upstreamRequest = new Request(upstreamURL, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'follow'
  });

  let upstream;
  try {
    upstream = await fetch(upstreamRequest);
  } catch {
    return Response.json(
      { error: 'The TShow API is temporarily unavailable.' },
      { status: 502, headers: { ...BASE_SECURITY_HEADERS, 'X-Robots-Tag': PRIVATE_ROBOTS } }
    );
  }

  const response = withEdgeHeaders(upstream, ttl ? 'MISS' : 'BYPASS', incomingURL);
  const contentType = response.headers.get('content-type') || '';
  if (key && edgeCache && response.status === 200 && contentType.includes('application/json')) {
    const cachedResponse = response.clone();
    cachedResponse.headers.set('Cache-Control', `public, max-age=60, s-maxage=${ttl}`);
    ctx.waitUntil(edgeCache.put(key, cachedResponse).catch(() => undefined));
  }
  return response;
}

async function proxyTitlePage(request, env) {
  const incomingURL = new URL(request.url);
  const origin = apiOrigin(env.API_ORIGIN, incomingURL);
  if (!origin) return new Response('Title pages are temporarily unavailable.', { status: 503 });
  const upstreamURL = new URL(origin);
  upstreamURL.pathname = incomingURL.pathname;
  upstreamURL.search = incomingURL.search;
  const headers = new Headers(request.headers);
  for (const name of ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-proto']) headers.delete(name);
  try {
    const response = await fetch(new Request(upstreamURL, { method: request.method, headers, redirect: 'follow' }));
    return withSecurityHeaders(response, incomingURL);
  } catch {
    return new Response('Title pages are temporarily unavailable.', {
      status: 502,
      headers: { ...BASE_SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return proxyAPI(request, env, ctx);
    }
    if (/^\/(movie|series)\/(?:\d{1,12}|tt\d{5,12})(?:\/[^/]*)?\/?$/i.test(url.pathname)) {
      return proxyTitlePage(request, env);
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request), url);
  }
};

const encoder = new TextEncoder();
const COOKIE = '__Host-tshow-session';
const KEYS = new Set(['watchlist', 'continueWatching', 'recentlyViewed', 'addonURLs', 'region', 'playerPreferences']);
const now = () => Math.floor(Date.now() / 1000);
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const digest = async text => b64(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
const cookie = (name, value, age, sameSite = 'Lax') => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${age}`;
const readCookie = (request, name) => (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1) || '';
const reply = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', ...headers } });
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export async function readBody(request, limit = 262144) {
  if (Number(request.headers.get('content-length')) > limit) fail('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) return '';
  let size = 0; const chunks = [];
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); fail('Request is too large.', 413); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
async function bodyJSON(request) { try { return JSON.parse(await readBody(request)); } catch (e) { if (e.status) throw e; fail('Invalid JSON.'); } }
function email(value) { const e = String(value || '').trim().toLowerCase(); if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail('Enter a valid email address.'); return e; }
function password(value) { if (typeof value !== 'string' || value.length < 12 || value.length > 128) fail('Use a password of 12–128 characters.'); return value; }
export async function hashPassword(value, salt = random()) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(value), 'PBKDF2', false, ['deriveBits']);
  // Workers Web Crypto supports at most 100,000 PBKDF2 iterations.
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt), iterations: 100000, hash: 'SHA-512' }, key, 512);
  return `pbkdf2-sha512$100000$${salt}$${b64(bits)}`;
}
export async function verifyPassword(value, stored) {
  if (!stored) { await hashPassword(value); return false; }
  const [, , salt] = stored.split('$');
  const candidate = await hashPassword(value, salt);
  const a = encoder.encode(candidate), b = encoder.encode(stored);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i] || 0);
  return diff === 0;
}
async function limit(db, request, scope, max = 20) {
  const time = now(), window = Math.floor(time / 900);
  const key = await digest(`${scope}:${request.headers.get('cf-connecting-ip') || 'local'}:${window}`);
  const row = await db.prepare('INSERT INTO auth_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key, time + 900).first();
  if (row.count > max) fail('Too many attempts. Try again in 15 minutes.', 429);
}
async function userFor(request, db) {
  const token = readCookie(request, COOKIE);
  if (!/^[\w-]{43}$/.test(token)) return null;
  return db.prepare('SELECT u.id,u.email,u.name,u.created_at,u.password_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token), now()).first();
}
const publicUser = u => u ? { id: u.id, email: u.email, name: u.name, createdAt: u.created_at, hasPassword: Boolean(u.password_hash) } : null;
async function session(db, user, data = {}) {
  const token = random(), age = 60 * 60 * 24 * 30;
  await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').bind(await digest(token), user.id, now() + age, now()).run();
  return reply({ user: publicUser(user), ...data }, 200, { 'Set-Cookie': cookie(COOKIE, token, age) });
}
export function validateData(key, value) {
  if (!KEYS.has(key)) fail('Unknown setting.');
  if (key === 'watchlist' || key === 'recentlyViewed') {
    if (!Array.isArray(value) || value.length > (key === 'watchlist' ? 250 : 100) || value.some(v => !v || typeof v !== 'object' || Array.isArray(v))) fail('Invalid saved list.');
  } else if (key === 'addonURLs') {
    if (!Array.isArray(value) || value.length > 20 || value.some(v => { try { const u = new URL(v); return typeof v !== 'string' || v.length > 8192 || u.protocol !== 'https:' || u.username || u.password; } catch { return true; } })) fail('Invalid add-on list.');
  } else if (key === 'region') { if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value)) fail('Invalid region.'); }
  else if (value !== null && (typeof value !== 'object' || Array.isArray(value))) fail('Invalid setting.');
  const encoded = JSON.stringify(value);
  if (encoder.encode(encoded).length > 240000) fail('This saved item is too large.', 413);
  return encoded;
}
function providerConfig(env, provider) {
  if (provider === 'google' && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) return { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET, auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'] };
  if (provider === 'apple' && env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) return { id: env.APPLE_CLIENT_ID, secret: env.APPLE_CLIENT_SECRET, auth: 'https://appleid.apple.com/auth/authorize', token: 'https://appleid.apple.com/auth/token', jwks: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'] };
  return null;
}
async function providerJSON(url, options = {}) {
  const r = await fetch(url, { ...options, signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!r.ok) fail('The sign-in provider could not complete this request.', 502);
  return JSON.parse(await readBody(r, 65536));
}
async function verifyIdentity(token, config, nonce) {
  if (typeof token !== 'string' || token.length > 16000) fail('Invalid sign-in response.');
  const parts = token.split('.'); if (parts.length !== 3) fail('Invalid sign-in response.');
  const header = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
  if (header.alg !== 'RS256') fail('Invalid sign-in signature.');
  const { keys } = await providerJSON(config.jwks);
  const jwk = keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig'));
  if (!jwk) fail('Invalid sign-in key.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64(parts[2]), encoder.encode(parts.slice(0, 2).join('.')))) fail('Invalid sign-in signature.');
  const claims = JSON.parse(new TextDecoder().decode(unb64(parts[1])));
  if (!config.issuers.includes(claims.iss) || claims.aud !== config.id || !(claims.exp > now()) || !(claims.iat <= now() + 60) || claims.nonce !== nonce || typeof claims.sub !== 'string' || !claims.sub || ![true, 'true'].includes(claims.email_verified)) fail('The sign-in identity could not be verified.');
  return claims;
}
async function oauth(request, env, provider, action) {
  const db = env.DB, config = providerConfig(env, provider);
  if (!config) fail(`${provider === 'apple' ? 'Apple' : 'Google'} sign-in is not configured yet.`, 503);
  const origin = env.APP_ORIGIN || 'https://showt.fun';
  const redirect = `${origin}/api/auth/${provider}/callback`;
  if (action === 'start') {
    if (request.method !== 'GET') fail('Method not allowed.', 405);
    await limit(db, request, 'oauth');
    const state = random(), nonce = random(), verifier = random();
    await db.prepare('INSERT INTO oauth_states(token_hash,provider,nonce,verifier,expires_at) VALUES (?,?,?,?,?)').bind(await digest(state), provider, nonce, verifier, now() + 600).run();
    const target = new URL(config.auth);
    const params = { client_id: config.id, redirect_uri: redirect, response_type: 'code', scope: provider === 'apple' ? 'name email' : 'openid email profile', state, nonce };
    if (provider === 'apple') params.response_mode = 'form_post';
    else { params.code_challenge = await digest(verifier); params.code_challenge_method = 'S256'; }
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    return new Response(null, { status: 302, headers: { Location: target.href, 'Cache-Control': 'no-store', 'Set-Cookie': cookie('__Host-tshow-oauth', state, 600, provider === 'apple' ? 'None' : 'Lax') } });
  }
  if (action !== 'callback' || !['GET', 'POST'].includes(request.method)) fail('Not found.', 404);
  const params = request.method === 'POST' ? new URLSearchParams(await readBody(request, 20000)) : new URL(request.url).searchParams;
  const state = params.get('state');
  if (!state || state !== readCookie(request, '__Host-tshow-oauth')) fail('Sign-in expired. Please try again.');
  const saved = await db.prepare('DELETE FROM oauth_states WHERE token_hash=? AND provider=? AND expires_at>? RETURNING *').bind(await digest(state), provider, now()).first();
  if (!saved || !params.get('code')) fail('Sign-in expired or was cancelled.');
  const form = new URLSearchParams({ grant_type: 'authorization_code', client_id: config.id, client_secret: config.secret, redirect_uri: redirect, code: params.get('code') });
  if (provider === 'google') form.set('code_verifier', saved.verifier);
  const tokens = await providerJSON(config.token, { method: 'POST', body: form });
  const identity = await verifyIdentity(tokens.id_token, config, saved.nonce);
  let user = await db.prepare('SELECT u.* FROM identities i JOIN users u ON i.user_id=u.id WHERE i.provider=? AND i.subject=?').bind(provider, identity.sub).first();
  if (!user) {
    const address = email(identity.email);
    if (await db.prepare('SELECT id FROM users WHERE email=?').bind(address).first()) fail('An account already uses this email. Sign in with your original method; accounts are not linked automatically.', 409);
    user = { id: crypto.randomUUID(), email: address, name: String(identity.name || address.split('@')[0]).slice(0, 80), created_at: now(), password_hash: null };
    await db.batch([
      db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').bind(user.id, user.email, user.name, user.created_at),
      db.prepare('INSERT INTO identities(provider,subject,user_id) VALUES (?,?,?)').bind(provider, identity.sub, user.id)
    ]);
  }
  const result = await session(db, user);
  const headers = new Headers({ Location: `${origin}/?account=welcome`, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', result.headers.get('Set-Cookie'));
  headers.append('Set-Cookie', cookie('__Host-tshow-oauth', '', 0));
  return new Response(null, { status: 303, headers });
}
export async function accountRoute(request, env) {
  const url = new URL(request.url), p = url.pathname, method = request.method;
  try {
    if (p === '/api/auth/config') return reply({ available: Boolean(env.DB), google: Boolean(providerConfig(env, 'google')), apple: Boolean(providerConfig(env, 'apple')) });
    if (!env.DB) fail('Accounts are not configured on this host yet.', 503);
    const db = env.DB;
    const oauthRoute = p.match(/^\/api\/auth\/(google|apple)\/(start|callback)$/);
    if (oauthRoute) return await oauth(request, env, oauthRoute[1], oauthRoute[2]);
    if (!['GET', 'HEAD'].includes(method)) {
      const origin = env.APP_ORIGIN || 'https://showt.fun';
      if (request.headers.get('origin') !== origin || new URL(request.url).origin !== origin || request.headers.get('x-tshow-request') !== '1') fail('Request origin could not be verified.', 403);
      if (!(request.headers.get('content-type') || '').startsWith('application/json')) fail('JSON is required.', 415);
    }
    if (p === '/api/auth/register' && method === 'POST') {
      await limit(db, request, 'register', 5);
      const data = await bodyJSON(request), address = email(data.email), pass = password(data.password);
      const name = String(data.name || '').trim().slice(0, 80); if (!name) fail('Enter your name.');
      if (await db.prepare('SELECT id FROM users WHERE email=?').bind(address).first()) fail('This email cannot be registered. Try signing in or recovering your account.', 409);
      const recoveryCode = random(), hashed = await hashPassword(pass);
      const user = { id: crypto.randomUUID(), email: address, name, created_at: now(), password_hash: hashed };
      await db.prepare('INSERT INTO users(id,email,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').bind(user.id, address, name, hashed, await digest(recoveryCode), user.created_at).run();
      return await session(db, user, { recoveryCode });
    }
    if (p === '/api/auth/login' && method === 'POST') {
      await limit(db, request, 'login');
      const data = await bodyJSON(request), address = email(data.email), pass = password(data.password);
      const user = await db.prepare('SELECT * FROM users WHERE email=?').bind(address).first();
      if (!await verifyPassword(pass, user?.password_hash)) fail('Email or password is incorrect.', 401);
      return await session(db, user);
    }
    if (p === '/api/auth/recover' && method === 'POST') {
      await limit(db, request, 'recover', 5);
      const data = await bodyJSON(request), address = email(data.email), pass = password(data.password);
      const user = await db.prepare('SELECT * FROM users WHERE email=? AND recovery_hash=?').bind(address, await digest(String(data.recoveryCode || ''))).first();
      if (!user) fail('Email or recovery code is incorrect.', 401);
      const recoveryCode = random(), hashed = await hashPassword(pass);
      const results = await db.batch([
        db.prepare('UPDATE users SET password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=?').bind(hashed, await digest(recoveryCode), user.id, user.recovery_hash),
        db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)
      ]);
      if (!results[0].meta.changes) fail('This recovery code has already been used.', 409);
      return await session(db, { ...user, password_hash: hashed }, { recoveryCode });
    }
    const user = await userFor(request, db);
    if (p === '/api/auth/me' && method === 'GET') return reply({ user: publicUser(user) });
    if (!user) fail('Sign in to continue.', 401);
    if (p === '/api/auth/logout' && method === 'POST') {
      await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(readCookie(request, COOKIE))).run();
      return reply({ success: true }, 200, { 'Set-Cookie': cookie(COOKIE, '', 0) });
    }
    if (p === '/api/account/sessions' && method === 'DELETE') {
      await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id).run();
      return reply({ success: true }, 200, { 'Set-Cookie': cookie(COOKIE, '', 0) });
    }
    if (p === '/api/account' && method === 'DELETE') {
      const data = await bodyJSON(request);
      if (data.confirm !== 'DELETE') fail('Type DELETE to confirm.');
      if (user.password_hash) { await limit(db, request, 'delete', 5); if (!await verifyPassword(String(data.password || ''), user.password_hash)) fail('Password is incorrect.', 401); }
      else { const s = await db.prepare('SELECT created_at FROM sessions WHERE token_hash=?').bind(await digest(readCookie(request, COOKIE))).first(); if (!s || s.created_at < now() - 300) fail('Sign out and sign in again before deleting your account.', 403); }
      await db.prepare('DELETE FROM users WHERE id=?').bind(user.id).run();
      return reply({ success: true }, 200, { 'Set-Cookie': cookie(COOKIE, '', 0) });
    }
    if (p === '/api/account/data' && method === 'GET') {
      const { results } = await db.prepare('SELECT key,value,version,updated_at FROM user_data WHERE user_id=?').bind(user.id).all();
      return reply({ user: publicUser(user), data: Object.fromEntries(results.map(r => [r.key, { value: JSON.parse(r.value), version: r.version, updatedAt: r.updated_at }])) });
    }
    const match = p.match(/^\/api\/account\/data\/([A-Za-z]+)$/);
    if (match && method === 'PUT') {
      await limit(db, request, 'save', 1200);
      const key = match[1], data = await bodyJSON(request), value = validateData(key, data.value);
      if (!Number.isSafeInteger(data.version) || data.version < 0) fail('A valid version is required.');
      const sql = data.version === 0
        ? 'INSERT INTO user_data(user_id,key,value,version,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(user_id,key) DO NOTHING RETURNING version'
        : 'UPDATE user_data SET value=?,version=version+1,updated_at=? WHERE user_id=? AND key=? AND version=? RETURNING version';
      const row = await (data.version === 0 ? db.prepare(sql).bind(user.id, key, value, now()) : db.prepare(sql).bind(value, now(), user.id, key, data.version)).first();
      if (!row) fail('This item changed on another device. Export your unsaved data, then reload to use the cloud copy.', 409);
      return reply({ version: row.version });
    }
    fail('Not found.', 404);
  } catch (e) {
    if (!e.status) console.error('account_request_failed', { path: p, name: e.name });
    return reply({ error: e.status ? e.message : 'The account service is temporarily unavailable. Please try again.' }, e.status || 503);
  }
}
export async function cleanAccounts(env) {
  if (!env.DB) return;
  const time = now();
  await env.DB.batch(['sessions', 'auth_limits', 'oauth_states'].map(table => env.DB.prepare(`DELETE FROM ${table} WHERE expires_at<?`).bind(time)));
}

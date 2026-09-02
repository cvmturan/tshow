const express = require('express');
const axios = require('axios');
const addonManager = require('../core/addonManager');
const requestSigner = require('../core/requestSigner');

const router = express.Router();
const MAX_PROXY_REDIRECTS = 3;

const HEADER_ALLOWLIST = new Set([
  'referer', 'origin', 'user-agent', 'accept', 'accept-language', 'cookie', 'authorization'
]);
const PASS_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'last-modified',
  'etag'
];

function decodeHeaders(raw) {
  if (!raw || typeof raw !== 'string' || raw.length > 8192) return {};
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const headers = {};
    for (const [key, value] of Object.entries(parsed)) {
      const name = String(key).toLowerCase();
      if (!HEADER_ALLOWLIST.has(name)) continue;
      const text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 2000);
      if (text) headers[name] = text;
    }
    return headers;
  } catch {
    return {};
  }
}

async function fetchValidatedRemote(startURL, options) {
  let currentURL = await addonManager.validateRemoteURL(startURL);

  for (let redirectCount = 0; redirectCount <= MAX_PROXY_REDIRECTS; redirectCount += 1) {
    const response = await axios.get(currentURL, {
      ...options,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400
    });
    if (response.status < 300) return response;

    response.data?.destroy?.();
    const location = response.headers?.location;
    if (!location || redirectCount >= MAX_PROXY_REDIRECTS) {
      throw new Error('The media provider returned too many redirects.');
    }

    const nextURL = new URL(location, currentURL).toString();
    const validatedNextURL = await addonManager.validateRemoteURL(nextURL);
    if (
      new URL(currentURL).protocol === 'https:' &&
      new URL(validatedNextURL).protocol !== 'https:'
    ) {
      throw new Error('The media provider attempted an insecure redirect.');
    }
    currentURL = validatedNextURL;
  }

  throw new Error('The media provider returned too many redirects.');
}

router.get('/stream', async (req, res) => {
  if (!requestSigner.verify(req.query.sig, req.query.src, req.query.h)) {
    return res.status(403).json({ error: 'Invalid or expired media proxy link.' });
  }
  let source;
  try {
    source = await addonManager.validateRemoteURL(String(req.query.src || ''));
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const extraHeaders = decodeHeaders(req.query.h);
  let upstream;
  try {
    upstream = await fetchValidatedRemote(source, {
      responseType: 'stream',
      timeout: 30_000,
      maxContentLength: Infinity,
      decompress: false,
      headers: {
        ...extraHeaders,
        Accept: '*/*',
        ...(req.headers.range ? { Range: req.headers.range } : {})
      }
    });
  } catch (error) {
    const status = error.response?.status || 502;
    return res.status(502).json({
      error: `The video provider refused this request${status ? ` (HTTP ${status})` : ''}.`
    });
  }

  res.status(upstream.status);
  for (const name of PASS_RESPONSE_HEADERS) {
    const value = upstream.headers[name];
    if (value !== undefined) res.setHeader(name, value);
  }
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'no-store');
  res.flushHeaders();

  upstream.data.on('error', () => res.destroy());
  res.on('close', () => upstream.data.destroy());
  upstream.data.pipe(res);
});

function srtToVtt(text) {
  const body = String(text)
    .replace(/\r+\n/g, '\n')
    .replace(/^\uFEFF/, '')
    .replace(/^\d+\s*$/gm, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

router.get('/subtitle', async (req, res) => {
  if (!requestSigner.verify(req.query.sig, req.query.src)) {
    return res.status(403).json({ error: 'Invalid or expired subtitle proxy link.' });
  }
  let source;
  try {
    source = await addonManager.validateRemoteURL(String(req.query.src || ''));
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  let response;
  try {
    response = await fetchValidatedRemote(source, {
      responseType: 'arraybuffer',
      timeout: 30_000,
      maxContentLength: 8 * 1024 * 1024,
      headers: { ...decodeHeaders(req.query.h), Accept: '*/*' }
    });
  } catch (error) {
    return res.status(502).json({ error: 'The subtitle provider could not be reached.' });
  }

  const contentType = String(response.headers['content-type'] || '');
  const raw = Buffer.from(response.data).toString('utf8');
  const isVtt = /^\uFEFF?WEBVTT/.test(raw) || /vtt/i.test(contentType);
  const body = isVtt ? (/^\uFEFF?WEBVTT/.test(raw) ? raw : srtToVtt(raw)) : srtToVtt(raw);

  res.status(200);
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(body);
});

router.decodeHeaders = decodeHeaders;
router.fetchValidatedRemote = fetchValidatedRemote;

module.exports = router;

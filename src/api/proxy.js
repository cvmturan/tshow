const express = require('express');
const axios = require('axios');
const addonManager = require('../core/addonManager');

const router = express.Router();

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

router.get('/stream', async (req, res) => {
  let source;
  try {
    source = await addonManager.validateRemoteURL(String(req.query.src || ''));
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const extraHeaders = decodeHeaders(req.query.h);
  let upstream;
  try {
    upstream = await axios.get(source, {
      responseType: 'stream',
      timeout: 30_000,
      maxRedirects: 5,
      maxContentLength: Infinity,
      decompress: false,
      validateStatus: (status) => status >= 200 && status < 400,
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
  let source;
  try {
    source = await addonManager.validateRemoteURL(String(req.query.src || ''));
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  let response;
  try {
    response = await axios.get(source, {
      responseType: 'arraybuffer',
      timeout: 30_000,
      maxRedirects: 5,
      maxContentLength: 8 * 1024 * 1024,
      validateStatus: (status) => status >= 200 && status < 400,
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

module.exports = router;

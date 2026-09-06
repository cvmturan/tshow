'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

const ALLOWED_HEADERS = new Map([
  ['referer', 'Referer'],
  ['referrer', 'Referer'],
  ['origin', 'Origin'],
  ['user-agent', 'User-Agent']
]);

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase().split('%')[0];
  if (!net.isIP(value)) return true;

  if (net.isIPv4(value)) {
    const parts = value.split('.').map(Number);
    return parts[0] === 0 ||
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 0 && [0, 2].includes(parts[2])) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 198 && [18, 19].includes(parts[1])) ||
      (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) ||
      (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) ||
      parts[0] >= 224;
  }

  return value === '::' || value === '::1' ||
    value.startsWith('fc') || value.startsWith('fd') || value.startsWith('2001:db8:') ||
    /^fe[89ab]/.test(value) || value.startsWith('ff') ||
    value.startsWith('::ffff:127.') || value.startsWith('::ffff:10.') ||
    value.startsWith('::ffff:192.168.');
}

async function validatePlaybackURL(value, lookup = dns.lookup) {
  if (typeof value !== 'string' || !value || value.length > 8192) {
    throw new Error('The media URL is missing or too long.');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The media URL is invalid.');
  }

  if (url.protocol !== 'https:') throw new Error('TShow Desktop accepts HTTPS media only.');
  if (url.username || url.password) throw new Error('Media URLs cannot contain embedded credentials.');
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Local-network media addresses are blocked.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('Private-network media addresses are blocked.');
    return url.href;
  }

  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('The media host could not be resolved.');
  }
  if (!Array.isArray(addresses) || !addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('Private or unresolved media hosts are blocked.');
  }
  return url.href;
}

function cleanHeaderValue(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 1024 || /[\r\n\0,]/.test(text)) return null;
  return text;
}

function sanitizePlaybackHeaders(payload) {
  const supplied = payload?.behaviorHints?.proxyHeaders?.request || payload?.headers;
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) return {};
  const result = {};
  for (const [name, value] of Object.entries(supplied)) {
    const canonical = ALLOWED_HEADERS.get(String(name).toLowerCase());
    const cleaned = cleanHeaderValue(value);
    if (!canonical || !cleaned) continue;
    if (['Referer', 'Origin'].includes(canonical)) {
      try {
        const parsed = new URL(cleaned);
        if (!['https:', 'http:'].includes(parsed.protocol)) continue;
      } catch {
        continue;
      }
    }
    result[canonical] = cleaned;
  }
  return result;
}

async function preparePlaybackRequest(payload, lookup) {
  if (!payload || typeof payload !== 'object') throw new Error('No playback request was supplied.');
  return {
    url: await validatePlaybackURL(payload.url, lookup),
    title: cleanHeaderValue(payload.title)?.slice(0, 180) || 'TShow',
    headers: sanitizePlaybackHeaders(payload)
  };
}

module.exports = {
  isPrivateAddress,
  validatePlaybackURL,
  sanitizePlaybackHeaders,
  preparePlaybackRequest
};

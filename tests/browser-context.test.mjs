import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../cloudflare/worker.mjs';

test('intermittent host 403 recovers through the browser and retains episode IDs and sizes', async () => {
  const manifest = { id: 'com.example.browser', name: 'Browser fixture', manifestURL: 'https://addon.example/manifest.json', resources: ['stream'], types: ['series'] };
  const saved = new Map([
    ['streamflix:addons:v1', JSON.stringify([manifest.manifestURL])],
    ['tshow:addon-manifests:v1', JSON.stringify([manifest])]
  ]);
  let providerURL;
  const nativeFetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith('/api/streams/')) return Response.json({ streams: [], sources: [{ addonId: manifest.id, error: 'Provider returned 403' }] });
    if (url.startsWith('https://addon.example/stream/series/')) {
      providerURL = url;
      assert.equal(init.credentials, 'omit');
      const result = Response.json({ streams: [{ url: 'https://video.example/show.mp4', behaviorHints: { videoSize: 1073741824 } }] });
      Object.defineProperty(result, 'url', { value: url });
      return result;
    }
    if (url === '/api/addons/browser-result') return worker.fetch(new Request('https://showt.fun' + url, { ...init, headers: { ...init.headers, Origin: 'https://showt.fun' } }), {}, { waitUntil() {} });
    throw new Error('Unexpected request: ' + url);
  };
  const window = { location: { href: 'https://showt.fun/', origin: 'https://showt.fun' }, fetch: nativeFetch };
  vm.runInNewContext(await readFile(new URL('../public/js/cloudflare-context.js', import.meta.url), 'utf8'), {
    window, localStorage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) },
    URL, Request, Response, Headers, AbortSignal, TextEncoder, Blob, btoa
  });
  const body = await (await window.fetch('/api/streams/series/tt1234567%3A2%3A3')).json();
  assert.equal(providerURL, 'https://addon.example/stream/series/tt1234567%3A2%3A3.json');
  assert.equal(body.streams[0].sizeLabel, '1.0 GB');
  assert.equal(body.sources[0].connection, 'browser');
  assert.equal(body.sources[0].error, undefined);
});


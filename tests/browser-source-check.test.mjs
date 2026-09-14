import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const probe = source.slice(source.indexOf('    function probeBrowserSource('), source.indexOf('    async function togglePlayerFullscreen('));
function setup(outcome) {
  let cleaned = false;
  const video = { videoWidth: outcome === 'audio' ? 0 : 1920, readyState: 2, canPlayType: () => '', pause() {}, removeAttribute() { cleaned = true; }, load() { if (!cleaned) queueMicrotask(() => outcome === 'error' ? this.onerror?.() : this.onloadeddata?.()); } };
  const context = { state: {}, document: { createElement: () => video }, window: {}, setTimeout, clearTimeout, setInterval, clearInterval };
  vm.createContext(context); vm.runInContext(probe, context);
  return { run: () => context.probeBrowserSource({url:'https://example.com/video.mp4'}, () => true), cleaned: () => cleaned };
}
for (const outcome of ['video', 'error', 'audio']) test(`browser check ${outcome}`, async () => {
 const harness = setup(outcome);
 assert.equal(await harness.run(), outcome === 'video');
 assert.equal(harness.cleaned(), true);
});

test('source discovery runs checks and keeps all links available', () => {
 assert.match(source, /checkBrowserSources\(state.playerRequest\)/);
 assert.doesNotMatch(source, /checkBrowserSources\(requestId\);/);
 assert.match(source, /state.sourceFilter = 'all'/);
});

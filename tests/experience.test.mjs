import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const experience = fs.readFileSync(new URL('../public/js/experience.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const worker = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('the production shell loads the interaction layer and refreshes its cache', () => {
  assert.match(index, /experience\.js\?v=20260913-2/);
  assert.match(worker, /tshow-shell-v40/);
  assert.match(worker, /experience\.js\?v=20260913-2/);
});

test('smart search, mobile navigation and player gestures remain wired', () => {
  assert.match(experience, /smart-search-panel/);
  assert.match(experience, /mobile-dock/);
  assert.match(experience, /addEventListener\('dblclick'/);
  assert.match(experience, /addEventListener\('pointerup'/);
  assert.match(experience, /video\.currentTime - 10/);
  assert.match(experience, /video\.currentTime \+ 10/);
});

test('the PWA exposes useful launch shortcuts', () => {
  assert.equal(manifest.id, '/');
  assert.deepEqual(manifest.shortcuts.map((shortcut) => shortcut.name), ['Movies', 'Series', 'My List']);
});


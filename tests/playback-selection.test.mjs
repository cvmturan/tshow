import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const expression = source.match(/const selectedVideoId = ([^;]+);/)[1];
const select = new Function('media', 'requestedVideoId', 'state', 'mediaType', 'return ' + expression);
test('Mayday never inherits Silo episode IDs, including after repeated switching', () => {
 const state = {activeVideoId: 'tt14688458:1:2'};
 const type = m => m.media_type;
 assert.equal(select({media_type:'movie'}, null, state, type), null);
 assert.equal(select({media_type:'tv'}, 'tt14688458:1:2', state, type), 'tt14688458:1:2');
 assert.equal(select({media_type:'movie'}, state.activeVideoId, state, type), null);
 assert.equal(select({media_type:'tv'}, null, state, type), null);
});

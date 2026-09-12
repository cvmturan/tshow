import assert from 'node:assert/strict';
import test from 'node:test';
import {uniqueHistory,historyIdentity} from '../public/js/media-history.mjs';
import {validateData} from '../cloudflare/accounts.mjs';
test('recent history merges the same IMDb title from different catalogs, preserving newest first',()=>{
 const newest={id:'tt14688458',media_type:'tv',_sourceAddonId:'discovery',name:'Silo'};
 const older={...newest,_sourceAddonId:'cinemeta'};
 assert.deepEqual(uniqueHistory([newest,older]),[newest]);
 assert.deepEqual(JSON.parse(validateData('recentlyViewed',[newest,older])),[newest]);
});
test('identity keeps remakes, movies and series, and provider-only IDs distinct',()=>{
 const items=[{id:'tt123456',media_type:'movie'},{id:'tt123457',media_type:'movie'},{id:'tt123456',media_type:'tv'},{id:'custom:1',_sourceAddonId:'one'},{id:'custom:1',_sourceAddonId:'two'}];
 assert.equal(uniqueHistory(items).length,5);
});
test('IMDb and TMDB aliases identify a title consistently',()=>{
 assert.equal(historyIdentity({id:'provider:1',imdb_id:'tt123456',media_type:'movie'}),historyIdentity({id:'tt123456',media_type:'movie'}));
 assert.equal(historyIdentity({id:123,media_type:'movie'}),historyIdentity({id:'alias',_tmdbId:123,media_type:'movie'}));
});

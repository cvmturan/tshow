import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
const body=source.slice(source.indexOf('    async function applySubtitleChoice(value) {'),source.indexOf('    function srtToVtt(text) {'));
function harness() {
 const track={mode:'showing'};
 const state={playerRequest:1,streams:[{subtitles:[]}],activeStreamIndex:0};
 const elements={videoPlayer:{textTracks:[track]},subtitleSelect:{value:'0'},playerDialog:{open:true}};
 const attached=[]; let resolveFetch;
 const fetchPromise=new Promise(resolve=>resolveFetch=resolve);
 const apply=new Function('state','elements','removeExternalSubtitleTracks','embeddedSubtitleTracks','subtitleOptions','isSafeWebURL','subtitleTrackSrc','fetch','showToast','srtToVtt','attachSubtitleTrack',body+';return applySubtitleChoice;')(
 state,elements,()=>{},()=>[track],()=>[{url:'https://sub.example/caption.vtt'}],()=>true,()=>'',()=>fetchPromise,()=>{},x=>x,(...args)=>attached.push(args));
 return {state,elements,track,attached,apply,resolveFetch};
}
test('late subtitle response cannot attach after changing source',async()=>{
 const h=harness();const pending=h.apply('0');
 h.state.subtitleRequest++;
 h.resolveFetch(new Response('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello'));
 await pending;assert.equal(h.attached.length,0);
});
test('late subtitle response cannot attach to another title with same option index',async()=>{
 const h=harness();const pending=h.apply('0');
 h.state.playerRequest++;
 h.resolveFetch(new Response('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello'));
 await pending;assert.equal(h.attached.length,0);
});
test('Off disables embedded captions and embedded selection enables the chosen track',async()=>{
 const h=harness();await h.apply('');assert.equal(h.track.mode,'disabled');
 await h.apply('embedded:0');assert.equal(h.track.mode,'showing');
});

test('external subtitle track is enabled immediately so the browser starts loading it',()=>{
 const fragment=source.slice(source.indexOf('    function attachSubtitleTrack('),source.indexOf('    async function applySubtitleChoice('));
 const track={track:{mode:'disabled'},dataset:{},addEventListener(){}};
 let appended=false;
 const attach=new Function('document','elements',fragment+';return attachSubtitleTrack;')({createElement:()=>track},{videoPlayer:{append(){appended=true;}}});
 attach('blob:test','English','en','remote');
 assert.equal(appended,true);assert.equal(track.track.mode,'showing');
});

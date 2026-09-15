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

 assert.match(source, /state.sourceFilter = 'all'/);
});

const automation = source.slice(source.indexOf('    function stopSourceAutomation('), source.indexOf('    function probeBrowserSource('));
function automationHarness() {
 let id=0;const timers=new Map(),applied=[];
 const state={playerRequest:1,scanGeneration:1,activeStreamIndex:0,autoTried:new Set([0]),streams:[{url:'https://example.com/one'},{url:'https://example.com/two'},{isDemo:true,url:'https://example.com/demo'}]};
 const video={hidden:false,paused:false,readyState:4,videoWidth:1920,currentTime:10,buffered:{length:1,start:()=>0,end:()=>30}};
 const context={state,elements:{playerDialog:{open:true},videoPlayer:video,playerSourceNote:{}},clearTimeout:key=>timers.delete(key),setTimeout:fn=>{timers.set(++id,fn);return id;},renderSourcePicker(){},browserAttemptURL:s=>s?.url,applyStream:i=>applied.push(i),probeBrowserSource:async()=>true};
 vm.createContext(context);vm.runInContext(automation,context);
 const tick=async()=>{const [key,fn]=timers.entries().next().value;timers.delete(key);await fn();};
 return {context,state,video,timers,applied,tick};
}
test('a failed foreground source never changes the user selection',()=>{
 assert.doesNotMatch(source, /advanceFailedSource\(message\)/);
 assert.doesNotMatch(automation, /applyStream\(next\.index\)/);
});
test('background checking waits for buffer and confirms an alternative without switching playback',async()=>{
 const h=automationHarness();h.video.buffered.end=()=>12;
 h.context.checkBrowserSources(1);await h.tick();assert.equal(h.state.streams[1]._browserChecked,undefined);
 h.video.buffered.end=()=>30;await h.tick();assert.equal(h.state.streams[1]._browserChecked,true);assert.deepEqual(h.applied,[]);
 assert.doesNotMatch(automation, /stream\._browserCheckDone=true;\s*renderSourcePicker\(\)/);
});
test('cancelled background results cannot mark another title or source',async()=>{
 const h=automationHarness();let finish;h.context.probeBrowserSource=()=>new Promise(resolve=>{finish=resolve;});
 h.context.checkBrowserSources(1);const pending=h.tick();h.state.scanGeneration++;h.state.playerRequest++;finish(true);await pending;
 assert.equal(h.state.streams[1]._browserChecked,undefined);
});
test('closing cancels all scheduled attempts and active probes',()=>{
 const h=automationHarness();let cancelled=false;h.state.browserProbes=new Set([()=>{cancelled=true;}]);
 h.context.checkBrowserSources(1);h.context.stopSourceAutomation();
 assert.equal(h.timers.size,0);assert.equal(cancelled,true);
});

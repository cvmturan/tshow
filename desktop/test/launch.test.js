
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {launchPlayer,playerArguments}=require('../player');
const request={url:'https://example.com/test.mp4',title:'Test',headers:{}};
function harness(outcome){
 const child=new EventEmitter();let unref=false;child.unref=()=>{unref=true;};
 const dependencies={findPlayer:async()=>({executable:'test-player',kind:'mpv',bundled:true}),startupWaitMs:5,spawn:()=>{
 queueMicrotask(()=>{if(outcome==='error')child.emit('error',{code:'ENOENT'});else{child.emit('spawn');if(outcome==='exit')child.emit('exit',1,null);}});return child;}};
 return {dependencies,child,unref:()=>unref};
}
test('missing player process returns a handled failure',async()=>{const h=harness('error');await assert.rejects(launchPlayer(request,h.dependencies),/not found/);});
test('immediate player exit is not reported as success',async()=>{const h=harness('exit');await assert.rejects(launchPlayer(request,h.dependencies),/before it was ready/);});
test('a running player is acknowledged and detached after startup',async()=>{const h=harness('running');assert.equal((await launchPlayer(request,h.dependencies)).player,'TShow Player');assert.equal(h.unref(),true);h.child.emit('exit',0,null);});
test('failed playback leaves player windows open',()=>{const mpv=playerArguments('mpv',request),vlc=playerArguments('vlc',request);assert.ok(mpv.includes('--idle=yes'));assert.ok(mpv.includes('--keep-open=yes'));assert.ok(vlc.includes('--no-play-and-exit'));assert.ok(vlc.includes('--no-one-instance'));assert.ok(!vlc.includes('--play-and-exit'));});

import assert from 'node:assert/strict';
import { startCanvasRecording, recordingExtension } from '../src/canvasRecording.js';
let owned=[];
const track=kind=>({kind,readyState:'live',stop(){this.readyState='ended';},clone(){const copy=track(kind);owned.push(copy);return copy;}});
const original=track('audio');
const canvas={captureStream(){const video=track('video');owned.push(video);return {getTracks:()=>[video],getVideoTracks:()=>[video]};}};
const microphone={getAudioTracks:()=>[original]};
globalThis.MediaStream=class {constructor(tracks){this.tracks=tracks;}};
class Recorder {
 static isTypeSupported(type){return type==='video/mp4';}
 constructor(stream,options){this.stream=stream;this.mimeType=options?.mimeType||'video/mp4';this.state='inactive';}
 start(){this.state='recording';}
 stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['video+audio'],{type:this.mimeType})});this.onstop?.();}
}
globalThis.MediaRecorder=Recorder;
let finished;
const first=startCanvasRecording({canvas,microphone,onComplete:r=>{finished=r;},onError:e=>{throw e;}});
first.stop();assert.equal(finished.extension,'mp4');assert(owned.every(t=>t.readyState==='ended'));assert.equal(original.readyState,'live');
let called=false;owned=[];
const cancelled=startCanvasRecording({canvas,microphone,onComplete:()=>{called=true;},onError:()=>{called=true;}});cancelled.cancel();assert.equal(called,false);assert(owned.every(t=>t.readyState==='ended'));assert.equal(original.readyState,'live');
owned=[];
globalThis.MediaRecorder=class extends Recorder {constructor(){super();throw new Error('encoder unavailable');}};
assert.throws(()=>startCanvasRecording({canvas,microphone,onComplete(){},onError(){}}),/encoder unavailable/);assert(owned.every(t=>t.readyState==='ended'));assert.equal(original.readyState,'live');
assert.throws(()=>startCanvasRecording({canvas,microphone:{getAudioTracks:()=>[]},onComplete(){},onError(){}}),/Start LISTEN/);
assert.equal(recordingExtension('video/webm;codecs=vp9,opus'),'webm');assert.throws(()=>recordingExtension('video/unknown'));
console.log('PASS: manual stop, MP4 fallback, matching extensions, cancelled recording, encoder failure cleanup, missing microphone, original stream preserved.');

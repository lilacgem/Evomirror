export function recordingExtension(type) {
 if (type.split(';')[0] === 'video/mp4') return 'mp4';
 if (type.split(';')[0] === 'video/webm') return 'webm';
 throw new Error('This browser selected an unsupported recording container.');
}
export function startCanvasRecording({ canvas, microphone, onComplete, onError, onStopping, maxDurationMs = 15000 }) {
 if (!globalThis.MediaRecorder || !canvas?.captureStream) throw new Error('Recording is not supported in this browser.');
 const audio = microphone?.getAudioTracks().filter(track => track.readyState === 'live');
 if (!audio?.length) throw new Error('Start LISTEN and allow the microphone before recording.');
 const owned = []; let recorder, timer, cancelled = false, failure = null;
 const chunks = [];
 const cleanup = () => { clearTimeout(timer); owned.forEach(track => track.stop()); };
 const stop = () => {
  clearTimeout(timer);
  if (recorder?.state !== 'inactive') { onStopping?.(); recorder.stop(); }
 };
 try {
  const videoStream = canvas.captureStream(30); owned.push(...videoStream.getTracks());
  if (!videoStream.getVideoTracks().length) throw new Error('Canvas video capture is unavailable.');
  const clonedAudio = audio.map(track => { const clone = track.clone(); owned.push(clone); return clone; });
  const combined = new MediaStream([...videoStream.getVideoTracks(), ...clonedAudio]);
  const candidates = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
  const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type));
  recorder = mimeType ? new MediaRecorder(combined, { mimeType }) : new MediaRecorder(combined);
  recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
  recorder.onerror = event => { failure = event.error || new Error('Recording failed.'); if (recorder.state !== 'inactive') stop(); };
  recorder.onstop = () => {
   cleanup();
   if (cancelled) return;
   if (failure) { onError(failure); return; }
   try {
    const type = recorder.mimeType || chunks[0]?.type || '';
    const extension = recordingExtension(type);
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error('No recording data was captured. Please try again.');
    onComplete({ blob, extension, mimeType: type });
   } catch (error) { onError(error); }
  };
  recorder.start(1000);
  timer = setTimeout(stop, maxDurationMs);
  return { stop, cancel() { cancelled = true; if (recorder.state !== 'inactive') recorder.stop(); cleanup(); }, get state() { return recorder.state; } };
 } catch (error) { cleanup(); throw error; }
}

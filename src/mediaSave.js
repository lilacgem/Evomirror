import { downloadBlob } from './sealArchive.js';
// The device owns Photos. Invoke sharing directly from the user's tap, never an async recording callback.
export function canShareMedia(blob, filename) {
 try { return Boolean(navigator.share && navigator.canShare?.({ files: [new File([blob], filename, { type: blob.type.split(';')[0] })] })); }
 catch { return false; }
}
export async function saveMedia(blob, filename) {
 const file = new File([blob], filename, { type: blob.type.split(';')[0] });
 if (canShareMedia(blob, filename)) {
  try { await navigator.share({ files: [file] }); return 'shared'; }
  catch (error) { if (error.name === 'AbortError') return 'cancelled'; throw error; }
 }
 downloadBlob(blob, filename);
 return 'downloaded';
}

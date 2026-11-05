// Local-only archive. No network uploads; each origin/browser has its own database.
const DATABASE = 'EvoMirror-SealArchive';
function openArchive() {
 return new Promise((resolve, reject) => {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => {
   if (!request.result.objectStoreNames.contains('seals')) request.result.createObjectStore('seals', { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error('Close other EvoMirror tabs and try again.'));
 });
}
export async function saveSeal(seal) {
 const db = await openArchive();
 return new Promise((resolve, reject) => {
  const tx = db.transaction('seals', 'readwrite');
  tx.objectStore('seals').add(seal);
  tx.oncomplete = () => { db.close(); resolve(); };
  tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Seal could not be saved.')); };
 });
}
export async function loadSeals() {
 const db = await openArchive();
 return new Promise((resolve, reject) => {
  const tx = db.transaction('seals', 'readonly');
  const request = tx.objectStore('seals').getAll();
  tx.oncomplete = () => { db.close(); resolve(request.result.sort((a,b) => b.createdAt.localeCompare(a.createdAt))); };
  tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Archive could not be opened.')); };
 });
}
export function downloadBlob(blob, filename) {
 const url = URL.createObjectURL(blob);
 const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
 setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function exportSeal(seal) {
 const imageDataUrl = await new Promise((resolve,reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(seal.image);
 });
 const { image, ...metadata } = seal;
 void image;
 downloadBlob(new Blob([JSON.stringify({ ...metadata, imageDataUrl }, null, 2)], { type: 'application/json' }), `EvoMirror-Seal-${seal.id}.json`);
}

import * as THREE from 'three';
import provenance from './imprintMaps.json';
// Numerical contours derived from the creator's handwriting-origin artwork.
export { provenance as imprintProvenance };
export function createImprintField() {
 const size = provenance.maps[0].size;
 const textures = [0, 1, 2].map(group => {
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
   for (let channel = 0; channel < 3; channel++) pixels[i * 4 + channel] = provenance.maps[group * 3 + channel].values[i];
   pixels[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
 });
 function sample(u, v, layer = 0) {
  const x = ((u % 1 + 1) % 1) * size;
  const y = ((v % 1 + 1) % 1) * size;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const values = provenance.maps[layer].values;
  const at = (a, b) => values[(b % size) * size + (a % size)] / 255;
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(x0,y0),at(x0+1,y0),fx),THREE.MathUtils.lerp(at(x0,y0+1),at(x0+1,y0+1),fx),fy);
 }
 return { texture: textures[0], detailTexture: textures[1], depthTexture: textures[2], sample, dispose: () => textures.forEach(texture => texture.dispose()) };
}

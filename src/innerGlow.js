import * as THREE from 'three';
import field from './innerGlow.json';
export const innerGlowProvenance = field.provenance;
export function createInnerGlowTexture() {
 const pixels = new Uint8Array(field.size * field.size * 4);
 for (let i = 0; i < field.light.length; i++) {
  pixels[i*4] = field.light[i]; pixels[i*4+1] = field.contours[i]; pixels[i*4+3] = 255;
 }
 const texture = new THREE.DataTexture(pixels, field.size, field.size, THREE.RGBAFormat);
 texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
 texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
 return texture;
}

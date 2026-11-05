import * as THREE from 'three';
// Fixed seed keeps the same surrounding space across reloads and saved moments.
export const spaceProvenance = { version: 'deep-space/1', seed: 36955, type: 'Procedural artistic starfield and nebula; not an astronomical sky survey.' };
export function createDeepSpace() {
 const group = new THREE.Group();
 let seed = spaceProvenance.seed;
 const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
 const count = 5200;
 const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), sizes = new Float32Array(count);
 const palette = [0xdce7ff, 0xffedcf, 0xc2d8ff, 0xffffff, 0xffd9ae];
 for (let i = 0; i < count; i++) {
  const z = -70 - random() * 530;
  positions.set([(random()-.5)*(-z)*2.8, (random()-.5)*(-z)*2.1, z],i*3);
  const color = new THREE.Color(palette[Math.floor(random()*palette.length)]);
  const brightness = .28 + Math.pow(random(),3)*.72;
  colors.set([color.r*brightness,color.g*brightness,color.b*brightness],i*3);
  sizes[i] = random() > .985 ? 3 + random()*2 : .7 + random()*1.4;
 }
 const geometry = new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
 geometry.setAttribute('starSize',new THREE.BufferAttribute(sizes,1));
 const material = new THREE.ShaderMaterial({
  vertexShader: `attribute vec3 color; attribute float starSize; varying vec3 vColor;
   void main(){ vColor=color; vec4 view=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*view; gl_PointSize=starSize; }`,
  fragmentShader: `varying vec3 vColor;
   void main(){ float r=length(gl_PointCoord-.5)*2.; if(r>1.) discard;
    float core=exp(-r*r*12.); float halo=exp(-r*r*3.)*.18;
    gl_FragColor=vec4(vColor,core+halo); }`,
  transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, fog:false,
 });
 group.add(new THREE.Points(geometry,material));
 const sky = new THREE.Mesh(new THREE.SphereGeometry(750,32,16),new THREE.ShaderMaterial({
  vertexShader:`varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader:`varying vec3 direction;
   float hash(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
   float noise(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
   float fbm(vec3 p){ float n=0.,amp=.5; for(int i=0;i<5;i++){n+=noise(p)*amp;p=p*2.03+vec3(7.1,3.4,5.2);amp*=.5;}return n; }
   void main(){vec3 d=normalize(direction);float clouds=fbm(d*7.+vec3(3,5,2));
    float band=exp(-pow((d.y+d.x*.32+.04)*3.5,2.));
    float wisps=smoothstep(.36,.76,clouds)*band;
    float dust=smoothstep(.48,.7,fbm(d*18.+vec3(8)));
    vec3 gas=mix(vec3(.045,.025,.075),vec3(.025,.065,.11),fbm(d*4.+vec3(1)));
    vec3 color=vec3(.001,.0015,.004)+gas*wisps*(1.-dust*.78);
    gl_FragColor=vec4(color,1.); }`,
  side:THREE.BackSide,depthWrite:false,fog:false,
 }));
 sky.renderOrder=-2; group.add(sky);
 return group;
}

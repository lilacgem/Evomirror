import * as THREE from 'three';
// Mist and rays are artistic sound-responsive light, not a physical frequency display.
export function createMistMaterial() {
 return new THREE.ShaderMaterial({
  uniforms:{time:{value:0},energy:{value:0},fusion:{value:0},tint:{value:new THREE.Color('#9673ff')}},
  vertexShader:`uniform float time,energy,fusion; varying float vOpacity,vAngle;
   void main(){vec4 view=modelViewMatrix*vec4(position,1.);
    float seed=fract(sin(dot(position.xy,vec2(12.9898,78.233)))*43758.5453);
    gl_Position=projectionMatrix*view;
    gl_PointSize=clamp((9.+seed*14.+energy*4.)*35./max(15.,-view.z),2.,42.);
    vOpacity=(.014+seed*.018)*(1.-fusion*.90);vAngle=seed*6.283+time*.025;}`,
  fragmentShader:`uniform vec3 tint; uniform float energy; varying float vOpacity,vAngle;
   void main(){vec2 p=gl_PointCoord-.5;p=mat2(cos(vAngle),-sin(vAngle),sin(vAngle),cos(vAngle))*p;
    float wispy=exp(-(p.x*p.x*28.+p.y*p.y*10.));
    float edge=(1.-smoothstep(.25,.5,length(gl_PointCoord-.5)));
    gl_FragColor=vec4(tint,wispy*edge*vOpacity*(.7+energy*.4));}`,
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,
 });
}
export function createResonantRays() {
 const count=48,positions=new Float32Array(count*6),fade=new Float32Array(count*2);
 for(let i=0;i<count;i++){fade[i*2]=.7;fade[i*2+1]=0;}
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('fade',new THREE.BufferAttribute(fade,1));
 const material=new THREE.ShaderMaterial({
  uniforms:{tint:{value:new THREE.Color('#9ebaff')},strength:{value:.1}},
  vertexShader:`attribute float fade; varying float vFade; void main(){vFade=fade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform vec3 tint; uniform float strength; varying float vFade; void main(){gl_FragColor=vec4(tint,vFade*strength);}`,
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,
 });
 const rays=new THREE.LineSegments(geometry,material);rays.frustumCulled=false;
 return {object:rays,update(time,centerY,radius,energy,brightness){
  for(let i=0;i<count;i++){
   const angle=i*2.399963+time*.015;
   const z=Math.sin(i*17.31)*.65;
   const spread=Math.sqrt(1-z*z);
   const start=radius*(1.04+.1*Math.sin(time*.2+i));
   const length=radius*(.45+(.5+.5*Math.sin(i*8.7))*.7)*(1+brightness*.2);
   const x=Math.cos(angle)*spread,y=Math.sin(angle)*spread;
   positions.set([x*start,centerY+y*start,z*start,x*(start+length),centerY+y*(start+length),z*(start+length)],i*6);
  }
  geometry.attributes.position.needsUpdate=true;
  material.uniforms.strength.value=.045+energy*.07+brightness*.035;
 }};
}

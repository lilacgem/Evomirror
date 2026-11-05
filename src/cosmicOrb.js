// Layered procedural gas and filaments. No photograph or static orb texture.
export const cosmicOrbFragment = `
 uniform sampler2D imprint, detailImprint, depthImprint, innerGlow;
 uniform float time, energy;
 uniform vec3 tint;
 varying vec3 vNormal, vView, vPosition;
 varying vec2 vImprintUV;
 float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float fbm(vec3 p){float n=0.,a=.55;for(int i=0;i<4;i++){n+=noise(p)*a;p=p*2.04+vec3(3.7,7.1,2.4);a*=.48;}return n;}
 void main(){
  vec3 normal=normalize(vNormal); float facing=max(dot(normal,normalize(vView)),0.);
  float rim=pow(1.-facing,2.6);
  vec2 drift=vec2(time*.003,-time*.002);
  vec2 viewShift=normalize(vView).xy*.045;
  vec3 primary=texture2D(imprint,vImprintUV+drift).rgb;
  vec3 detail=texture2D(detailImprint,vImprintUV*2.+viewShift-drift).rgb;
  vec3 depth=texture2D(depthImprint,vImprintUV*3.-viewShift*2.+drift).rgb;
  vec2 inner=texture2D(innerGlow,vImprintUV*.8+viewShift+drift*.3).rg;
  float marks=dot(primary,vec3(.44,.32,.24));
  float branching=detail.g;
  float layers=dot(detail,vec3(.35,.3,.35))*.55+dot(depth,vec3(.3,.4,.3))*.45;
  vec3 color=vec3(.012,.006,.03);
  // Eight depth slices traverse a curved volume, with independent cloud structure.
  for(int i=0;i<8;i++){
   float z=(float(i)/7.*2.-1.)*sqrt(max(.0,1.-dot(normal.xy,normal.xy)));
   vec3 p=vec3(normal.xy,z)*3.3;
   float angle=time*.025+float(i)*.11;
   p.xy=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.xy;
   vec3 warp=vec3(fbm(p+time*.018),fbm(p+vec3(8,3,2)),fbm(p+vec3(2,9,5)))-.45;
   float gas=fbm(p+warp*1.8+marks*.28);
   float cloud=smoothstep(.37,.71,gas);
   float filament=pow(max(0.,1.-abs(gas-(.46+branching*.045))*36.),3.);
   float palette=fbm(p*.65+vec3(12));
   vec3 hue=mix(vec3(.10,.23,.70),vec3(.63,.08,.47),smoothstep(.32,.66,palette));
   hue=mix(hue,tint,.065);
   float pinpoints=pow(noise(p*24.+float(i)),36.)*(.3+depth.r*.7);
   color+=hue*cloud*(.13+layers*.09);
   color+=mix(vec3(.23,.56,1.),vec3(1.,.46,.66),palette)*filament*(.10+energy*.065);
   color+=vec3(.7,.8,1.)*pinpoints*.11;
  }
  vec3 skin=normalize(vPosition)*5.5;
  float surfaceNoise=fbm(skin+vec3(fbm(skin*1.4+time*.012))*.9);
  float veins=pow(max(0.,1.-abs(surfaceNoise-(.47+branching*.025))*46.),2.);
  color+=mix(vec3(.25,.6,1.),vec3(.95,.5,.7),layers)*veins*(.12+energy*.08)*(1.-pow(facing,12.)*.75);
  float core=pow(facing,18.);
  float coreHalo=pow(facing,4.5);
  float breath=.91+.09*sin(time*.7+inner.g*2.);
  color+=vec3(1.,.68,.30)*core*(1.65+inner.r*.55+energy*.3)*breath;
  color+=vec3(.40,.21,.10)*coreHalo*(.38+inner.g*.18);
  color+=mix(vec3(.20,.42,1.),vec3(.7,.23,.65),normal.y*.5+.5)*rim*.65;
  color=vec3(1.)-exp(-color*1.25);
  gl_FragColor=vec4(color,.92+rim*.08);
 }
`;

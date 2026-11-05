import * as THREE from './vendor/three.module.js';
import {natureTime} from './naturalism.js';

// One sky model is shared by the dome and water: their clouds and light agree.
// Analytic cloud layers avoid a full-screen volumetric ray march on phones.
export const atmosphere={
 topColor:{value:new THREE.Color(0x6d9fc9)},horizonColor:{value:new THREE.Color(0xd6e0dc)},
 sunDirection:{value:new THREE.Vector3(-.5,.55,-.8).normalize()},
 sunColor:{value:new THREE.Color(0xffecd0)},cloudColor:{value:new THREE.Color(0xfff4df)},
 nightMix:{value:0},cloudQuality:{value:1},natureTime
};
export const skyGLSL=`
uniform vec3 topColor, horizonColor, sunDirection, sunColor, cloudColor;
uniform float nightMix, cloudQuality, natureTime;
float skyHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float skyNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(skyHash(i),skyHash(i+vec2(1,0)),f.x),mix(skyHash(i+vec2(0,1)),skyHash(i+vec2(1,1)),f.x),f.y);
}
float skyFbm(vec2 p,float detail){
 float n=.52*skyNoise(p);p=mat2(1.6,-1.2,1.2,1.6)*p+7.1;
 n+=.26*skyNoise(p);p=mat2(1.6,-1.2,1.2,1.6)*p+7.1;
 n+=.13*skyNoise(p);
 if(detail>.5){p=mat2(1.6,-1.2,1.2,1.6)*p+7.1;n+=.065*skyNoise(p);p*=2.03;n+=.0325*skyNoise(p);}
 return n;
}
vec2 cloudPlane(vec3 d){return d.xz/(max(d.y,0.0)+.19)*2.15+vec2(natureTime*.004,-natureTime*.0015);}
float cloudDensity(vec2 p,float detail){
 float field=skyFbm(p,detail);
 return smoothstep(.48,.76,field+.065*skyNoise(p*.37+18.0));
}
// Daylight clouds dissolve through dusk; a clear star field dominates the night.
float nightCloudVisibility(){return mix(1.0,0.0,smoothstep(0.0,1.0,nightMix));}
float cloudCover(vec3 d){if(nightMix>.995)return 0.0;return cloudDensity(cloudPlane(d),cloudQuality)*smoothstep(.025,.18,d.y)*nightCloudVisibility();}
vec3 meadowSky(vec3 d,float detail){
 float h=max(d.y,0.0),day=1.0-nightMix;
 float mu=clamp(dot(d,sunDirection),-1.0,1.0);
 float angle=acos(mu);
 vec3 color=mix(horizonColor,topColor,pow(smoothstep(-.04,.9,h),.47));
 float sunset=1.0-smoothstep(.02,.46,sunDirection.y);
 float sunFacing=pow(max(mu,0.0),4.0);
 color+=sunColor*day*(.075*exp(-angle*3.0)+.26*exp(-angle*22.0));
 color=mix(color,mix(horizonColor,sunColor,.26),sunFacing*sunset*exp(-h*5.0)*.35*day);
 // Soft solar disc and forward scattering, with no giant polygonal sun.
 color+=sunColor*day*(2.5*(1.0-smoothstep(.006,.009,angle))+.26*exp(-angle*85.0));
 vec2 p=cloudPlane(d);
 float density=cloudDensity(p,detail),cover=density*smoothstep(.025,.18,h)*nightCloudVisibility();
 float ahead=cloudDensity(p+sunDirection.xz*.32,0.0);
 float edgeLight=clamp((density-ahead)*2.7,-.25,.8);
 vec3 shade=mix(topColor,horizonColor,.55)*(.58+.22*day);
 vec3 lit=cloudColor*(.82+.24*edgeLight);
 vec3 cloud=mix(lit,shade,smoothstep(.12,.85,density)*.67);
 cloud+=sunColor*day*pow(max(mu,0.0),12.0)*pow(1.0-density,3.0)*.3;
 color=mix(color,cloud,smoothstep(0.0,.8,cover)*.96);
 if(detail>.5){
  vec2 feather=d.xz/(h+.24)*vec2(1.5,6.0)+vec2(natureTime*.0012,19.0);
  float cirrus=smoothstep(.56,.76,skyFbm(feather,1.0));
  color=mix(color,cloudColor,cirrus*.20*smoothstep(.1,.4,h)*nightCloudVisibility());
 }
 // Static galactic haze and dark dust lanes, visible even in lightweight mode.
 // This is a naturalistic sky composition, not an astronomical star catalogue.
 if(nightMix>.001){
  vec3 galacticNormal=normalize(vec3(.74,.33,.58));
  float latitude=dot(d,galacticNormal);
  float longitude=atan(dot(d,normalize(vec3(-.58,0.0,.74))),dot(d,normalize(vec3(-.26,.94,-.20))));
  float band=exp(-pow(latitude*9.0,2.0));
  float outerBand=exp(-pow(latitude*4.0,2.0));
  float structure=skyFbm(d.xz*23.0+d.y*vec2(9.0,-5.0)+21.0,0.0);
  float dust=skyFbm(d.xz*38.0+d.y*vec2(-6.0,4.0)+8.0,0.0);
  float rift=exp(-pow((latitude+.018*sin(longitude*5.0))*38.0,2.0))*smoothstep(.28,.65,dust);
  float core=exp(-pow(longitude*.85,2.0))*band;
  vec3 galaxy=(vec3(.065,.073,.091)*band*(.40+structure*1.2)+vec3(.014,.018,.026)*outerBand+vec3(.042,.037,.030)*core*(.45+structure));
  galaxy*=1.0-rift*.78;
  color+=galaxy*nightMix*(1.0-cover)*smoothstep(.02,.20,h);
 }
 vec3 moonDir=normalize(vec3(-76.0,58.0,-106.0));
 color+=vec3(.10,.13,.19)*exp(-acos(clamp(dot(d,moonDir),-1.0,1.0))*22.0)*nightMix*(1.0-cover);
 return max(color,vec3(0));
}
`;
// Celestial geometry is camera-relative, but its depth must always be behind
// terrain. A fixed world-space sphere can otherwise sit in front of far peaks.
export function finishCelestialDepth(material){
 const previousCompile=material.onBeforeCompile.bind(material);
 const previousKey=material.customProgramCacheKey();
 material.depthTest=true;material.depthWrite=false;
 material.onBeforeCompile=(shader,renderer)=>{
  previousCompile(shader,renderer);
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
   '#include <project_vertex>\n gl_Position.z = gl_Position.w; // celestial far depth');
 };
 material.customProgramCacheKey=()=>previousKey+'|celestial-far-depth-v1';
}

export function createAtmosphere(){
 const material=new THREE.ShaderMaterial({uniforms:atmosphere,side:THREE.BackSide,depthWrite:false,
  vertexShader:`varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w;}`,
  fragmentShader:`varying vec3 skyDirection;${skyGLSL}
   void main(){gl_FragColor=vec4(meadowSky(normalize(skyDirection),cloudQuality),1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 });
 const dome=new THREE.Mesh(new THREE.SphereGeometry(310,32,20),material);
 dome.name='sky-dome';dome.renderOrder=-100;dome.frustumCulled=false;return dome;
}

const groundGLSL=`
float landNoise(vec3 p){return sin(p.x+sin(p.z*1.13))*cos(p.z*.83+sin(p.y));}
`;
export function finishLandscape(material,rock=false){
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 landPosition;varying vec3 landNormal;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vec4 landLocal=vec4(position,1.0);vec3 surfaceNormal=normal;
   #ifdef USE_INSTANCING
    landLocal=instanceMatrix*landLocal;surfaceNormal=mat3(instanceMatrix)*surfaceNormal;
   #endif
   landPosition=(modelMatrix*landLocal).xyz;landNormal=normalize(mat3(modelMatrix)*surfaceNormal);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 landPosition;varying vec3 landNormal;${groundGLSL}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 lp=landPosition;
   float broad=landNoise(lp*.19),grain=landNoise(lp*2.7)*.5+landNoise(lp*8.1)*.25;
   float closeDetail=1.0-smoothstep(35.0,140.0,length(vViewPosition));
   diffuseColor.rgb*=.96+broad*.09+grain*.12*closeDetail;
   ${rock?`float steep=1.0-abs(normalize(landNormal).y);
   float seams=pow(.5+.5*sin(lp.y*1.4+landNoise(lp*.37)*2.2),9.0);
   diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.75,.73,.68),seams*.35);
   float moss=smoothstep(.4,.8,landNoise(lp*.32)*.5+.5)*(1.0-smoothstep(.35,.82,steep));
   diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.75,.92,.62),moss*.35);`:
   `float meadow=landNoise(lp*.055)*.5+.5;
   diffuseColor.rgb*=mix(vec3(.82,.94,.76),vec3(1.06,1.02,.86),meadow);`}
  `);
 };
 material.customProgramCacheKey=()=>rock?'land-rock-v2':'land-ground-v2';
}

export function finishReflectiveWater(material,waterBodies,{riverStart=-48,riverEnd=122}={}){
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,atmosphere);
  shader.uniforms.shoreBodies={value:waterBodies.map(w=>new THREE.Vector4(w.x,w.z,w.rx,w.rz))};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 waterWorld;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwaterWorld=(modelMatrix*vec4(position,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 waterWorld;uniform vec4 shoreBodies[${waterBodies.length}];${skyGLSL}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
   vec2 p=waterWorld.xz;
   float distanceFade=1.0-smoothstep(25.0,130.0,length(vViewPosition));
   float waveX=sin(p.x*.68+p.y*.31+natureTime*.48)*.045+sin(p.x*2.3-p.y*.94-natureTime*.65)*.018*distanceFade;
   float waveZ=cos(p.y*.71-p.x*.25+natureTime*.37)*.045+cos(p.y*2.7+p.x*1.2-natureTime*.58)*.018*distanceFade;
   vec3 waveNormal=normalize(vec3(waveX,1.0,waveZ));
   normal=normalize(mat3(viewMatrix)*waveNormal);
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
   vec3 waterView=normalize(cameraPosition-waterWorld);
   vec3 reflectedDirection=reflect(-waterView,waveNormal);
   float fresnel=.045+.80*pow(1.0-max(dot(waterView,waveNormal),0.0),4.0);
   float shore=100.0;
   for(int i=0;i<${waterBodies.length};i++){
    vec4 b=shoreBodies[i];vec2 offset=(waterWorld.xz-b.xy)/b.zw;
    float a=atan(-offset.y,offset.x);
    float irregular=(i==0?.12:(i==1?.045:.06));
    float boundary=1.0+(sin(a*3.0+.5)+cos(a*5.0))*.5*irregular;
    float edge=(boundary-length(offset))*min(b.z,b.w);
    if(edge>=-.05)shore=min(shore,max(edge,0.0));
   }
   if(waterWorld.z>=${riverStart.toFixed(1)}&&waterWorld.z<=${riverEnd.toFixed(1)}){
    float river=3.1-abs(waterWorld.x-(25.0+8.0*sin((waterWorld.z+30.0)*.055)));
    if(river>=0.0)shore=min(shore,river);
   }
   float shallow=1.0-smoothstep(.1,3.5,shore);
   outgoingLight=mix(outgoingLight,outgoingLight*vec3(1.12,1.22,1.08),shallow*.55);
   outgoingLight=mix(outgoingLight,meadowSky(reflectedDirection,0.0),fresnel);
   float foam=(1.0-smoothstep(.0,.26,shore))*(.4+.6*skyNoise(p*2.0+vec2(natureTime*.1)));
   outgoingLight=mix(outgoingLight,cloudColor*.65,foam*.22);
   #include <opaque_fragment>
  `);
 };
 material.customProgramCacheKey=()=> 'meadow-reflective-water-v2';
}

// A seeded distribution avoids a visible grid or repeating spiral. The extra
// faint stars near the galactic plane share the direction of the diffuse band.
export function createStarfield(){
 const count=48000,fieldCount=24000,positions=[],colors=[],sizes=[],brightness=[],phases=[];
 let seed=842901;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(random(),1e-7)))*Math.cos(random()*Math.PI*2);
 const direction=new THREE.Vector3(),galacticNormal=new THREE.Vector3(.74,.33,.58).normalize();
 const axis=new THREE.Vector3(-.58,0,.74).normalize();
 const upward=new THREE.Vector3().crossVectors(axis,galacticNormal).normalize();
 const palette=[0xf4f5ff,0xe2ecff,0xfff4dc,0xffdfba],color=new THREE.Color();
 for(let i=0;i<count;i++){
  const galactic=i>=fieldCount;
  if(galactic){
   // Mix a narrow stellar river with a broad halo, and break its density into
   // irregular knots. Mirroring across the origin keeps the visible hemisphere.
   let longitude=random()*Math.PI*2;
   if(random()<.30)longitude=gaussian()*.65;
   const width=random()<.68?.040:.115,latitude=THREE.MathUtils.clamp(gaussian()*width,-.36,.36);
   direction.copy(upward).multiplyScalar(Math.cos(longitude)).addScaledVector(axis,Math.sin(longitude));
   direction.multiplyScalar(Math.cos(latitude)).addScaledVector(galacticNormal,Math.sin(latitude)).normalize();
   if(direction.y<0)direction.negate();
  }else{
   const a=random()*Math.PI*2,y=.012+random()*.988,r=Math.sqrt(1-y*y);
   direction.set(Math.cos(a)*r,y,Math.sin(a)*r);
  }
  positions.push(direction.x*225,direction.y*225,direction.z*225);
  const magnitude=random(),bright=!galactic&&magnitude>.988,medium=!galactic&&magnitude>.85;
  sizes.push(bright?1.1+random()*.7:medium?.65+random()*.40:.32+random()*(galactic?.28:.34));
  brightness.push(bright?1.7+random()*1.5:medium?.70+random()*.55:galactic?.18+random()*.46:.17+random()*.40);
  phases.push(random()*Math.PI*2);
  const tint=random();color.setHex(palette[tint<.63?0:tint<.83?1:tint<.97?2:3]);colors.push(color.r,color.g,color.b);
 }
 const geometry=new THREE.BufferGeometry();
 for(const [name,data,itemSize] of [['position',positions,3],['color',colors,3],['starSize',sizes,1],['starBrightness',brightness,1],['starPhase',phases,1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(data,itemSize));
 const material=new THREE.PointsMaterial({color:0xffffff,vertexColors:true,size:1.05,fog:false,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
 finishStars(material);
 const stars=new THREE.Points(geometry,material);stars.name='night-starfield';stars.visible=false;return stars;
}

// Bright stars are scarce. Most stay small and dim; shimmer is slow and subtle.
export function finishStars(material){
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,atmosphere);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
   attribute float starSize,starBrightness,starPhase;
   uniform float natureTime;
   varying vec3 starDirection;varying float stellarLight;
  `);
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   starDirection=normalize(position);
   float shimmer=1.0+(.025+.045*(1.0-starDirection.y))*sin(natureTime*(.65+starPhase*.08)+starPhase)*sin(natureTime*.39+starPhase*2.7);
   stellarLight=starBrightness*shimmer*smoothstep(.01,.24,starDirection.y);
  `);
  shader.vertexShader=shader.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * starSize;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 starDirection;varying float stellarLight;${skyGLSL}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
   float pointRadius=length(gl_PointCoord-.5)*2.0;
   diffuseColor.a*=pow(max(0.0,1.0-pointRadius*pointRadius),1.6)*(1.0-cloudCover(normalize(starDirection)));
   outgoingLight*=stellarLight;
   #include <opaque_fragment>`);
 };
 material.customProgramCacheKey=()=> 'dense-galactic-stars-v3';
 finishCelestialDepth(material);
}

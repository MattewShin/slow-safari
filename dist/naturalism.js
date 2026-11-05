import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Small, seamless, shared textures keep the meadow self-contained and inexpensive.
export const natureTime={value:0};
export function surfaceTexture(kind,repeat=1){
 const size=256,data=new Uint8Array(size*size*4);
 const hash=(x,y)=>{let n=Math.imul(x+97,374761393)^Math.imul(y+53,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 const noise=(u,v,period)=>{
  const px=u*period,py=v*period,x=Math.floor(px),y=Math.floor(py),fx=px-x,fy=py-y;
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  const n=(dx,dy)=>hash(((x+dx)%period+period)%period,((y+dy)%period+period)%period);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(n(0,0),n(1,0),sx),THREE.MathUtils.lerp(n(0,1),n(1,1),sx),sy);
 };
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,broad=noise(u,v,4),medium=noise(u,v,16),fine=noise(u,v,64),grain=hash(x,y);
  let shade;
  if(kind==='bark'){
   const ridges=Math.pow(.5+.5*Math.cos(u*Math.PI*2*21+medium*3),5);
   shade=.56+.25*broad+.14*fine-.23*ridges+.05*grain;
  }else if(kind==='leaves')shade=.52+.22*medium+.19*fine+.07*grain;
  else if(kind==='stone')shade=.52+.25*broad+.17*medium+.09*fine+.035*grain;
  else shade=.65+.13*broad+.11*medium+.09*fine+.05*grain;
  const i=(y*size+x)*4,value=Math.round(255*THREE.MathUtils.clamp(shade,.25,1));
  data[i]=value;data[i+1]=value;data[i+2]=value;data[i+3]=255;
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(repeat,repeat);
 texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
 texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
 return texture;
}

export function contactShadowTexture(){
 const size=64,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const r=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1),i=(y*size+x)*4;
  data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(Math.pow(Math.max(0,1-r*r),2)*255);
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
 texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}

export function finishFalls(material){
 material.onBeforeCompile=shader=>{
  shader.uniforms.natureTime=natureTime;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 fallUV;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfallUV=uv;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 fallUV;uniform float natureTime;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float stream=.65+.18*sin(fallUV.x*48.0+sin(fallUV.y*11.0+natureTime*3.0))+.14*sin(fallUV.y*65.0+natureTime*9.0);
   diffuseColor.a*=stream*smoothstep(0.0,.14,fallUV.x)*smoothstep(0.0,.14,1.0-fallUV.x);
  `);
 };
 material.customProgramCacheKey=()=> 'natural-falls-v1';
}

export function foliageGeometry(){
 const parts=[];
 for(let i=0;i<11;i++){
  const g=new THREE.IcosahedronGeometry(i===0?.74:.34+(i%3)*.06,0),a=i*2.39996;
  const position=g.attributes.position,normal=g.attributes.normal,direction=new THREE.Vector3();
  for(let v=0;v<position.count;v++){direction.fromBufferAttribute(position,v).normalize();normal.setXYZ(v,direction.x,direction.y,direction.z);}
  if(i)g.translate(Math.cos(a)*(.56+(i%2)*.15),Math.sin(a*2)*.34,Math.sin(a)*(.56+(i%2)*.15));
  parts.push(g);
 }
 const result=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());return result;
}

export function finishCoat(material){
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 coatPosition;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncoatPosition=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 coatPosition;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float fibre=sin(coatPosition.x*430.0+sin(coatPosition.z*175.0)*2.0)*sin(coatPosition.y*210.0+coatPosition.z*100.0);
   float grain=sin(dot(coatPosition,vec3(91.0,127.0,83.0)));
   float detailFade=1.0-smoothstep(6.0,24.0,length(vViewPosition));
   diffuseColor.rgb*=1.0+detailFade*(fibre*.055+grain*.025);
  `);
 };
 material.customProgramCacheKey=()=> 'natural-coat-v1';
}

export function addWind(material){
 material.onBeforeCompile=shader=>{
  shader.uniforms.natureTime=natureTime;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float natureTime;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   #ifdef USE_INSTANCING
    vec3 tuftOrigin=instanceMatrix[3].xyz;
    float wind=sin(natureTime*1.25+tuftOrigin.x*.28+tuftOrigin.z*.22);
    transformed.x+=wind*pow(max(position.y,0.0),2.0)*.22;
    transformed.z+=cos(natureTime*.9+tuftOrigin.z*.25)*pow(max(position.y,0.0),2.0)*.12;
   #endif
  `);
 };
 material.customProgramCacheKey=()=> 'meadow-wind-v1';
}

export function finishWater(material,sky){
 material.onBeforeCompile=shader=>{
  shader.uniforms.natureTime=natureTime;shader.uniforms.waterSky=sky.topColor;shader.uniforms.waterHorizon=sky.horizonColor;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 waterWorld;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwaterWorld=(modelMatrix*vec4(position,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform float natureTime;uniform vec3 waterSky;uniform vec3 waterHorizon;varying vec3 waterWorld;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
   vec2 p=waterWorld.xz;
   float waveX=sin(p.x*2.1+p.y*.7+natureTime*.7)*.11+sin(p.x*5.8-p.y*2.9-natureTime*1.1)*.035;
   float waveZ=cos(p.y*2.4-p.x*.6+natureTime*.55)*.10+cos(p.y*6.2+p.x*2.0-natureTime*.8)*.03;
   vec3 waveNormal=normalize(vec3(waveX,1.0,waveZ));
   normal=normalize(mat3(viewMatrix)*waveNormal);
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
   vec3 waterView=normalize(cameraPosition-waterWorld);
   float fresnel=.04+.64*pow(1.0-max(dot(waterView,waveNormal),0.0),3.0);
   vec3 reflectedSky=mix(waterHorizon,waterSky,smoothstep(.0,.8,reflect(-waterView,waveNormal).y));
   outgoingLight=mix(outgoingLight,reflectedSky,fresnel);
   #include <opaque_fragment>
  `);
 };
 material.customProgramCacheKey=()=> 'natural-water-v1';
}

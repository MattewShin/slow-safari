import {createDiscoveries} from './discoveries.js';
import {WORLD_LIMIT} from './world-config.js';
import {SpatialIndex,createForest,createGrassField} from './world.js';
import {atmosphere, createAtmosphere, finishLandscape, finishReflectiveWater, createStarfield, finishCelestialDepth} from './landscape.js';
import {connectMeadow} from './multiplayer.js';
import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import {koreanClock} from './clock.js';
import {surfaceTexture, foliageGeometry, finishCoat, finishFalls, contactShadowTexture, addWind, natureTime} from './naturalism.js';
const $=id=>document.getElementById(id), mobile=()=>innerWidth<701;
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch(e){$('load').style.display='none';$('fallback').hidden=false;throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);renderer.setClearColor(0xdfe8d5);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('world').appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xd6e0dc,.0018);
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,1700);
const hemi=new THREE.HemisphereLight(0xf9f9df,0x879564,2.5);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffecd0,2.8);sun.position.set(-20,35,15);scene.add(sun);
sun.castShadow=true;sun.shadow.mapSize.set(mobile()?1024:2048,mobile()?1024:2048);
Object.assign(sun.shadow.camera,{left:-25,right:25,top:25,bottom:-25,near:1,far:180});
sun.shadow.bias=-.00015;sun.shadow.normalBias=.055;sun.shadow.camera.updateProjectionMatrix();scene.add(sun.target);
const M=(c,more={})=>new THREE.MeshStandardMaterial({color:c,roughness:.88,metalness:0,...more});
const mat={sand:M(0xd6ce9c),grass:M(0x9eae70),trunk:M(0x89714a),leaves:[M(0x87995a),M(0x95a35e),M(0xabb771),M(0x788e50),M(0xb4bf7d)],rock:M(0xa4a48b),dark:M(0x514c3a),white:M(0xe9e5d4),giraffe:M(0xd4a65b),patch:M(0x926837),gazelle:M(0xb58a56),belly:M(0xf1e4c5)};
const barkTexture=surfaceTexture('bark'),stoneTexture=surfaceTexture('stone'),leafTexture=surfaceTexture('leaves');
for(const material of [mat.trunk]){material.map=barkTexture;material.bumpMap=barkTexture;material.bumpScale=.13;}
mat.rock.map=stoneTexture;mat.rock.bumpMap=stoneTexture;mat.rock.bumpScale=.11;
mat.sand.map=surfaceTexture('soil');mat.sand.bumpMap=mat.sand.map;mat.sand.bumpScale=.025;
for(const material of mat.leaves){material.map=leafTexture;material.bumpMap=leafTexture;material.bumpScale=.11;material.roughness=.94;}
finishLandscape(mat.rock,true);finishLandscape(mat.sand);
const foliage=foliageGeometry();
// Carve a temporary sight corridor through foliage while keeping trees batched.
const treeSight={focus:{value:new THREE.Vector3()},radius:{value:0}};
const treeBark=mat.trunk.clone();
for(const material of [treeBark,...mat.leaves]){
 material.onBeforeCompile=shader=>{
  shader.uniforms.treeSightFocus=treeSight.focus;
  shader.uniforms.natureTime=natureTime;
  shader.uniforms.treeSightRadius=treeSight.radius;
  shader.vertexShader=shader.vertexShader.replace('#include <common>',
   '#include <common>\nvarying vec3 treeWorldPosition;uniform float natureTime;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
   `#include <begin_vertex>
   ${material!==treeBark?'transformed.x+=sin(position.x*.7+position.z*.53+natureTime*.65)*.025*min(max(position.y-2.5,0.0),3.0);':''}
   vec4 treeLocal=vec4(transformed,1.0);
   #ifdef USE_INSTANCING
    treeLocal=instanceMatrix*treeLocal;
   #endif
   treeWorldPosition=(modelMatrix*treeLocal).xyz;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`
#include <common>
varying vec3 treeWorldPosition;
uniform vec3 treeSightFocus;
uniform float treeSightRadius;
`);
  if(material!==treeBark)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 leafP=treeWorldPosition;
   float closeLeaves=1.0-smoothstep(16.0,85.0,length(vViewPosition));
   float mottling=sin(leafP.x*23.0+sin(leafP.y*31.0))*sin(leafP.z*27.0+leafP.y*19.0);
   diffuseColor.rgb*=.94+.17*mottling*closeLeaves;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`
#include <alphatest_fragment>
if(treeSightRadius>0.0){
 vec3 segment=treeSightFocus-cameraPosition;
 vec3 offset=treeWorldPosition-cameraPosition;
 float t=dot(offset,segment)/max(dot(segment,segment),0.001);
 if(t>=-0.03&&t<1.0){
  float distanceToSight=length(offset-segment*max(t,0.0));
  float keep=smoothstep(treeSightRadius*0.65,treeSightRadius,distanceToSight);
  float pattern=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));
  if(pattern>=keep)discard;
 }
}
`);
 };
}
function mesh(g,m,parent,pos,scale){const o=new THREE.Mesh(g,m);if(pos)o.position.set(...pos);if(scale)o.scale.set(...scale);parent.add(o);return o;}
const ico=new THREE.IcosahedronGeometry(1,1), sphere=new THREE.IcosahedronGeometry(1,2), box=new THREE.BoxGeometry(1,1,1);
const worldLimit=WORLD_LIMIT;let lightGraphics=false;
const pond={x:3,z:-5,rx:5.5,rz:3.7},lake={x:25,z:-75,rx:40,rz:39};
const smallPonds=[
 {x:-80,z:-49,rx:7.2,rz:5.3},
 {x:79,z:31,rx:6.2,rz:4.8},
 {x:-24,z:81,rx:8.4,rz:5.7},
 {x:84,z:-79,rx:6.8,rz:4.9},
 {x:-225,z:-135,rx:22,rz:15},{x:-260,z:170,rx:24,rz:19},
 {x:225,z:125,rx:28,rz:18},{x:-115,z:255,rx:15,rz:11},
 {x:160,z:-235,rx:22,rz:16},{x:-210,z:-290,rx:13,rz:10},
 {x:280,z:-95,rx:18,rz:12},{x:240,z:275,rx:21,rz:15},
 {x:-70,z:-230,rx:18,rz:13},{x:95,z:235,rx:16,rz:12}
];
const waterBodies=[pond,lake,...smallPonds];
function waterDistance(water,x,z){
 return Math.hypot((x-water.x)/water.rx,(z-water.z)/water.rz);
}
function nearestWaterDistance(x,z){
 let distance=Infinity;
 for(const water of waterBodies)distance=Math.min(distance,waterDistance(water,x,z));
 return distance;
}
const cliff={x:25,z:-123,rx:32,rz:19};
const falls={x:cliff.x,z:-109,top:18.06,bottom:.035,width:6.4};
function lakeDistance(x,z){return Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz);}
function cliffDistance(x,z){return Math.hypot((x-cliff.x)/cliff.rx,(z-cliff.z)/cliff.rz);}
function pondDistance(x,z){return Math.hypot((x-pond.x)/pond.rx,(z-pond.z)/pond.rz);}
const riverStart=-48,riverEnd=worldLimit+2,riverHalfWidth=3.1;
const riverX=z=>25+8*Math.sin((z+30)*.055);
const bridges=[-9,23,55,84,109,145,185,225,265,305,340].map(z=>({x:riverX(z),z}));
function riverDistance(x,z){
 return z>=riverStart&&z<=riverEnd?Math.abs(x-riverX(z)):Infinity;
}
function onBridge(x,z){
 return bridges.some(b=>Math.abs(z-b.z)<=1.85&&Math.abs(x-b.x)<=6.5);
}
function groundHeight(x,z){
 const outer=THREE.MathUtils.smoothstep(Math.max(Math.abs(x),Math.abs(z)),115,190);
 const h=Math.sin(x*.095)*.65+Math.cos(z*.11)*.45+Math.sin((x+z)*.085)*.35+outer*(3.2+Math.sin(x*.018)*Math.cos(z*.021)*4.5);
 const d=nearestWaterDistance(x,z);
 const bank=THREE.MathUtils.lerp(-.2,h,THREE.MathUtils.clamp((d-1.1)/.8,0,1));
 return THREE.MathUtils.lerp(-.55,bank,THREE.MathUtils.clamp((riverDistance(x,z)-riverHalfWidth)/2.8,0,1));
}
function height(x,z){
 const ground=groundHeight(x,z);
 if(!onBridge(x,z))return ground;
 const b=bridges.find(b=>Math.abs(z-b.z)<=1.85&&Math.abs(x-b.x)<=6.5);
 return THREE.MathUtils.lerp(ground,.80,THREE.MathUtils.clamp((6.5-Math.abs(x-b.x))/2,0,1));
}
let seed=31912;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const groundGeo=new THREE.PlaneGeometry((worldLimit+60)*2,(worldLimit+60)*2,256,256);groundGeo.rotateX(-Math.PI/2);let gp=groundGeo.attributes.position;
for(let i=0;i<gp.count;i++)gp.setY(i,groundHeight(gp.getX(i),gp.getZ(i)));
groundGeo.computeVertexNormals();const terrain=groundGeo;const colors=[];const c=new THREE.Color();for(let i=0;i<terrain.attributes.position.count;i++){
 const x=terrain.attributes.position.getX(i),z=terrain.attributes.position.getZ(i);
 const wet=nearestWaterDistance(x,z)<1.3||riverDistance(x,z)<4.8;
 c.setHex(wet?0x9e9871:0x81905a);
 c.offsetHSL(Math.sin(x*.11+z*.09)*.012,0,Math.sin(x*.18)*Math.cos(z*.15)*.045);
 colors.push(c.r,c.g,c.b);
}
// Retain the existing world layout when replacing random triangle shading.
for(let i=0;i<terrain.index.count;i++)rand();
terrain.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
const groundTexture=surfaceTexture('soil',255),terrainMaterial=M(0xffffff,{vertexColors:true,map:groundTexture,bumpMap:groundTexture,bumpScale:.065});
finishLandscape(terrainMaterial);
const terrainMesh=mesh(terrain,terrainMaterial,scene);terrainMesh.receiveShadow=true;terrainMesh.userData.keepSeparate=true;

function flatShape(rx,rz,n,material,x,z,y,irregular=.12){const sh=new THREE.Shape();for(let i=0;i<=n;i++){const a=i/n*Math.PI*2;const r=1+(Math.sin(a*3+.5)+Math.cos(a*5))*.5*irregular;const xx=Math.cos(a)*rx*r,zz=Math.sin(a)*rz*r;i?sh.lineTo(xx,zz):sh.moveTo(xx,zz);}const g=new THREE.ShapeGeometry(sh);g.rotateX(-Math.PI/2);return mesh(g,material,scene,[x,y,z]);}
flatShape(6.25,4.25,22,mat.sand,3,-5,-.06);
const waterMat=new THREE.MeshPhongMaterial({color:0x426f65,specular:0xa9c7c2,shininess:140,transparent:true,opacity:.94});flatShape(5.55,3.7,24,waterMat,3,-5,.035);
// A broad northern lake opens toward a rock waterfall at its far shore.
flatShape(lake.rx*1.09,lake.rz*1.09,96,mat.sand,lake.x,lake.z,-.065,.045);
const lakeSurface=flatShape(lake.rx,lake.rz,96,waterMat,lake.x,lake.z,.035,.045);lakeSurface.name='great-lake';lakeSurface.userData.keepSeparate=true;
for(const water of smallPonds){
 flatShape(water.rx*1.14,water.rz*1.14,30,mat.sand,water.x,water.z,-.065,.06);
 flatShape(water.rx,water.rz,30,waterMat,water.x,water.z,.035,.06);
}
const cliffStone=M(0x818578,{map:stoneTexture,bumpMap:stoneTexture,bumpScale:.22}),cliffLight=M(0xa1a18b,{map:stoneTexture,bumpMap:stoneTexture,bumpScale:.22});
finishLandscape(cliffStone,true);finishLandscape(cliffLight,true);
const cliffGroup=new THREE.Group();cliffGroup.name='waterfall-cliff';scene.add(cliffGroup);
// The central shelf reaches the lip. Taller rock shoulders frame its feeder pool.
mesh(box,cliffStone,cliffGroup,[falls.x,8.25,falls.z-8],[11,19.5,16]);
for(let side of [-1,1]){
 for(let i=0;i<8;i++){
  const x=falls.x+side*(7+i*3.2),z=falls.z-5-i*.78;
  const h=17+Math.sin(i*.8+side)*4;
  mesh(sphere,i%2?cliffStone:cliffLight,cliffGroup,[x,h*.39,z],[4.8,h*.68,7]);
  mesh(sphere,cliffStone,cliffGroup,[x,h*.19,z+3],[4,h*.36,5]);
 }
}
mesh(sphere,cliffStone,cliffGroup,[falls.x,12,falls.z-17],[14,9,9]);
const feeder=new THREE.PlaneGeometry(falls.width,12);
feeder.rotateX(-Math.PI/2);
mesh(feeder,waterMat,scene,[falls.x,falls.top,falls.z-6]);
const rippleMaterial=new THREE.MeshBasicMaterial({color:0xd8e9cb,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false});
const ripples=[];for(let i=0;i<4;i++){const r=mesh(new THREE.RingGeometry(.9, .92,42),rippleMaterial,scene,[3+Math.cos(i*3)*1.8,.05,-5+Math.sin(i)*1.3]);r.rotation.x=-Math.PI/2;r.scale.y=.5;r.userData.phase=i;r.userData.keepSeparate=true; ripples.push(r);}
for(let i=0;i<10;i++){const a=i*2.39996,r=9+(i%3)*7;const wave=mesh(new THREE.RingGeometry(1.3,1.34,32),rippleMaterial,scene,[lake.x+Math.cos(a)*r,.07,lake.z+Math.sin(a)*r*.65]);wave.rotation.x=-Math.PI/2;wave.userData.lake=true;wave.userData.keepSeparate=true;ripples.push(wave);}
for(const water of smallPonds){
 for(const offset of [-1.3,1.3]){
  const wave=mesh(new THREE.RingGeometry(.56,.59,28),rippleMaterial,scene,[water.x+offset,.07,water.z]);
  wave.rotation.x=-Math.PI/2;
  wave.userData.keepSeparate=true;
  ripples.push(wave);
 }
}
const shadowMats=new Map(),contactShadow=contactShadowTexture();
function shadow(parent,r=1,opacity=.1){if(!shadowMats.has(opacity))shadowMats.set(opacity,new THREE.MeshBasicMaterial({color:0x273023,map:contactShadow,transparent:true,opacity:opacity*1.8,depthWrite:false}));const m=shadowMats.get(opacity);const s=mesh(new THREE.CircleGeometry(r,18),m,parent,[0,.035,0]);s.rotation.x=-Math.PI/2;return s;}
const treeLocations=[];
function tree(x,z,s=1){
 if(nearestWaterDistance(x,z)<1.22||riverDistance(x,z)<6||onBridge(x,z)||cliffDistance(x,z)<1.1)return null;
 treeLocations.push({x,z,radius:.35*s+.2,scale:s});
 return treeLocations[treeLocations.length-1];
}

[[-12,-9,1.25],[17,-16,1.6],[-21,12,1.1],[23,10,1.3],[-32,-31,1.2],[0,-29,.9],[35,-35,1.8],[-37,29,1.5],[39,29,1.4],[-8,31,1]].forEach(t=>tree(...t));
for(let i=0;i<36;i++){const a=rand()*Math.PI*2,r=58+rand()*30;tree(Math.cos(a)*r,Math.sin(a)*r,.5+rand()*.7);}
// Overlapping canopies form three groves, with walkable spaces between trunks.
const groves=[{x:-18,z:-10,rx:7,rz:5.5,count:12},{x:50,z:-27,rx:7.5,rz:6,count:14},{x:-23,z:21,rx:7,rz:6,count:13},
 {x:-80,z:27,rx:10,rz:13,count:22},{x:81,z:-36,rx:11,rz:11,count:20},
 {x:48,z:78,rx:12,rz:9,count:21},{x:-37,z:-80,rx:11,rz:10,count:20},
 {x:-107,z:48,rx:8,rz:12,count:16},{x:105,z:-89,rx:9,rz:11,count:16},
 {x:70,z:107,rx:10,rz:8,count:15},
 ...[[-240,-240],[-140,-285],[100,-290],[245,-225],[-285,-65],[-260,65],[-175,195],[-230,285],[190,210],[285,25],[300,210],[160,310],[-45,300],[-310,260],[295,-310],[-320,-290],[-145,-175],[180,-135],[-300,5],[75,175],[300,310],[-320,120]].map(([x,z],i)=>({x,z,rx:22+i%3*4,rz:24+i%4*3,count:18+i%5}))];
let groveSeed=82417;function groveRand(){groveSeed=(groveSeed*1664525+1013904223)>>>0;return groveSeed/4294967296;}
for(const grove of groves){
 let planted=0;
 for(let attempt=0;attempt<800&&planted<grove.count;attempt++){
  const a=groveRand()*Math.PI*2,r=Math.sqrt(groveRand()),x=grove.x+Math.cos(a)*r*grove.rx,z=grove.z+Math.sin(a)*r*grove.rz;
  if(nearestWaterDistance(x,z)<1.25||riverDistance(x,z)<4.8||onBridge(x,z)||cliffDistance(x,z)<1.15||treeLocations.some(t=>Math.hypot(x-t.x,z-t.z)<2.25))continue;
  tree(x,z,.8+groveRand()*.42);planted++;
 }
 grove.planted=planted;
}
// Preserve the random sequence used for the existing interior scenery.
for(let i=0;i<88;i++)rand();

function mountainRange(radius, depth, elevation, phase, palette){
 const segments=384, rows=24, positions=[], colors=[], indices=[];
 const color=new THREE.Color(),stone=new THREE.Color(0xa19a8a);
 for(let row=0;row<=rows;row++){
  const f=row/rows;
  for(let i=0;i<=segments;i++){
   const a=(i%segments)/segments*Math.PI*2;
   const foothill=1+.11*Math.sin(a*5+phase);
   const peaks=.62+.22*Math.sin(a*9+phase)+.12*Math.cos(a*17)+.07*Math.sin(a*31);
   const ridge=Math.pow(Math.sin(Math.PI*f),1.35);
   // Short stretches of the inward slope rise steeply between rock ledges.
   const outcrop=THREE.MathUtils.smoothstep(Math.cos(a*7+phase+Math.sin(a*3)*.55),.70,.94);
   const cliffFace=outcrop*(1-THREE.MathUtils.smoothstep(f,.38,.50))*THREE.MathUtils.smoothstep(f,.06,.16);
   const shelf=f<.5?THREE.MathUtils.lerp(f,.14,cliffFace*.93):f;
   const rockSeams=Math.sin(a*139)*.8+Math.sin(a*79)*1.2;
   const r=radius+depth*shelf+6*Math.sin(a*7+phase)*ridge+rockSeams*cliffFace;
   const y=-2.4+elevation*peaks*ridge+(Math.sin(a*43+row*1.8)+Math.cos(a*59-row*.33))*1.1*ridge;
   const square=1/Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a)));
   positions.push(Math.cos(a)*r*foothill*square,y,Math.sin(a)*r*foothill*square);
   color.setHex(palette[0]).lerp(new THREE.Color(palette[1]),Math.min(1,Math.max(0,y/elevation)));
   color.lerp(stone,cliffFace*.83);
   color.multiplyScalar(.94+.06*Math.sin(a*39+row*1.3)+cliffFace*.08*Math.sin(a*113+row*.62));
   colors.push(color.r,color.g,color.b);
   if(row<rows&&i<segments){
    const j=row*(segments+1)+i;
    indices.push(j,j+1,j+segments+1,j+1,j+segments+2,j+segments+1);
   }
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.setIndex(indices);
 geometry.computeVertexNormals();
 const mountainMaterial=M(0xffffff,{vertexColors:true,roughness:1,side:THREE.DoubleSide});
 finishLandscape(mountainMaterial,true);
 const range=mesh(geometry,mountainMaterial,scene);
 range.name='mountain-range';
 range.userData.keepSeparate=true;
}
mountainRange(414,105,92,.9,[0x637b68,0x9d9f98]);
mountainRange(515,118,128,2.4,[0x6e8085,0xaab5bc]);
mountainRange(640,145,170,4.1,[0x7b8e9d,0xb6c5cc]);

// Plant staggered rows along all four edges, leaving the river outlet open.
for(let side=0;side<4;side++){
 for(let i=0;i<81;i++){
  const along=-worldLimit+5+i*(worldLimit*2-10)/80+Math.sin(i*2.1+side)*.85;
  const edge=worldLimit-1.6-(i%2)*3;
  const x=side<2?(side===0?-edge:edge):along;
  const z=side<2?along:(side===2?-edge:edge);
  if(treeLocations.some(t=>Math.hypot(x-t.x,z-t.z)<3.2))continue;
  tree(x,z,1.05+.36*Math.sin(i*1.7+side));
 }
}
// Scattered mature trees connect the groves while leaving broad walking lanes.
for(let i=0;i<210;i++){
 const x=(groveRand()-.5)*(worldLimit*2-28),z=(groveRand()-.5)*(worldLimit*2-28);
 if(Math.max(Math.abs(x),Math.abs(z))<130||treeLocations.some(t=>Math.hypot(x-t.x,z-t.z)<4))continue;
 tree(x,z,.8+groveRand()*.8);
}
for(let i=0;i<55;i++){const x=(rand()-.5)*138,z=(rand()-.5)*138;if(pondDistance(x,z)<1.8||lakeDistance(x,z)<1.2||riverDistance(x,z)<4.8||onBridge(x,z)||cliffDistance(x,z)<1.1)continue;mesh(ico,mat.rock,scene,[x,height(x,z)+.2,z],[.3+rand()*.6,.25+rand()*.4,.4+rand()*.5]);}
const boulders=[];
for(const [cx,cz] of [[-84,6],[76,57],[-59,79],[70,-75],[-72,-71],[17,88],[-100,-88],[103,78],[-66,105],[-275,-220],[210,-300],[310,165],[-240,245],[175,175],[-160,-195],[270,-10],[-310,20],[-30,280],[295,315]]){
 for(let i=0;i<19;i++){
  const a=i*2.39996,r=2+Math.sqrt(i)*2.9;
  const x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;
  if(Math.abs(x)>worldLimit-3||Math.abs(z)>worldLimit-3||nearestWaterDistance(x,z)<1.3||riverDistance(x,z)<5||onBridge(x,z)||
     treeLocations.some(tree=>Math.hypot(tree.x-x,tree.z-z)<1.5))continue;
  const size=i%4===0?1.15+groveRand()*.8:.24+groveRand()*.62;
  const rock=mesh(ico,mat.rock,scene,[x,height(x,z)+size*.28,z],[size,size*.72,size*.85]);
  rock.rotation.y=a;
  if(size>=1)boulders.push({x,z,radius:size*.91});
 }
}
// Curved, tapered grass blades share one instanced draw call.
const clumpParts=[];
for(let j=0;j<5;j++){
 const a=j*2.39996,h=[.62,.43,.56,.37,.49][j],r=j===0?0:.16;
 const part=new THREE.PlaneGeometry(j===0?.09:.065,h,1,2);
 const positions=part.attributes.position;
 for(let v=0;v<positions.count;v++){const f=positions.getY(v)/h+.5;positions.setX(v,positions.getX(v)*(1-f*.96));positions.setZ(v,f*f*.18);}
 part.computeVertexNormals();
 part.translate(0,h/2,0);
 part.rotateZ(Math.cos(a)*.24);part.rotateX(Math.sin(a)*.24);
 part.translate(Math.cos(a)*r,0,Math.sin(a)*r);clumpParts.push(part);
}
const blade=mergeGeometries(clumpParts,false);clumpParts.forEach(g=>g.dispose());
const dummy=new THREE.Object3D();
const grassMaterial=M(0xffffff,{side:THREE.DoubleSide});addWind(grassMaterial);
const grassField=createGrassField(scene,blade,grassMaterial,{height,limit:worldLimit,
 allowed:(x,z)=>nearestWaterDistance(x,z)>1.25&&riverDistance(x,z)>4.8&&!onBridge(x,z)&&cliffDistance(x,z)>1.1});
grassField.update(6,6);
// Sparse, irregular riparian plants frame open water without blocking paths.
const reedParts=[];
for(let j=0;j<4;j++){
 const h=.9+j*.19,g=new THREE.PlaneGeometry(.055,h,1,4),pos=g.attributes.position;
 for(let v=0;v<pos.count;v++){const f=pos.getY(v)/h+.5;pos.setX(v,pos.getX(v)*(1-f*.97));pos.setZ(v,f*f*.24);}
 g.translate(0,h*.5,0);g.rotateY(j*2.39996);g.translate(Math.sin(j)*.12,0,Math.cos(j)*.12);g.computeVertexNormals();reedParts.push(g);
}
const reedGeometry=mergeGeometries(reedParts,false);reedParts.forEach(g=>g.dispose());
const shoreReeds=new THREE.InstancedMesh(reedGeometry,M(0x89945b,{side:THREE.DoubleSide}),2400);
shoreReeds.name='shore-reeds';shoreReeds.userData.keepSeparate=true;addWind(shoreReeds.material);shoreReeds.receiveShadow=true;
const shorePebbles=new THREE.InstancedMesh(ico,mat.rock,900);shorePebbles.name='shore-pebbles';shorePebbles.userData.keepSeparate=true;shorePebbles.receiveShadow=true;
let shoreReedCount=0,shorePebbleCount=0,shoreSeed=77351;
function shoreRand(){shoreSeed=(shoreSeed*1664525+1013904223)>>>0;return shoreSeed/4294967296;}
for(const water of waterBodies){
 const count=water===lake?640:95,irregular=water===lake?.045:water===pond?.12:.06;
 for(let i=0;i<count;i++){
  const a=shoreRand()*Math.PI*2,r=1+(Math.sin(a*3+.5)+Math.cos(a*5))*.5*irregular;
  const offset=.25+shoreRand()*1.6,x=water.x+Math.cos(a)*(water.rx*r+offset),z=water.z-Math.sin(a)*(water.rz*r+offset);
  if(riverDistance(x,z)<5||cliffDistance(x,z)<1.12||Math.abs(x)>worldLimit-2||Math.abs(z)>worldLimit-2)continue;
  // Broken clusters, with generous openings for drinking and lake views.
  if(Math.sin(a*13+water.x)*Math.cos(a*7)>.0&&shoreReedCount<2400){
   dummy.position.set(x,Math.max(-.10,groundHeight(x,z)),z);dummy.rotation.set(0,shoreRand()*Math.PI*2,0);
   const scale=.65+shoreRand()*.6;dummy.scale.set(scale,scale,scale);dummy.updateMatrix();shoreReeds.setMatrixAt(shoreReedCount,dummy.matrix);
   shoreReeds.setColorAt(shoreReedCount,c.setHex([0x859653,0xb5ad76,0x74925a][i%3]));shoreReedCount++;
  }
  if(i%2===0&&shorePebbleCount<900){
   const size=.06+shoreRand()*.19;
   dummy.position.set(x,groundHeight(x,z)+size*.25,z);dummy.rotation.set(.2,shoreRand()*Math.PI*2,.1);dummy.scale.set(size,size*.45,size*.8);dummy.updateMatrix();shorePebbles.setMatrixAt(shorePebbleCount++,dummy.matrix);
  }
 }
}
shoreReeds.count=shoreReedCount;shoreReeds.computeBoundingSphere();scene.add(shoreReeds);
shorePebbles.count=shorePebbleCount;shorePebbles.computeBoundingSphere();scene.add(shorePebbles);
// Warm sand paths, made of gently irregular disks lying on the terrain.
const trailMat=new THREE.MeshBasicMaterial({color:0xddd3a5,transparent:true,opacity:.24,depthWrite:false});for(let i=0;i<54;i++){const z=i*.8-22,x=Math.sin(z*.1)*9+7;if(pondDistance(x,z)<1.6)continue;const p=mesh(new THREE.CircleGeometry(1.1,7),trailMat,scene,[x,height(x,z)+.025,z]);p.rotation.x=-Math.PI/2;}
// A quiet path from the meadow follows the western lake shore.
for(let i=0;i<58;i++){const f=i/57,z=-13-f*39,x=7-9*f+Math.sin(f*Math.PI)*2;if(pondDistance(x,z)<1.6||lakeDistance(x,z)<1.12||cliffDistance(x,z)<1.1)continue;const p=mesh(new THREE.CircleGeometry(1.2,7),trailMat,scene,[x,height(x,z)+.03,z]);p.rotation.x=-Math.PI/2;}
// Batch stationary scenery by material to keep draw calls low on phones.
function batchMeshes(parent,recursive=false){
 parent.updateMatrixWorld(true);const byMaterial=new Map();
 const take=o=>{if(o.isMesh&&!o.isInstancedMesh&&!o.userData.keepSeparate&&!Array.isArray(o.material)){if(!byMaterial.has(o.material))byMaterial.set(o.material,[]);byMaterial.get(o.material).push(o);}};
 if(recursive)parent.traverse(take);else parent.children.forEach(take);
 for(const [material,objects] of byMaterial){if(objects.length<2)continue;const geometries=objects.map(o=>{o.updateMatrix();const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(recursive?o.matrixWorld:o.matrix);return g;});const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!merged)continue;objects.forEach(o=>o.parent.remove(o));const batch=new THREE.Mesh(merged,material);batch.castShadow=!material.transparent;batch.receiveShadow=!material.transparent;parent.add(batch);}
}
const riverVertices=[];
for(let z=riverStart;z<riverEnd;z++){
 const l=riverX(z)-riverHalfWidth,r=riverX(z)+riverHalfWidth;
 const nextL=riverX(z+1)-riverHalfWidth,nextR=riverX(z+1)+riverHalfWidth;
 riverVertices.push(l,.025,z,r,.025,z,nextL,.025,z+1);
 riverVertices.push(r,.025,z,nextR,.025,z+1,nextL,.025,z+1);
}
// The river faces upward so the surface can be seen from the walking camera.
for(let i=0;i<riverVertices.length;i+=9){
 for(let k=0;k<3;k++){
  const v=riverVertices[i+3+k];riverVertices[i+3+k]=riverVertices[i+6+k];riverVertices[i+6+k]=v;
 }
}
const riverGeometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(riverVertices,3));
riverGeometry.computeVertexNormals();
const river=mesh(riverGeometry,waterMat,scene);
river.name='river';river.userData.keepSeparate=true;
const logGeometry=new THREE.CylinderGeometry(.17,.20,1,8);
for(const b of bridges){
 for(let i=0;i<34;i++){
  const x=b.x-6.27+i*.38,y=height(x,b.z)-.15;
  const log=mesh(logGeometry,mat.trunk,scene,[x,y,b.z],[1,3.7,1]);
  log.rotation.x=Math.PI/2;
 }
 for(const side of [-1,1]){
  const rail=mesh(logGeometry,mat.trunk,scene,[b.x,1.26,b.z+side*1.83],[.65,9,.65]);
  rail.rotation.z=Math.PI/2;
  for(const dx of [-4.4,0,4.4])mesh(logGeometry,mat.trunk,scene,[b.x+dx,.95,b.z+side*1.83],[.8,.93,.8]);
 }
}
const monumentStone=M(0x9c9a86),oldBone=M(0xe7d5aa);
const dolmenScale=3.35;
for(const [x,z] of [[-61,51],[72,-53],[-235,-25],[195,-300],[310,225],[-180,300]]){
 const dolmen=new THREE.Group();dolmen.name='dolmen';
 dolmen.position.set(x,height(x,z),z);dolmen.scale.setScalar(dolmenScale);scene.add(dolmen);
 for(const dx of [-1.55,1.55])mesh(ico,monumentStone,dolmen,[dx,1.25,0],[.85,1.65,1.12]);
 const cap=mesh(ico,monumentStone,dolmen,[0,2.68,0],[3.2,.65,1.73]);
 cap.rotation.z=.09;
 for(const dx of [-1.55,1.55])boulders.push({x:x+dx*dolmenScale,z,radius:1.15*dolmenScale});
}
{
 const x=-65,z=-61,y=height(x,z),mammothScale=3.25;
 const skeleton=new THREE.Group();
 skeleton.name='mammoth-skeleton';scene.add(skeleton);
 skeleton.position.set(x,y,z);skeleton.scale.setScalar(mammothScale);
 const boneTube=(points,radius)=>mesh(new THREE.TubeGeometry(
  new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v))),12,radius,7,false
 ),oldBone,skeleton);
 // The spine rests on its side with the ribs collapsed across it.
 boneTube([[-1.18,.14,-5],[-1.02,.16,-2],[-.94,.17,1],[-.73,.20,3.28]],.21);
 for(let i=0;i<10;i++){
  const dz=-4.6+i*.76;
  mesh(ico,oldBone,skeleton,[-1.04+i*.027,.18,dz],[.32,.24,.25]);
  if(i===9)continue;
  const span=.9+.85*Math.sin((i+1)*Math.PI/10);
  boneTube([[-1.03,.18,dz],[-.61,.75,dz-.10],[.46,span*.80,dz-.18],[span,.58,dz+.09],[span*.91,.08,dz+.42]],.105);
  if(i%3!==1)boneTube([[-1.06,.13,dz],[-.28,.10,dz+.16],[.68,.15,dz+.48],[span*.96,.08,dz+.68]],.085);
 }
 const skull=mesh(sphere,oldBone,skeleton,[-.57,.87,4.48],[1.13,.95,1.31]);
 skull.rotation.z=-.22;skull.rotation.y=.25;
 mesh(ico,mat.dark,skeleton,[.34,1.19,4.64],[.29,.24,.34]);
 mesh(ico,mat.dark,skeleton,[-1.35,.99,4.57],[.23,.17,.28]);
 mesh(sphere,oldBone,skeleton,[-.42,.23,5.11],[.68,.28,.75]);
 for(const side of [-1,1]){
  const sx=-.57+side*.59;
  boneTube([[sx,.58,5.08],[sx+side*.38,.22,6.35],[sx+side*.55,.11,7.50],[sx+side*.17,.24,8.24],[sx-side*.17,.55,8.48]],.15);
 }
 for(const [bx,bz,angle] of [[2.3,-3.3,.68],[2.65,-1.7,.96],[-2.05,-3.9,-.58],[1.64,2.03,.85]]){
  const end=[bx+Math.sin(angle)*1.62,.15,bz+Math.cos(angle)*1.62];
  boneTube([[bx,.16,bz],[(bx+end[0])/2,.12,(bz+end[2])/2],end],.15);
  for(const [px,py,pz] of [[bx,.16,bz],end])mesh(sphere,oldBone,skeleton,[px,py,pz],[.25,.23,.24]);
 }
 // Bake the pose into the geometry, then follow the height of the ground under each bone.
 for(const part of skeleton.children){
  part.updateMatrix();
  const geometry=part.geometry.clone().applyMatrix4(part.matrix);
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
   const ground=height(x+positions.getX(i)*mammothScale,z+positions.getZ(i)*mammothScale);
   positions.setY(i,positions.getY(i)+(ground-y)/mammothScale);
  }
  geometry.computeVertexNormals();
  part.geometry=geometry;part.position.set(0,0,0);part.rotation.set(0,0,0);part.scale.setScalar(1);
 }
 for(const dz of [-3,-1,1,3,4.7])boulders.push({x,z:z+dz*mammothScale,radius:1.6*mammothScale});

}
batchMeshes(scene,true);
const forest=createForest(scene,treeLocations,[treeBark,...mat.leaves],foliage,height);forest.update(6,6);
const discoveries=createDiscoveries(scene,{height,stone:mat.rock,bark:mat.trunk,soil:mat.sand,leaf:mat.leaves[0],
 allowed:(x,z,radius)=>Math.abs(x)<worldLimit-14-radius&&Math.abs(z)<worldLimit-14-radius&&
  Math.hypot(x-6,z-6)>radius+20&&Math.hypot(x+65,z+61)>radius+17&&
  waterBodies.every(w=>Math.hypot((x-w.x)/(w.rx+radius+2),(z-w.z)/(w.rz+radius+2))>1.12)&&
  riverDistance(x,z)>riverHalfWidth+radius+3&&cliffDistance(x,z)>1.35&&
  !bridges.some(b=>Math.hypot(x-b.x,z-b.z)<radius+9)&&
  !treeLocations.some(t=>Math.hypot(x-t.x,z-t.z)<radius+t.radius+.8)&&
  !boulders.some(b=>Math.hypot(x-b.x,z-b.z)<radius+b.radius+1)
});
boulders.push(...discoveries.obstacles);discoveries.update(6,6);
const solidIndex=new SpatialIndex(12),waterIndex=new SpatialIndex(32);
for(const obstacle of [...treeLocations,...boulders])solidIndex.add(obstacle);
for(const water of waterBodies)waterIndex.add(water,water.rx*1.2+1,water.rz*1.2+1);
const moveMarker=mesh(new THREE.RingGeometry(.34,.43,32),new THREE.MeshBasicMaterial({color:0xfff4d5,transparent:true,opacity:.82,side:THREE.DoubleSide,depthWrite:false}),scene);moveMarker.name='touch-destination';moveMarker.rotation.x=-Math.PI/2;moveMarker.visible=false;
// Keep falling water separate from stationary batching so flow stays animated.
const waterfall=new THREE.Group();waterfall.name='waterfall';scene.add(waterfall);
const fallMat=new THREE.MeshLambertMaterial({color:0xc1dcd7,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false});finishFalls(fallMat);
const fallHeight=falls.top-falls.bottom;
const curtainGeometry=new THREE.PlaneGeometry(falls.width,fallHeight,12,20);
const curtainPositions=curtainGeometry.attributes.position;
for(let i=0;i<curtainPositions.count;i++){
 const descent=.5-curtainPositions.getY(i)/fallHeight;
 curtainPositions.setZ(i,1.35*descent**2+.08*Math.sin(curtainPositions.getX(i)*5)*descent);
}
curtainGeometry.computeVertexNormals();
mesh(curtainGeometry,fallMat,waterfall,[falls.x,(falls.top+falls.bottom)/2,falls.z]);
const foamMat=new THREE.MeshBasicMaterial({color:0xe5f5e6,transparent:true,opacity:.72,depthWrite:false});
const fallingFoam=new THREE.InstancedMesh(sphere,foamMat,36);fallingFoam.name='falling-water';waterfall.add(fallingFoam);
const spray=new THREE.InstancedMesh(ico,foamMat,28);spray.name='waterfall-spray';waterfall.add(spray);
const flowDummy=new THREE.Object3D();
function animateWaterfall(t){
 for(let i=0;i<36;i++){const phase=(t*.65+i*.618034)%1;flowDummy.position.set(falls.x+((i%7)/6-.5)*5.7,falls.top-phase*fallHeight,falls.z+1.35*phase**2+.13);flowDummy.rotation.set(0,0,.05*Math.sin(i));flowDummy.scale.set(.045+(i%3)*.02,.35+(i%4)*.25,.03);flowDummy.updateMatrix();fallingFoam.setMatrixAt(i,flowDummy.matrix);}
 fallingFoam.instanceMatrix.needsUpdate=true;
 for(let i=0;i<28;i++){const phase=(t*.48+i*.381966)%1,a=i*2.39996,r=phase*4.8;flowDummy.position.set(falls.x+Math.cos(a)*r,.14+Math.sin(phase*Math.PI)*1.25,falls.z+1.4+Math.sin(a)*r*.65);flowDummy.rotation.set(i,t*.2,0);flowDummy.scale.setScalar((1-phase)*.17+.025);flowDummy.updateMatrix();spray.setMatrixAt(i,flowDummy.matrix);}
 spray.instanceMatrix.needsUpdate=true;
}
animateWaterfall(0);fallingFoam.boundingSphere=new THREE.Sphere(new THREE.Vector3(falls.x,falls.top/2,falls.z),12);spray.boundingSphere=new THREE.Sphere(new THREE.Vector3(falls.x,.8,falls.z+1.4),6);

// The sky stays around the viewer, so looking upward reveals a full sky dome.
const skyUniforms=atmosphere;
const skyDome=createAtmosphere();scene.add(skyDome);
const horizonGround=mesh(new THREE.CircleGeometry(1500,96),M(0x899674),scene,[0,-2.5,0]);horizonGround.rotation.x=-Math.PI/2;
// The sun and clouds are drawn in the shared atmospheric shader.
const clouds=[];
const skySun=new THREE.Object3D();skySun.name='sky-sun';skySun.position.set(-68,55,-93);scene.add(skySun);

const nibbleBlade=new THREE.ConeGeometry(.045,.28,3);
const animalShape=new THREE.SphereGeometry(1,24,16);
const coatMaterial=M(0xffffff,{vertexColors:true}),eyeGlint=M(0xfffaf0),earPink=M(0xd4afa0);
function coatShape(type){
 const g=new THREE.SphereGeometry(1,48,28).toNonIndexed(),p=g.attributes.position,colors=[],color=new THREE.Color();
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);let hex;
  if(type==='zebra')hex=Math.sin(z*21+Math.sin(y*4)*.45+x*.8)>.1?0x4e5146:0xeee9d9;
  else if(type==='gazelle')hex=y<-.48?0xe7d6b5:y>-.27&&y<-.05&&Math.abs(x)>.62?0x625039:0xb58a56;
  else if(type==='squirrel'){const stripe=Math.abs(Math.abs(x)-.4);hex=y>.4&&stripe<.075?0x66523c:y>.4&&stripe<.16?0xe2c696:0xaf8352;}
  else{const u=Math.atan2(x,z)*2.4+.12*Math.sin(y*9),v=y*2.8+.10*Math.sin(x*7),a=u-Math.floor(u),b=v-Math.floor(v);hex=y<-.6?0xe6c998:a>.12&&a<.88&&b>.12&&b<.86?0xa57943:0xdbb771;}
  color.setHex(hex);colors.push(color.r,color.g,color.b);
 }
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
}
function animalPart(parent,material,pos,scale,geometry=animalShape){return mesh(geometry,material,parent,pos,scale);}
function makeLeg(parent,x,y,z,length,material,small=false,front=true,profile=null){
 const hip=new THREE.Bone();hip.name='hip';hip.position.set(x,y,z);hip.rotation.order='ZXY';parent.add(hip);
 const upper=length*.53,lower=length*.47,r=profile==='heavy'?.12:small?.055:.075;
 const grounded=profile==='heavy'||profile==='ungulate';
 const ankle=profile==='heavy'?.83:.64;
 animalPart(hip,material,[0,-upper*.42,0],[r*(grounded?1.19:1.6),upper*(grounded?.77:.64),r*(grounded?1.19:1.5)]);
 const knee=new THREE.Bone();knee.name='knee';knee.position.y=-upper;hip.add(knee);animalPart(knee,material,[0,0,0],[r*(grounded?.89:1.13),r*(grounded?.89:1.13),r*(grounded?.89:1.13)]);
 mesh(new THREE.CylinderGeometry(r*.88,r*ankle,lower+.025,10),material,knee,[0,-lower/2,0]);
 const foot=new THREE.Bone();foot.name='foot';foot.position.y=-lower;foot.rotation.order='XZY';knee.add(foot);
 animalPart(foot,small||profile==='heavy'?material:mat.dark,[0,0,small?.045:.025],[profile==='heavy'?.126:small?.078:.105,small?.047:.085,profile==='heavy'?.142:small?.14:.125]);
 hip.userData={knee,foot,upper,lower,front,side:Math.sign(x),baseX:x,baseZ:z,sole:small?.047:.085};return hip;
}
function faceDetails(head,width,eyeY,eyeZ,earLength,coat,inner,earWidth=.12){
 const ears=[],eyes=[];
 for(const side of [-1,1]){
  const eye=new THREE.Bone();eye.position.set(side*width,eyeY,eyeZ);head.add(eye);
  animalPart(eye,mat.dark,[0,0,0],[.038,.048,.04]);animalPart(eye,eyeGlint,[side*.019,.018,.026],[.013,.014,.012]);eyes.push(eye);
  const ear=new THREE.Bone();ear.position.set(side*width*.78,.19,-.08);ear.rotation.z=-side*.48;head.add(ear);
  animalPart(ear,coat,[0,earLength*.45,0],[earWidth,earLength*.65,.075]);animalPart(ear,inner,[0,earLength*.46,.052],[earWidth*.58,earLength*.44,.022]);ears.push(ear);
 }
 return {ears,eyes};
}
function makeNibble(jaw,z,small=false){const nibble=new THREE.Group();nibble.position.set(0,0,z);nibble.visible=false;jaw.add(nibble);for(let i=0;i<3;i++){const leaf=mesh(nibbleBlade,mat.grass,nibble,[(i-1)*(small?.035:.06),0,0],small?[.65,.55,.65]:[1,1,1]);leaf.rotation.z=(i-1)*.55;}return nibble;}
const rigMaterial=M(0xffffff,{vertexColors:true,roughness:.92});finishCoat(rigMaterial);
function finishAnimalRig(root,visual){
 // One rigid-weight skinned mesh per animal replaces dozens of separate draw calls.
 root.updateMatrixWorld(true);const bones=[],parts=[],excluded=new Set();root.userData.nibble.traverse(o=>excluded.add(o));
 visual.traverse(o=>{if(o.isBone)bones.push(o);if(o.isMesh&&!excluded.has(o))parts.push(o);});
 const inverse=new THREE.Matrix4().copy(visual.matrixWorld).invert(),geometries=[];
 for(const part of parts){
  let bone=part.parent;while(bone&&!bone.isBone)bone=bone.parent;const boneIndex=bones.indexOf(bone);
  const g=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,part.matrixWorld));
  const count=g.attributes.position.count,colors=new Float32Array(count*3),indices=new Uint16Array(count*4),weights=new Float32Array(count*4),base=part.material.color,original=g.attributes.color;
  for(let i=0;i<count;i++){colors[i*3]=base.r*(original?original.getX(i):1);colors[i*3+1]=base.g*(original?original.getY(i):1);colors[i*3+2]=base.b*(original?original.getZ(i):1);indices[i*4]=boneIndex;weights[i*4]=1;}
  for(const key of Object.keys(g.attributes))if(!['position','normal'].includes(key))g.deleteAttribute(key);
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setAttribute('skinIndex',new THREE.BufferAttribute(indices,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));geometries.push(g);
 }
 const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());parts.forEach(part=>part.parent.remove(part));
 const skin=new THREE.SkinnedMesh(geometry,rigMaterial);skin.name='animal-skin';skin.castShadow=true;skin.receiveShadow=true;visual.add(skin);skin.bind(new THREE.Skeleton(bones),visual.matrixWorld.clone());
 // Deformed bounds change with grazing and hopping; the small cast stays inexpensive to draw.
 skin.frustumCulled=false;batchMeshes(root.userData.nibble);root.userData.skin=skin;root.userData.bones=bones;
 root.userData.lastPosition=root.position.clone();root.userData.stridePhase=0;
}
const newAnimals={
 elephant:{name:'코끼리',color:0x8c939f,scale:4.5,body:[.37,.37,.65],head:[.29,.29,.31],ear:.28,icon:'🐘'},
 hippo:{name:'하마',color:0x927d91,scale:3.65,body:[.40,.34,.63],head:[.31,.25,.36],ear:.09,icon:'🦛'},
 rhino:{name:'코뿔소',color:0x8b8a80,scale:3.7,body:[.36,.36,.65],head:[.25,.25,.34],ear:.15,icon:'🦏'},
 turtle:{name:'거북이',color:0x7d9157,scale:1.2,body:[.34,.23,.49],head:[.14,.15,.19],ear:0,icon:'🐢'},
 guineaPig:{name:'기니피그',color:0xbc8860,scale:.95,body:[.29,.26,.39],head:[.23,.22,.25],ear:.10,icon:'🐹'},
 chinchilla:{name:'친칠라',color:0x9794a5,scale:1,body:[.24,.28,.35],head:[.21,.22,.24],ear:.29,icon:'🐭'},
 hedgehog:{name:'고슴도치',color:0x88684d,scale:.88,body:[.29,.26,.39],head:[.16,.15,.23],ear:.10,icon:'🦔'},
 meerkat:{name:'미어캣',color:0xb78b56,scale:1.15,body:[.19,.23,.39],head:[.16,.17,.22],ear:.09},
 fennec:{name:'사막여우',color:0xdfae75,scale:1.25,body:[.22,.23,.38],head:[.19,.19,.25],ear:.43,icon:'🦊'}
};
const animalCoats=Object.fromEntries(Object.entries(newAnimals).map(([key,animal])=>[key,M(animal.color)]));
const tuskMaterial=M(0xf0dfb5),shellMaterial=M(0x797046);
function newAnimal(type,x,z){
 const spec=newAnimals[type],coat=animalCoats[type],large=spec.scale>3;
 const root=new THREE.Bone(),visual=new THREE.Bone();
 root.name=type;root.position.set(x,height(x,z),z);root.scale.setScalar(spec.scale);
 scene.add(root);root.add(visual);
 const bodyY=large?.57:type==='turtle'?.31:.38;
 const body=animalPart(visual,coat,[0,bodyY,0],spec.body);
 const legs=Array.from({length:4},(_,i)=>{
  const front=i<2,y=large?.44:type==='turtle'?.20:.27;
  const width=spec.body[0]*(large?.86:.75);
  return makeLeg(visual,(i%2?1:-1)*width,y,(front?1:-1)*spec.body[2]*.65,
   large?y-.069:y+.035,coat,!large,front,large?'heavy':null);
 });
 const head=new THREE.Bone();head.position.set(0,type==='turtle'?.38:large?.68:.56,spec.body[2]*.84);visual.add(head);
 animalPart(head,coat,[0,0,.04],spec.head);
 const jaw=new THREE.Bone();jaw.position.set(0,-.10,.12);head.add(jaw);
 const muzzle=type==='hippo'?[.30,.14,.30]:[spec.head[0]*.69,.085,.15];
 if(!['turtle','meerkat','guineaPig','fennec','hedgehog'].includes(type))animalPart(jaw,type==='hippo'?coat:mat.belly,[0,0,.11],muzzle);
 const muzzleTip=new THREE.Object3D();muzzleTip.position.set(0,0,.25);jaw.add(muzzleTip);
 const {eyes,ears}=faceDetails(head,spec.head[0]*.83,.06,spec.head[2]*.74,spec.ear,coat,earPink,type==='elephant'?.18:.095);
 if(type==='turtle'){
  ears.forEach(ear=>ear.removeFromParent());
  head.add(muzzleTip);
  muzzleTip.position.set(0,-.035,.225);
 }else if(['meerkat','guineaPig','fennec','hedgehog'].includes(type)){
  head.add(muzzleTip);
  muzzleTip.position.set(0,-.04,.04+spec.head[2]*.96);
 }
 const tail=new THREE.Bone();tail.position.set(0,bodyY,-spec.body[2]*.83);visual.add(tail);
 const tube=(parent,points,radius,material)=>mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v))),9,radius,6,false),material,parent);
 if(type==='guineaPig'){
  for(const side of [-1,1]){
   tube(head,[[0,-.049,.287],[side*.035,-.077,.279],[side*.062,-.103,.260]],.008,mat.dark);
  }
 }
 let trunk;
 if(type==='elephant'){
  trunk=new THREE.Bone();
  trunk.position.z=.26;
  head.add(trunk);
  trunk.add(muzzleTip);
  muzzleTip.position.set(0,-.46,.34);
  tube(trunk,[[0,0,0],[0,-.18,.13],[0,-.40,.22],[0,-.46,.34]],.075,coat);
  for(const side of [-1,1])tube(head,[[side*.15,-.10,.22],[side*.18,-.13,.40],[side*.20,-.03,.54]],.026,tuskMaterial);
 }else if(type==='rhino'){
  const horn=mesh(new THREE.ConeGeometry(.09,.28,8),tuskMaterial,head,[0,.15,.28]);horn.rotation.x=.32;
 }else if(type==='hippo'){
  animalPart(head,coat,[0,-.015,.33],[.32,.16,.27]);
  muzzleTip.position.z=.41;
  for(const side of [-1,1])animalPart(head,mat.dark,[side*.13,.106,.51],[.038,.025,.026]);
 }else if(type==='turtle'){
  animalPart(visual,shellMaterial,[0,.43,-.03],[.36,.24,.48]);
  animalPart(visual,mat.gazelle,[0,.49,-.03],[.32,.20,.43],ico);
 }else if(type==='hedgehog'){
  for(let i=0;i<34;i++){
   const a=i*2.39996,y=.1+.88*(i/34),r=Math.sqrt(1-y*y);
   const dir=new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r);
   const spine=mesh(new THREE.ConeGeometry(.035,.14,4),mat.dark,visual,[dir.x*.30,bodyY+dir.y*.29,dir.z*.40-.04]);
   spine.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
  }
 }else if(type==='fennec'||type==='chinchilla'||type==='meerkat'){
  const width=type==='fennec'?.11:.047;
  tube(tail,[[0,0,0],[0,.025,-.27],[0,.07,-.49],[0,.12,-.58]],width,coat);
  animalPart(tail,mat.dark,[0,.11,-.54],[width,.067,.11]);
 }
 if(type==='meerkat')for(const side of [-1,1])animalPart(head,mat.dark,[side*.126,.055,.153],[.045,.05,.035]);
 const nibble=makeNibble(jaw,.24,true),sh=shadow(root,spec.body[2],.12);
 root.userData={type,visual,body,bodyScale:spec.body,legs,head,jaw,muzzleTip,trunk,ears,eyes,tail,nibble,shadow:sh,headY:head.position.y,walk:0,rest:0,graze:0,phase:rand()*6.28};
 finishAnimalRig(root,visual);
 return root;
}
function animal(type,x,z){
 if(Object.hasOwn(newAnimals,type))return newAnimal(type,x,z);
 if(type==='rabbit'||type==='squirrel')return smallAnimal(type,x,z,Math.floor(rand()*6));
 const giraffe=type==='giraffe',zebra=type==='zebra',coat=giraffe?mat.giraffe:zebra?mat.white:mat.gazelle;
 const root=new THREE.Bone();root.name=type;root.position.set(x,height(x,z),z);scene.add(root);
 const visual=new THREE.Bone();root.add(visual);const bodyY=giraffe?1.95:zebra?1.35:1.25;
 const bodyScale=giraffe?[.51,.63,1.02]:zebra?[.54,.57,.95]:[.37,.43,.78];
 const body=animalPart(visual,coatMaterial,[0,bodyY,0],bodyScale,coatShape(type));
 animalPart(visual,mat.belly,[0,bodyY-.23,.02],[bodyScale[0]*.78,bodyScale[1]*.52,bodyScale[2]*.84]);
 const legs=Array.from({length:4},(_,i)=>{
  const front=i<2,y=bodyY-.24;
  const x=(i%2?1:-1)*(giraffe?.33:zebra?.34:.24);
  const z=(front?1:-1)*(giraffe?.66:zebra?.59:.48);
  return makeLeg(visual,x,y,z,y-(front?.068:.027),coat,false,front,'ungulate');
 });
 const neck=new THREE.Bone();neck.position.set(0,bodyY+.12,giraffe?.60:.58);visual.add(neck);
 const neckL1=giraffe?1.18:zebra?.49:.46,neckL2=giraffe?1.07:zebra?.46:.42;
 animalPart(neck,giraffe||zebra?coatMaterial:coat,[0,neckL1*.5,0],[giraffe?.23:zebra?.29:.19,neckL1*.65,giraffe?.25:zebra?.3:.21],giraffe||zebra?coatShape(type):animalShape);
 const neckLower=new THREE.Bone();neckLower.position.y=neckL1;neck.add(neckLower);
 animalPart(neckLower,giraffe||zebra?coatMaterial:coat,[0,neckL2*.48,0],[giraffe?.175:zebra?.23:.14,neckL2*.64,giraffe?.19:zebra?.23:.16],giraffe||zebra?coatShape(type):animalShape);
 if(zebra){animalPart(neck,mat.dark,[0,neckL1*.5,-.25],[.065,neckL1*.63,.1]);animalPart(neckLower,mat.dark,[0,neckL2*.46,-.18],[.055,neckL2*.6,.09]);}
 const head=new THREE.Bone();head.position.set(0,neckL2,0);neckLower.add(head);
 animalPart(head,zebra?coatMaterial:coat,[0,0,zebra?.13:.08],[giraffe?.255:zebra?.28:.205,giraffe?.24:.265,giraffe?.38:zebra?.47:.29],zebra?coatShape(type):animalShape);
 animalPart(head,zebra?mat.dark:giraffe?coat:mat.belly,[0,-.055,zebra?.47:.34],[giraffe?.235:zebra?.245:.17,.16,giraffe?.24:zebra?.22:.185]);
 const jaw=new THREE.Bone();jaw.position.set(0,-.16,zebra?.26:.16);head.add(jaw);animalPart(jaw,zebra?mat.dark:mat.belly,[0,0,.16],[giraffe?.19:zebra?.20:.145,.075,giraffe?.27:zebra?.25:.20]);
 const muzzleTip=new THREE.Object3D();muzzleTip.position.set(0,-.03,giraffe?.43:zebra?.39:.34);jaw.add(muzzleTip);
 const {ears,eyes}=faceDetails(head,giraffe?.225:zebra?.25:.18,.055,.18,giraffe?.29:zebra?.3:.34,coat,earPink,giraffe?.15:zebra?.1:.115);
 for(const side of [-1,1]){
  animalPart(head,mat.dark,[side*(giraffe?.15:zebra?.17:.11),-.025,zebra?.62:.50],[.027,.019,.016]);
  if(giraffe){mesh(new THREE.CylinderGeometry(.028,.045,.32,6),mat.patch,head,[side*.13,.37,-.045]);animalPart(head,mat.patch,[side*.13,.54,-.045],[.065,.065,.065]);}
  else if(!zebra){const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.1,.16,-.04),new THREE.Vector3(side*.14,.43,-.09),new THREE.Vector3(side*.16,.68,-.21),new THREE.Vector3(side*.12,.77,-.29)]);mesh(new THREE.TubeGeometry(curve,8,.032,5,false),mat.dark,head);}
 }
 if(!giraffe&&!zebra)animalPart(visual,mat.belly,[0,bodyY,-.70],[.23,.27,.12]);
 const tail=new THREE.Bone();tail.position.set(0,bodyY+.07,-bodyScale[2]*.9);visual.add(tail);
 const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(.02,-.22,-.14),new THREE.Vector3(.04,-.51,-.16)]);mesh(new THREE.TubeGeometry(curve,5,.028,5,false),coat,tail);animalPart(tail,mat.dark,[.04,-.55,-.16],[.09,.17,.075]);
 const nibble=makeNibble(jaw,giraffe?.43:zebra?.39:.34),sh=shadow(root,giraffe?1.12:.92,.13);sh.scale.y=.67;
 root.userData={type,visual,body,bodyScale,bodyY,legs,neck,neckLower,neckL1,neckL2,head,jaw,muzzleTip,ears,eyes,tail,nibble,shadow:sh,phase:rand()*6.28,walk:0,rest:0,graze:0};finishAnimalRig(root,visual);return root;
}
const types=['giraffe','zebra','gazelle','rabbit','squirrel',...Object.keys(newAnimals)];const species={giraffe:'기린',zebra:'얼룩말',gazelle:'가젤',rabbit:'토끼',squirrel:'다람쥐'};
for(const [type,animal] of Object.entries(newAnimals))species[type]=animal.name;
const isSmall=a=>a.userData.type==='rabbit'||a.userData.type==='squirrel';
function playerView(a){
 const spec=newAnimals[a.userData.type];
 if(spec)return {eye:.66*spec.scale,tag:(.95+spec.ear*.6)*spec.scale,radius:Math.max(mobile()?8.5:7.5,4.9*spec.scale)};
 return a.userData.type==='giraffe'?{eye:2.9,tag:4.6,radius:mobile()?19:17}:isSmall(a)?{eye:.85,tag:a.userData.type==='rabbit'?1.5:1.65,radius:mobile()?8.5:7.5}:{eye:1.7,tag:3.05,radius:mobile()?19:17};}
const startPointCandidates=[
 {x:6,z:6,name:'중앙 초원'},{x:-66,z:-58,name:'서쪽 숲길'},{x:71,z:61,name:'동쪽 언덕'},
 {x:-112,z:112,name:'북서 초원'},{x:135,z:92,name:'호숫가 초원'},{x:-168,z:-126,name:'남서 들판'},
 {x:208,z:-188,name:'남동 평원'},{x:-226,z:214,name:'북서 숲 가장자리'},{x:264,z:54,name:'동쪽 초원'},
 {x:-92,z:262,name:'북쪽 들판'},{x:118,z:-268,name:'남쪽 들판'},{x:-278,z:-34,name:'서쪽 변경'}
];
let lastStartIndex=-1;
try{lastStartIndex=Number(sessionStorage.getItem('slowSafariStartIndex')??-1);}catch{}
function chooseStartPoint(){
 const available=startPointCandidates.map((point,index)=>({...point,index})).filter(point=>canWalk(point.x,point.z)&&!treeLocations.some(tree=>Math.hypot(tree.x-point.x,tree.z-point.z)<3.6));
 const choices=available.filter(point=>point.index!==lastStartIndex),pool=choices.length?choices:available;
 const chosen=pool[Math.floor(Math.random()*pool.length)]||{...startPointCandidates[0],index:0};
 lastStartIndex=chosen.index;try{sessionStorage.setItem('slowSafariStartIndex',String(lastStartIndex));}catch{}
 return chosen;
}
const firstStart=chooseStartPoint();
let currentStartName=firstStart.name;
let player=animal('giraffe',firstStart.x,firstStart.z);player.rotation.y=Math.atan2(-firstStart.x,-firstStart.z);
const npcs=[];for(let i=0;i<7;i++){const coords=[[-3,-1],[9,-10],[-8,6],[13,4],[-13,-14],[6,-18],[20,-5]][i];const a=animal(types[i%3],...coords);a.rotation.y=rand()*Math.PI*2;a.userData.target=new THREE.Vector3(a.position.x,0,a.position.z);a.userData.timer=i*.8;a.userData.isRest=i===4;npcs.push(a);}
const birdMat=M(0x67765b);const birds=[];for(let i=0;i<5;i++){const b=new THREE.Group();scene.add(b);for(const side of [-1,1]){const wing=mesh(new THREE.ConeGeometry(.19,.85,3),birdMat,b,[side*.32,0,0]);wing.rotation.z=side*1.1;wing.scale.z=.15;}birds.push(b);}
// Small friends pause, nibble and explore close to their own patch of grass.
const rabbitCoats=[M(0xe8e1ce),M(0xc8ba9b),M(0xdbd8ca)];
const squirrelCoats=[M(0xa67c50),M(0xb78b5b)];
const innerEar=M(0xc3a99a),critterNose=M(0x786452);
function smallAnimal(type,x,z,index){
 const rabbit=type==='rabbit',coat=rabbit?rabbitCoats[index%3]:squirrelCoats[index%2];
 const root=new THREE.Bone();root.name=`${type}-${index+1}`;root.position.set(x,height(x,z),z);root.rotation.y=index*1.7;
 const visual=new THREE.Bone();root.add(visual);const bodyScale=rabbit?[.28,.29,.43]:[.225,.29,.35];
 const body=animalPart(visual,rabbit?coat:coatMaterial,[0,rabbit?.36:.39,0],bodyScale,rabbit?animalShape:coatShape(type));
 animalPart(visual,mat.belly,[0,.27,.04],[rabbit?.20:.15,.18,rabbit?.32:.27]);
 const legs=Array.from({length:4},(_,i)=>{
  const front=i<2,side=i%2?1:-1;
  if(!front)animalPart(visual,coat,[side*(rabbit?.147:.128),.31,-.22],[rabbit?.18:.14,.22,rabbit?.24:.20]);
  return makeLeg(visual,side*(front?.094:rabbit?.154:.137),.30,front?.22:-.22,
   front?.268:.314,coat,true,front);
 });
 const head=new THREE.Bone();head.position.set(0,rabbit?.61:.65,rabbit?.33:.27);visual.add(head);
 animalPart(head,coat,[0,0,0],[rabbit?.235:.215,.225,.25]);
 const jaw=new THREE.Bone();jaw.position.set(0,-.13,.12);head.add(jaw);
 animalPart(jaw,mat.belly,[0,.045,.07],[.155,.095,.13]);
 const muzzleTip=new THREE.Object3D();muzzleTip.position.set(0,.01,.19);jaw.add(muzzleTip);
 animalPart(head,critterNose,[0,-.025,.285],[.035,.028,.023]);
 const {eyes,ears}=faceDetails(head,rabbit?.192:.175,.047,.12,rabbit?.56:.19,coat,innerEar,rabbit?.075:.09);
 ears.forEach((ear,i)=>{ear.position.x=(i?1:-1)*(rabbit?.105:.13);ear.rotation.z=(i?-1:1)*(rabbit?.08:.30);});
 for(const side of [-1,1])for(let i=0;i<2;i++){const whisker=mesh(new THREE.CylinderGeometry(.003,.003,.20,3),critterNose,head,[side*.18,-.055+i*.045,.235]);whisker.rotation.z=side*(Math.PI/2+(i-.5)*.25);}
 const tail=new THREE.Bone();tail.position.set(0,.31,rabbit?-.44:-.26);visual.add(tail);
 if(rabbit)animalPart(tail,mat.white,[0,.035,0],[.14,.14,.135]);
 else{
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(0,.21,-.23),new THREE.Vector3(0,.65,-.36),new THREE.Vector3(0,1,-.18),new THREE.Vector3(0,.99,.08)]);
  mesh(new THREE.TubeGeometry(curve,12,.16,8,false),coat,tail);animalPart(tail,coat,[0,.72,-.29],[.25,.37,.23]);animalPart(tail,coat,[0,.98,-.06],[.22,.23,.18]);animalPart(tail,mat.belly,[0,.76,-.075],[.12,.24,.035]);
 }
 const nibble=makeNibble(jaw,.22,true),sh=shadow(root,rabbit?.48:.43,.1);root.scale.setScalar(.94+(index%3)*.04);scene.add(root);
 root.userData={type,visual,body,bodyScale,legs,head,jaw,muzzleTip,ears,eyes,tail,nibble,shadow:sh,headY:head.position.y,walk:0,rest:0,graze:0,home:new THREE.Vector3(x,0,z),target:new THREE.Vector3(x,0,z),timer:1+index*.6,phase:index*1.83,speed:rabbit?.95:1.2,moveBlend:0};finishAnimalRig(root,visual);return root;
}
const newAnimalHomes=[[42,-41],[14,-20],[-57,49],[-80,-41],[44,66],[-80,24],[-36,-71],[72,-58],[82,49]];
Object.keys(newAnimals).forEach((type,i)=>{
 const [x,z]=newAnimalHomes[i];
 const home=[[x,z],[x+4,z],[x-4,z],[x,z+4],[x,z-4]].find(([px,pz])=>canWalk(px,pz));
 if(!home)return;
 const animal=newAnimal(type,...home),data=animal.userData;
 data.home={x:home[0],z:home[1]};data.target=new THREE.Vector3(home[0],0,home[1]);data.timer=3+i*.8;
 npcs.push(animal);
});
const distributedHomes=[];
function findWildlifeHome(cx,cz,spacing=7){
 for(let attempt=0;attempt<36;attempt++){
  const angle=attempt*2.39996,radius=attempt?4+Math.sqrt(attempt)*3.3:0;
  const x=THREE.MathUtils.clamp(cx+Math.cos(angle)*radius,-worldLimit+14,worldLimit-14),z=THREE.MathUtils.clamp(cz+Math.sin(angle)*radius,-worldLimit+14,worldLimit-14);
  if(!canWalk(x,z)||distributedHomes.some(home=>Math.hypot(home.x-x,home.z-z)<spacing))continue;
  distributedHomes.push({x,z});return {x,z};
 }
 return null;
}
// One resident in every broad map sector, with a companion in alternating
// sectors. Only nearby animals are animated and rendered in the frame loop.
const wildlifeAxis=[-285,-170,-55,60,175,290];
let regionIndex=0;
for(const z of wildlifeAxis)for(const x of wildlifeAxis){
 const type=types[(regionIndex*5+Math.floor(regionIndex/6)*3)%types.length],count=regionIndex%2?1:2;
 for(let companion=0;companion<count;companion++){
  const home=findWildlifeHome(x+(companion?6:-2),z+(companion?3:0));if(!home)continue;
  const resident=newAnimals[type]?newAnimal(type,home.x,home.z):animal(type,home.x,home.z),data=resident.userData;
  data.home={x:home.x,z:home.z};data.target=new THREE.Vector3(home.x,0,home.z);data.timer=2+(regionIndex%7)+companion*1.7;data.wilderness=true;data.region=regionIndex;
  resident.rotation.y=(regionIndex*.83+companion*Math.PI)%(Math.PI*2);npcs.push(resident);
 }
 regionIndex++;
}
const critters=[];
const critterRegions=[[-1,6],[-145,-210],[198,-232],[-248,132],[235,176],[-86,274],[290,-48],[-275,-265],[-18,184],[162,26],[-176,38],[72,-178]];
critterRegions.forEach(([cx,cz],i)=>{
 const home=findWildlifeHome(cx,cz,4);if(!home)return;
 critters.push(smallAnimal(i%3?'rabbit':'squirrel',home.x,home.z,i));
});
$('friendCount').textContent=npcs.length+critters.length;
function animateCritters(dt,t,playerMoving=false){
 for(const a of critters){
  const d=a.userData,playerDistance=Math.hypot(a.position.x-player.position.x,a.position.z-player.position.z);d.timer-=dt;
  a.visible=playerDistance<115;if(!a.visible)continue;
  const rainShelter=weather.rain>.28,night=lightTarget.phase==='night';
  if(playerMoving&&playerDistance<4.8){
   const dx=a.position.x-player.position.x,dz=a.position.z-player.position.z,length=Math.max(.1,Math.hypot(dx,dz));
   const x=a.position.x+dx/length*6,z=a.position.z+dz/length*6;
   if(canWalk(x,z)){d.target.set(x,0,z);d.timer=2;}
  }else if(rainShelter&&d.ecoMode!=='shelter'){
   const shelter=nearestShelterPoint(a.position.x,a.position.z);
   if(shelter){d.target.set(shelter.x,0,shelter.z);d.ecoMode='shelter';d.timer=7;}
  }else if(!rainShelter&&d.ecoMode==='shelter'){d.ecoMode='roam';d.timer=-1;}
  if(d.timer<=0){d.timer=(night?7:4)+rand()*7;const x=d.home.x+(rand()-.5)*10,z=d.home.z+(rand()-.5)*10;if(canWalk(x,z)&&lineWalk(a.position,{x,z}))d.target.set(x,0,z);}
  const dx=d.target.x-a.position.x,dz=d.target.z-a.position.z,distance=Math.hypot(dx,dz);let moving=false;
  const resting=night&&!rainShelter&&playerDistance>5&&Math.sin(t*.12+d.phase)>.15;
  if(distance>.16&&!resting){const amount=Math.min(d.speed*dt*(playerDistance<5?1.45:1),distance),nx=a.position.x+dx/distance*amount,nz=a.position.z+dz/distance*amount;if(canWalk(nx,nz)){a.position.x=nx;a.position.z=nz;moving=true;const turn=THREE.MathUtils.euclideanModulo(Math.atan2(dx,dz)-a.rotation.y+Math.PI,Math.PI*2)-Math.PI;a.rotation.y+=turn*Math.min(dt*7,1);}}
  animateSmallPlayer(a,dt,t,moving,resting,false,!moving&&!resting&&!rainShelter&&Math.sin(t*.45+d.phase)>.35);
 }
}
const nocturnalSpecies=new Set(['hedgehog','fennec']);
const timidSpecies=new Set(['gazelle','zebra','rabbit','squirrel','guineaPig','chinchilla','hedgehog','meerkat','fennec']);
function nearestShelterPoint(x,z){
 let best=null,bestDistance=Infinity;
 for(const grove of groves)for(let i=0;i<10;i++){
  const a=Math.atan2(z-grove.z,x-grove.x)+(i-4.5)*.34;
  const px=grove.x+Math.cos(a)*grove.rx*.58,pz=grove.z+Math.sin(a)*grove.rz*.58,distance=Math.hypot(px-x,pz-z);
  if(distance<bestDistance&&distance<95&&canWalk(px,pz)){best={x:px,z:pz};bestDistance=distance;}
 }
 return best;
}
function nearestEcologyShore(x,z){
 let best=null,bestDistance=Infinity;
 for(const water of waterBodies)for(let i=0;i<14;i++){
  const a=i/14*Math.PI*2,px=water.x+Math.cos(a)*water.rx*1.17,pz=water.z+Math.sin(a)*water.rz*1.17,distance=Math.hypot(px-x,pz-z);
  if(distance<bestDistance&&distance<82&&canWalk(px,pz)){best={x:px,z:pz,faceX:water.x,faceZ:water.z};bestDistance=distance;}
 }
 return best;
}
function chooseHerdTarget(a,index){
 const d=a.userData,companions=npcs.filter(other=>other!==a&&other.userData.type===d.type&&Math.hypot(other.position.x-a.position.x,other.position.z-a.position.z)<55);
 const anchor=companions[0]?.userData.target||companions[0]?.position||d.home||a.position;
 const angle=(index*2.39996+d.phase)%(Math.PI*2),radius=companions.length?3.2+(index%3)*1.7:7+rand()*8;
 const x=anchor.x+Math.cos(angle)*radius,z=anchor.z+Math.sin(angle)*radius;
 if(canWalk(x,z)&&lineWalk(a.position,{x,z}))d.target.set(x,0,z);
}
function animateNpcEcology(a,index,dt,t,playerMoving){
 const d=a.userData,distanceToPlayer=Math.hypot(a.position.x-player.position.x,a.position.z-player.position.z);
 a.visible=distanceToPlayer<150;if(distanceToPlayer>150)return;
 d.home??={x:a.position.x,z:a.position.z};d.ecoMode??='roam';d.ecoRain??=false;d.timer-=dt;
 const raining=weather.rain>.27,night=lightTarget.phase==='night',nocturnal=nocturnalSpecies.has(d.type);
 const waterHour=!night&&((environmentMinutes>=390&&environmentMinutes<510)||(environmentMinutes>=990&&environmentMinutes<1080)||(Math.floor(t/80)+index)%11===0);
 if(raining!==d.ecoRain){d.ecoRain=raining;d.timer=-1;}
 if(playerMoving&&timidSpecies.has(d.type)&&distanceToPlayer<(d.type==='zebra'||d.type==='gazelle'?8:6)){
  const dx=a.position.x-player.position.x,dz=a.position.z-player.position.z,length=Math.max(.1,Math.hypot(dx,dz));
  const x=a.position.x+dx/length*10,z=a.position.z+dz/length*10;
  if(canWalk(x,z)){d.target.set(x,0,z);d.ecoMode='flee';d.timer=2.5;}
 }else if(raining&&d.ecoMode!=='shelter'){
  const shelter=nearestShelterPoint(a.position.x,a.position.z);
  if(shelter){d.target.set(shelter.x,0,shelter.z);d.ecoMode='shelter';d.timer=8+rand()*5;}
 }else if(!raining&&waterHour&&d.ecoMode!=='water'&&d.timer<0){
  const shore=nearestEcologyShore(a.position.x,a.position.z);
  if(shore){d.target.set(shore.x,0,shore.z);d.waterFace=shore;d.ecoMode='water';d.timer=12+rand()*8;}
 }else if(d.timer<0){
  d.timer=(night===nocturnal?4:8)+rand()*(night===nocturnal?7:12);d.ecoMode='roam';chooseHerdTarget(a,index);
 }
 const dx=d.target.x-a.position.x,dz=d.target.z-a.position.z,dist=Math.hypot(dx,dz);
 const reached=dist<.34,drinking=d.ecoMode==='water'&&reached&&!raining;
 const resting=(!nocturnal&&night&&d.ecoMode!=='flee')||(nocturnal&&!night&&d.ecoMode==='roam')||(d.ecoMode==='shelter'&&reached)||(d.isRest&&Math.sin(t*.1+d.phase)>.55);
 const curious=!timidSpecies.has(d.type)&&distanceToPlayer>4&&distanceToPlayer<12&&!playerMoving&&!raining;
 let mv=false;
 if(dist>.25&&!resting&&!drinking){
  const speed=d.ecoMode==='flee'?1.25:d.ecoMode==='shelter'?.82:(night===nocturnal?.78:.58),nx=a.position.x+dx/dist*dt*speed,nz=a.position.z+dz/dist*dt*speed;
  if(canWalk(nx,nz)){a.position.x=nx;a.position.z=nz;mv=true;const target=Math.atan2(dx,dz),delta=THREE.MathUtils.euclideanModulo(target-a.rotation.y+Math.PI,Math.PI*2)-Math.PI;a.rotation.y+=delta*Math.min(dt*3.5,1);}
 }else if(drinking&&d.waterFace){
  const target=Math.atan2(d.waterFace.faceX-a.position.x,d.waterFace.faceZ-a.position.z),delta=THREE.MathUtils.euclideanModulo(target-a.rotation.y+Math.PI,Math.PI*2)-Math.PI;a.rotation.y+=delta*Math.min(dt*2.5,1);
 }else if(curious){
  const target=Math.atan2(player.position.x-a.position.x,player.position.z-a.position.z),delta=THREE.MathUtils.euclideanModulo(target-a.rotation.y+Math.PI,Math.PI*2)-Math.PI;a.rotation.y+=delta*Math.min(dt*1.9,1);
 }
 const grazing=!mv&&!resting&&!drinking&&!raining&&Math.sin(t*.35+d.phase)>.5;
 animateAnimal(a,dt,t,mv,resting,drinking,grazing);
}
const info={giraffe:{name:'느긋한 기린',copy:'조금 높은 곳에서, 조금 느긋하게.<br>당신의 속도로 초원을 만나보세요.'},zebra:{name:'다정한 얼룩말',copy:'누구와도 똑같지 않은 나만의 무늬.<br>발길이 닿는 곳이 오늘의 여행이에요.'},gazelle:{name:'사뿐한 가젤',copy:'풀잎 사이를 사뿐사뿐.<br>마음이 가는 곳에서 잠시 쉬어가세요.'},rabbit:{name:'보드라운 토끼',copy:'긴 귀에 바람을 담고, 폴짝폴짝.<br>풀잎 가까이에서 작은 쉼을 찾아봐요.'},squirrel:{name:'종종걸음 다람쥐',copy:'포근한 꼬리와 함께 숲 그늘로.<br>작은 발걸음에도 넓은 세상이 펼쳐져요.'}};
function animalSVG(type){
 if(type==='meerkat')return `<svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="M55 77q19 15 33 1" fill="none" stroke="#a87a4f" stroke-width="7" stroke-linecap="round"/>
  <path d="M38 78q-10 2-11 8h36q0-6-12-9" fill="#855e3e"/>
  <ellipse cx="47" cy="61" rx="16" ry="23" fill="#b78b56"/>
  <ellipse cx="46" cy="63" rx="10" ry="17" fill="#ead2a5"/>
  <path d="m35 52 9 9m14-10-8 10" fill="none" stroke="#966c46" stroke-width="5" stroke-linecap="round"/>
  <circle cx="33" cy="29" r="7" fill="#966c46"/>
  <circle cx="62" cy="29" r="7" fill="#966c46"/>
  <ellipse cx="47" cy="34" rx="18" ry="16" fill="#c79c69"/>
  <ellipse cx="39" cy="34" rx="5" ry="6" fill="#6e503a"/>
  <ellipse cx="55" cy="34" rx="5" ry="6" fill="#6e503a"/>
  <ellipse cx="47" cy="42" rx="9" ry="6" fill="#f2ddba"/>
  <circle cx="39" cy="33" r="2" fill="#26251d"/>
  <circle cx="55" cy="33" r="2" fill="#26251d"/>
  <ellipse cx="47" cy="40" rx="3" ry="2" fill="#493626"/>
 </svg>`;

 if(newAnimals[type])return '<span class="animal-emoji" aria-hidden="true">'+newAnimals[type].icon+'</span>';
 if(type==='rabbit'||type==='squirrel'){
  const rabbit=type==='rabbit',coat=rabbit?'#d8cfb9':'#b58a5c';
  return `<svg viewBox="0 0 100 100" fill="none" aria-hidden="true">${rabbit?'<ellipse cx="59" cy="25" rx="7" ry="21" fill="#d8cfb9" transform="rotate(-13 59 25)"/><ellipse cx="73" cy="24" rx="7" ry="20" fill="#d8cfb9" transform="rotate(12 73 24)"/><path d="m59 13 3 22m12-23-3 22" stroke="#c3a99a" stroke-width="3" stroke-linecap="round"/><circle cx="22" cy="68" r="10" fill="#eee7d8"/>':'<path d="M30 72C0 68 6 22 27 18c19-4 24 17 10 26-12 8-15 16-7 28Z" fill="#b58a5c"/><path d="M17 29c-7 14-2 27 9 32" stroke="#c6a273" stroke-width="5" stroke-linecap="round"/><path d="m58 39-2-15 12 10m3 4 7-13 5 18" fill="#b58a5c"/>'}<ellipse cx="46" cy="67" rx="25" ry="19" fill="${coat}"/><circle cx="67" cy="47" r="18" fill="${coat}"/><ellipse cx="78" cy="54" rx="12" ry="8" fill="#eee1c7"/><ellipse cx="58" cy="82" rx="16" ry="5" fill="${coat}"/><circle cx="73" cy="44" r="2.5" fill="#454c38"/><circle cx="88" cy="51" r="2.5" fill="#786452"/></svg>`;
 }
 const giraffe=type==='giraffe',zebra=type==='zebra';const fill=giraffe?'#cba65f':zebra?'#e5dfcc':'#bb9868';return `<svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M25 65 23 87h7l6-22m19 0 3 22h6l-1-26" fill="${fill}"/><path d="m29 42-8 5-3 16 8 3" stroke="#7d805e" stroke-width="2" stroke-linecap="round"/><path d="M29 45c-13 3-13 20 1 22h28c13-1 13-19-1-22Z" fill="${fill}"/><path d="${giraffe?'m54 54 5-39 9 1 3 38':'m54 52 5-22 11 2 1 23'}" fill="${fill}"/><path d="${giraffe?'M58 15c-3-9 16-8 18-2l10 4-2 7-24-2Z':'M59 30c-3-9 16-9 18-2l9 7-4 8-22-6Z'}" fill="${fill}"/><path d="${giraffe?'m63 10-2-6m9 6 1-6':zebra?'m62 26-1-8 5 7m4 1 3-8 1 10':'m63 24-2-15m10 16 3-16'}" stroke="#6c6248" stroke-width="3" stroke-linecap="round"/><circle cx="${giraffe?74:75}" cy="${giraffe?16:32}" r="1.8" fill="#414d36"/>${giraffe?'<path d="m32 48 5 2-1 6-6-1m14-7 6 2-1 5-7-1m-2 5 6 2-1 5-6-1m20-44 5 1-1 6-5-1m0 6 5 2-1 6-5-1" fill="#977544"/>':zebra?'<path d="m27 46 4 20m5-21 4 22m6-22 4 22m6-20 4 18m2-28 9 3m-10 2 9 3" stroke="#646653" stroke-width="3"/>':'<path d="M26 58h33" stroke="#756644" stroke-width="3"/>'}</svg>`;
}
let lastGroundTap=null;
let playing=false,mode='walk',overview=false,angle=0,viewPitch=.64,viewZoom=1,autoTarget=null,route=[];const keys=new Set();const idleViewDelay=15;let idleElapsed=0;let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3400);}
const speciesActions={
 giraffe:{label:'잎 먹기',active:'그만 먹기',message:'나뭇잎을 천천히 씹어요.'},
 rabbit:{label:'주변 살피기',active:'살피기 끝',message:'귀를 세우고 주변을 살펴요.'},
 squirrel:{label:'열매 먹기',active:'그만 먹기',message:'앞발에 열매를 쥐고 조금씩 먹어요.'},
 zebra:{label:'뒷발 차기',duration:1.4,message:'뒷발을 들어 풀밭을 차요.'},
 gazelle:{label:'가볍게 뛰기',duration:1.5,message:'두 번 가볍게 폴짝 뛰어요.'},
 elephant:{label:'코 돌리기',duration:2.6,message:'긴 코를 들어 천천히 한 바퀴 돌려요.'},
 hippo:{label:'하품하기',duration:2.7,message:'입을 크게 벌려 하품해요.'},
 rhino:{label:'앞발로 땅 긁기',duration:2.4,message:'앞발로 흙을 두 번 긁어요.'},
 turtle:{label:'등딱지에 숨기',duration:2.8,message:'머리와 다리를 등딱지 쪽으로 움츠려요.'},
 guineaPig:{label:'팝콘 점프',duration:1.4,message:'기니피그가 몸을 틀며 톡 튀어 올라요.'},
 chinchilla:{label:'모래 목욕',duration:2.8,message:'몸을 옆으로 뉘고 바닥에 등을 비벼요.'},
 hedgehog:{label:'몸 말기',duration:2.7,message:'머리와 다리를 안으로 모아 몸을 말아요.'},
 meerkat:{label:'두 발로 서기',duration:2.9,message:'뒷발로 서서 멀리 둘러봐요.'},
 fennec:{label:'귀 기울이기',duration:2.5,message:'커다란 귀를 번갈아 움직이며 소리를 들어요.'}
};
const fruitMaterial=M(0xc46d47);
const fruit=mesh(sphere,fruitMaterial,scene,[0,0,0],[.075,.07,.075]);
fruit.visible=false;
function syncSpeciesAction(){
 const action=speciesActions[player.userData.type];
 const active=mode==='special'||mode==='toTree';
 const button=$('speciesAction');
 button.hidden=!action;
 button.classList.toggle('active',active);
 button.setAttribute('aria-pressed',active);
 button.querySelector('span').textContent=active?action?.active||'동작 멈추기':action?.label||'';
 $('actions').classList.toggle('has-special',!!action);
}
function beginSpeciesAction(){
 const action=speciesActions[player.userData.type];
 if(!action)return;
 registerActivity();
 keys.clear();
 autoTarget=null;
 route=[];
 if(mode==='special'||mode==='toTree'){setMode('walk');return;}
 if(player.userData.type==='giraffe'){
  const {x,z}=player.position;
  const nearby=treeLocations.filter(tree=>tree.scale<=1.35&&Math.hypot(tree.x-x,tree.z-z)<16)
   .sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z));
  for(const tree of nearby){
   const a=Math.atan2(z-tree.z,x-tree.x),distance=2.5*tree.scale;
   const path=groundRoute(x,z,tree.x+Math.cos(a)*distance,tree.z+Math.sin(a)*distance);
   if(!path.length)continue;
   route=path;
   route.tree=tree;
   autoTarget=route.shift();
   setMode('toTree');
   toast('가까운 나무로 천천히 걸어가요.');
   return;
  }
  setMode('walk');
  toast('잎을 먹으려면 나무 가까이 가보세요.');
  return;
 }
 setMode('special');
 toast(action.message);
}
$('speciesAction').onclick=beginSpeciesAction;
let speciesActionElapsed=0;
function setMode(m){if(m==='special')speciesActionElapsed=0;lastGroundTap=null;mode=m;syncSpeciesAction();$('graze').classList.toggle('active',m==='graze');$('graze').setAttribute('aria-pressed',m==='graze');$('graze').querySelector('span').textContent=m==='graze'?'그만 먹기':'풀 뜯기';$('rest').classList.toggle('active',m==='rest');$('rest').querySelector('span').textContent=m==='rest'?'일어나기':'쉬어가기';$('drink').classList.toggle('active',m==='drink'||m==='toWater');$('drink').querySelector('span').textContent=m==='toWater'?'물가로 가는 중':m==='drink'?'다 마셨어요':'물 마시기';}
function randomBirth(){registerActivity();keys.clear();autoTarget=null;route=[];setMode('walk');const type=types[Math.floor(Math.random()*types.length)],spawn=chooseStartPoint();scene.add(fruit);fruit.visible=false;scene.remove(player);disposeAnimal(player);player=animal(type,spawn.x,spawn.z);currentStartName=spawn.name;syncSpeciesAction();player.rotation.y=Math.atan2(-spawn.x,-spawn.z);$('animalIcon').innerHTML=animalSVG(type);$('revealIcon').innerHTML=animalSVG(type);$('animalName').textContent=(info[type]?.name||species[type]);$('playerSpecies').textContent=species[type];$('revealSpecies').textContent=species[type];$('revealCopy').innerHTML=(info[type]?.copy||'느린 초원을 천천히 걸어보세요.');$('birthDialog').showModal();}
function disposeAnimal(a){a.userData.skin?.skeleton.dispose();a.traverse(o=>{if(o.isMesh){if(o.geometry!==foliage&&o.geometry!==box&&o.geometry!==ico&&o.geometry!==sphere&&o.geometry!==nibbleBlade&&o.geometry!==animalShape)o.geometry.dispose();}});}
$('birth').onclick=randomBirth;$('rebirth').onclick=randomBirth;
let meadowConnected=false;
const meadowPeers=new Map();
const meadowAdjectives=['느긋한','포근한','조용한','반짝이는','수줍은','다정한','한가로운','씩씩한'];
const meadowNames=['노을','바람','달빛','솔잎','이슬','구름','민들레','물결','새벽','별빛','봄비','풀잎'];
function meadowNickname(id){
 const adjective=meadowAdjectives[parseInt(id.slice(0,4),16)%meadowAdjectives.length];
 const name=meadowNames[parseInt(id.slice(4,8),16)%meadowNames.length];
 return adjective+' '+name;
}
function receiveMeadowPlayers(players){
 const incoming=new Set(players.map(peer=>peer.id));
 for(const [id,peer] of meadowPeers){
  if(incoming.has(id)&&players.find(other=>other.id===id).species===peer.animal.userData.type)continue;
  scene.remove(peer.animal);
  disposeAnimal(peer.animal);
  peer.tag.remove();
  meadowPeers.delete(id);
 }
 for(const state of players){
  if(!types.includes(state.species))continue;
  let peer=meadowPeers.get(state.id);
  if(!peer){
   const avatar=animal(state.species,state.x,state.z);
   avatar.rotation.y=state.yaw;
   const tag=document.createElement('div');
   tag.className='player-tag meadow-peer-tag';
   tag.textContent=meadowNickname(state.id);
   $('gameUI').appendChild(tag);
   peer={animal:avatar,tag};
   meadowPeers.set(state.id,peer);
  }
  peer.state=state;
 }
}
function joinMeadow(){
 if(meadowConnected)return;
 meadowConnected=true;
 connectMeadow({
  sample(){
   const d=player.userData;
   const motion=mode==='drink'||mode==='graze'||mode==='rest'?mode:
    d.walk>.12?(d.running?'run':'walk'):'idle';
   const yaw=THREE.MathUtils.euclideanModulo(player.rotation.y+Math.PI,Math.PI*2)-Math.PI;
   return {species:d.type,x:player.position.x,z:player.position.z,yaw,motion};
  },
  onPlayers:receiveMeadowPlayers,
  onStatus:()=>{}
 });
}
function animateMeadowPeers(dt,t){
 for(const {animal:avatar,state} of meadowPeers.values()){
  const dx=state.x-avatar.position.x,dz=state.z-avatar.position.z;
  const distance=Math.hypot(dx,dz);
  const blend=distance>12?1:1-Math.exp(-dt*3.8);
  avatar.position.x+=dx*blend;
  avatar.position.z+=dz*blend;
  const angle=THREE.MathUtils.euclideanModulo(state.yaw-avatar.rotation.y+Math.PI,Math.PI*2)-Math.PI;
  avatar.rotation.y+=angle*blend;
  avatar.userData.running=state.motion==='run';
  animateAnimal(avatar,dt,t,distance>.08&&distance<=12,state.motion==='rest',state.motion==='drink',state.motion==='graze');
 }
}
function placeMeadowTags(){
 if(!meadowPeers.size)return;
 camera.updateMatrixWorld();
 for(const {animal:avatar,tag} of meadowPeers.values()){
  toProject.copy(avatar.position);
  toProject.y+=playerView(avatar).tag;
  toProject.project(camera);
  const edge=tag.hidden?1:1.04;
  tag.hidden=toProject.z<=-1||toProject.z>=1||Math.abs(toProject.x)>edge||Math.abs(toProject.y)>edge;
  if(!tag.hidden){
   tag.style.left=((toProject.x*.5+.5)*innerWidth)+'px';
   tag.style.top=((.5-toProject.y*.5)*innerHeight-8)+'px';
  }
 }
}
$('begin').onclick=()=>{$('birthDialog').close();playing=true;joinMeadow();resetView();document.body.classList.add('playing');$('welcome').inert=true;$('welcome').setAttribute('aria-hidden','true');$('gameUI').hidden=false;registerActivity();toast(`${currentStartName}에서 천천히 시작해요.`);};
$('birthDialog').addEventListener('cancel',e=>{e.preventDefault();$('begin').click();});
$('graze').onclick=()=>{
 registerActivity();autoTarget=null;route=[];setMode(mode==='graze'?'walk':'graze');
 if(mode==='graze'){toast('사각사각, 싱그러운 풀을 천천히 먹어요.');}
};
$('rest').onclick=()=>{registerActivity();autoTarget=null;route=[];setMode(mode==='rest'?'walk':'rest');if(mode==='rest')toast('잠깐, 바람이 지나가는 소리를 들어요.');};
$('drink').onclick=()=>{registerActivity();if(mode==='drink'||mode==='toWater'){autoTarget=null;route=[];setMode('walk');return;}if(walkToWater())toast('가까운 물가로 천천히 걸어가요.');};
$('settings').onclick=()=>{lastGroundTap=null;registerActivity();keys.clear();$('settingsDialog').showModal();};$('settingsDialog').querySelector('.close').onclick=()=>$('settingsDialog').close();$('settingsDialog').onclick=e=>{if(e.target===$('settingsDialog')){const r=$('settingsDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('settingsDialog').close();}};
const skyStyles={
 day:{title:'포근한 오후',top:0x689bc8,horizon:0xd6e0dc,cloud:0xfff4e4,sun:0xffecd0,hemi:0xdfeaf2,direct:2.85,ambient:1.35},
 sunset:{top:0x657ba5,horizon:0xf3ac88,cloud:0xffc5a5,sun:0xffa55c,hemi:0xffcfad,direct:1.45,ambient:.91},
 night:{title:'별이 뜬 밤',top:0x071121,horizon:0x3e536b,cloud:0x63748b,sun:0xc5d5ff,hemi:0xb5c9e8,direct:.38,ambient:.62}
};
const skyMoon=mesh(new THREE.IcosahedronGeometry(2.2,2),new THREE.MeshBasicMaterial({color:0xf2ecd5,fog:false}),skyDome,[-76,58,-106]);skyMoon.visible=false;finishCelestialDepth(skyMoon.material);
const stars=createStarfield();skyDome.add(stars);
const fireflyGroups=[
 ...smallPonds.map(p=>[p.x+p.rx+2,p.z]),
 ...groves.map(g=>[g.x,g.z]),
 [-61,59],[-80,-103],[37,107],[-98,80],[6,7]
];
const lakeFireflies=64,fliesPerGroup=13;
const fireflyCount=lakeFireflies+fireflyGroups.length*fliesPerGroup;
const fireflyPositions=new Float32Array(fireflyCount*3);
const fireflyColors=new Float32Array(fireflyCount*3);
const fireflyGeometry=new THREE.BufferGeometry();
fireflyGeometry.setAttribute('position',new THREE.BufferAttribute(fireflyPositions,3));
fireflyGeometry.setAttribute('color',new THREE.BufferAttribute(fireflyColors,3));
const fireflies=new THREE.Points(fireflyGeometry,new THREE.PointsMaterial({
 size:.29,vertexColors:true,transparent:true,opacity:.88,blending:THREE.AdditiveBlending,depthWrite:false
}));
fireflies.frustumCulled=false;
fireflies.visible=false;
scene.add(fireflies);
function animateFireflies(t){
 fireflies.visible=lightTarget.phase==='night';
 if(!fireflies.visible)return;
 for(let i=0;i<fireflyCount;i++){
  const a=i*2.399963,bank=1.14+(i%5)*.028;
  const group=i<lakeFireflies?null:fireflyGroups[Math.floor((i-lakeFireflies)/fliesPerGroup)];
  const radius=1.2+((i*.618034)%1)*3.5;
  const x=(group?group[0]+Math.cos(a)*radius:lake.x+Math.cos(a)*lake.rx*bank)+Math.sin(t*.7+i)*.6;
  const z=(group?group[1]+Math.sin(a)*radius:lake.z+Math.sin(a)*lake.rz*bank)+Math.cos(t*.55+i)*.55;
  const j=i*3,brightness=(.5+.5*Math.sin(t*(1.2+i%4*.18)+i*1.7))**3;
  fireflyPositions[j]=x;
  fireflyPositions[j+1]=height(x,z)+.55+(i%7)*.22+Math.sin(t*.8+i)*.23;
  fireflyPositions[j+2]=z;
  fireflyColors[j]=brightness*.83;
  fireflyColors[j+1]=brightness;
  fireflyColors[j+2]=brightness*.26;
 }
 fireflyGeometry.attributes.position.needsUpdate=true;
 fireflyGeometry.attributes.color.needsUpdate=true;
}
const lightTarget={top:new THREE.Color(),horizon:new THREE.Color(),cloud:new THREE.Color(),sun:new THREE.Color(),hemi:new THREE.Color(),light:new THREE.Vector3(),direct:2.8,ambient:2.5,fog:.0018,phase:'day',cloudCount:3};
let backgroundMode='live';
const backgroundOptions={live:'liveTime',day:'day',night:'nightTime'};
for(const [mode,id] of Object.entries(backgroundOptions)){
 $(id).onclick=()=>{
  backgroundMode=mode;
  for(const [key,buttonId] of Object.entries(backgroundOptions)){
   $(buttonId).classList.toggle('selected',key===mode);
   $(buttonId).setAttribute('aria-pressed',key===mode);
  }
  syncEnvironment();
 };
}
let invertVertical=false,invertHorizontal=false;
$('invertVertical').onclick=()=>{
 invertVertical=!invertVertical;
 $('invertVertical').setAttribute('aria-checked',invertVertical);
};
$('invertHorizontal').onclick=()=>{
 invertHorizontal=!invertHorizontal;
 $('invertHorizontal').setAttribute('aria-checked',invertHorizontal);
};
// The calendar seed gives every visitor the same rare weather for a given day.
function scenerySeed(date){
 let seed=2166136261;
 for(const character of date)seed=Math.imul(seed^character.charCodeAt(0),16777619);
 return seed>>>0;
}
const mistPixels=new Uint8Array(64*64*4);
for(let y=0;y<64;y++)for(let x=0;x<64;x++){
 const offset=(y*64+x)*4;
 const radius=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5);
 mistPixels.set([255,255,255,Math.round(255*Math.max(0,1-radius*radius)**2)],offset);
}
const mistTexture=new THREE.DataTexture(mistPixels,64,64);
mistTexture.magFilter=THREE.LinearFilter;
mistTexture.needsUpdate=true;
const waterfallMist=new THREE.Group();waterfallMist.name='waterfall-mist';scene.add(waterfallMist);
for(let i=0;i<12;i++){
 const material=new THREE.SpriteMaterial({map:mistTexture,color:0xdce9e8,transparent:true,opacity:.12,depthWrite:false});
 const puff=new THREE.Sprite(material);waterfallMist.add(puff);
}
const mistMaterial=new THREE.SpriteMaterial({map:mistTexture,color:0xc8d4d6,transparent:true,opacity:0,depthWrite:false});
const lakeMist=new THREE.Group();
lakeMist.name='dawn-lake-mist';
lakeMist.visible=false;
scene.add(lakeMist);
for(let i=0;i<18;i++){
 const a=i*2.39996,r=Math.sqrt((i+.5)/18)*.81;
 const sprite=new THREE.Sprite(mistMaterial);
 sprite.position.set(lake.x+Math.cos(a)*lake.rx*r,.9+(i%3)*.55,lake.z+Math.sin(a)*lake.rz*r);
 sprite.scale.set(18+(i%4)*4,3+(i%3),1);
 sprite.userData.originX=sprite.position.x;
 lakeMist.add(sprite);
}
// Low meadow fog, light rain and a faint post-rain rainbow make weather feel
// present without turning the quiet meadow into a storm scene.
const fieldMistMaterial=new THREE.SpriteMaterial({map:mistTexture,color:0xd7dfdc,transparent:true,opacity:0,depthWrite:false});
const fieldMist=new THREE.Group();fieldMist.name='low-meadow-mist';fieldMist.visible=false;scene.add(fieldMist);
for(let i=0;i<24;i++){
 const a=i*2.39996,r=10+(i%6)*8;
 const sprite=new THREE.Sprite(fieldMistMaterial);
 sprite.position.set(Math.cos(a)*r,.65+(i%3)*.28,Math.sin(a)*r);
 sprite.scale.set(18+(i%5)*5,2.2+(i%3)*.7,1);
 sprite.userData.angle=a;sprite.userData.radius=r;sprite.userData.drift=(i%2?1:-1)*(.16+(i%4)*.025);
 fieldMist.add(sprite);
}
const rainDropCount=640,rainPositions=new Float32Array(rainDropCount*6),rainSeeds=[];
for(let i=0;i<rainDropCount;i++)rainSeeds.push({x:rand(),y:rand(),z:rand(),speed:.78+rand()*.58});
const rainGeometry=new THREE.BufferGeometry();rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));
const rainMaterial=new THREE.LineBasicMaterial({color:0xbfd4dc,transparent:true,opacity:0,depthWrite:false});
const rainField=new THREE.LineSegments(rainGeometry,rainMaterial);rainField.name='gentle-rain';rainField.visible=false;rainField.frustumCulled=false;scene.add(rainField);
const rainbow=new THREE.Group();rainbow.name='after-rain-rainbow';rainbow.visible=false;skyDome.add(rainbow);
[0xe87975,0xefa668,0xf1d477,0x93c889,0x73b9c6,0x8199d1].forEach((color,index)=>{
 const points=[],radius=49-index*.62;
 for(let i=0;i<=72;i++){const a=i/72*Math.PI;points.push(new THREE.Vector3(Math.cos(a)*radius,Math.sin(a)*radius-10,-148-index*.08));}
 const geometry=new THREE.BufferGeometry().setFromPoints(points);
 const material=new THREE.LineBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,fog:false});
 rainbow.add(new THREE.Line(geometry,material));
});
const weather={rain:0,rainTarget:0,fog:0,fogTarget:0,afterRain:0,afterRainTarget:0};
let environmentMinutes=720;
function animateWeather(dt,t){
 weather.rain=THREE.MathUtils.damp(weather.rain,weather.rainTarget,.55,dt);
 weather.fog=THREE.MathUtils.damp(weather.fog,weather.fogTarget,.34,dt);
 weather.afterRain=THREE.MathUtils.damp(weather.afterRain,weather.afterRainTarget,.32,dt);
 rainField.visible=weather.rain>.015;rainMaterial.opacity=.46*weather.rain;
 if(rainField.visible){
  const radius=lightGraphics?45:68,ceiling=34,active=lightGraphics?280:rainDropCount;
  rainGeometry.setDrawRange(0,active*2);
  for(let i=0;i<active;i++){
   const seed=rainSeeds[i],fall=(seed.y+t*seed.speed*.72)%1;
   const x=player.position.x+(seed.x-.5)*radius*2,z=player.position.z+(seed.z-.5)*radius*2;
   const ground=height(x,z),y=ground+1+(1-fall)*ceiling,j=i*6;
   rainPositions[j]=x;rainPositions[j+1]=y;rainPositions[j+2]=z;
   rainPositions[j+3]=x+.07;rainPositions[j+4]=Math.max(ground,y-(.65+seed.speed*.75));rainPositions[j+5]=z+.03;
  }
  rainGeometry.attributes.position.needsUpdate=true;
 }
 fieldMistMaterial.opacity=.105*weather.fog;fieldMist.visible=weather.fog>.015;
 if(fieldMist.visible)fieldMist.children.forEach((sprite,i)=>{
  const a=sprite.userData.angle+t*sprite.userData.drift*.018,r=sprite.userData.radius;
  sprite.position.set(player.position.x+Math.cos(a)*r,height(player.position.x+Math.cos(a)*r,player.position.z+Math.sin(a)*r)+.5+(i%3)*.22,player.position.z+Math.sin(a)*r);
 });
 const rainbowOpacity=weather.afterRain*(lightTarget.phase==='day'?1:0);
 rainbow.visible=rainbowOpacity>.01;
 rainbow.children.forEach((arc,i)=>arc.material.opacity=rainbowOpacity*(.19-i*.012));
 terrainMaterial.roughness=THREE.MathUtils.damp(terrainMaterial.roughness,THREE.MathUtils.lerp(.88,.48,weather.rain+weather.afterRain*.35),1.2,dt);
 waterMat.opacity=THREE.MathUtils.damp(waterMat.opacity,THREE.MathUtils.lerp(.94,.985,weather.rain),1.3,dt);
}
const meteorGeometry=new THREE.BufferGeometry();
const meteorVertices=new Float32Array(6);
meteorGeometry.setAttribute('position',new THREE.BufferAttribute(meteorVertices,3));
const meteor=new THREE.Line(meteorGeometry,new THREE.LineBasicMaterial({
 color:0xffecd4,transparent:true,opacity:0,depthWrite:false,fog:false,blending:THREE.AdditiveBlending
}));
finishCelestialDepth(meteor.material);
meteor.name='shooting-star';
meteor.frustumCulled=false;
meteor.visible=false;
skyDome.add(meteor);
let mistTarget=0,meteorNight=false,meteorSeed=0,meteorMinute=0,scenerySampleTime=0;
function animateRareScenery(dt,t){
 waterfallMist.children.forEach((puff,i)=>{
  const phase=(t*.045+i*.618034)%1,a=i*2.39996;
  puff.position.set(falls.x+Math.cos(a)*(1.2+phase*4),.5+phase*3,falls.z+2+Math.sin(a)*1.5+phase*2);
  puff.scale.set(4+phase*4,2+phase*3,1);
  puff.material.opacity=Math.sin(phase*Math.PI)*(lightTarget.phase==='night'?.07:.15);
 });
 mistMaterial.opacity=THREE.MathUtils.damp(mistMaterial.opacity,mistTarget,1.4,dt);
 lakeMist.visible=mistMaterial.opacity>.002;
 if(lakeMist.visible)lakeMist.children.forEach((sprite,i)=>{
  sprite.position.x=sprite.userData.originX+Math.sin(t*.11+i*.8)*2.2;
 });
 const seconds=meteorMinute+(performance.now()-scenerySampleTime)/1000;
 const offset=meteorSeed%47;
 const slot=Math.floor((seconds-offset)/145);
 const age=seconds-offset-slot*145;
 meteor.visible=meteorNight&&age<1.75;
 if(!meteor.visible)return;
 const direction=(meteorSeed%360+slot*89)*Math.PI/180;
 const radius=173,travel=age*24;
 const x=Math.cos(direction)*radius+Math.sin(direction)*travel;
 const z=Math.sin(direction)*radius-Math.cos(direction)*travel;
 const y=120-age*18;
 meteorVertices.set([x,y,z,x-Math.sin(direction)*12,y+9,z+Math.cos(direction)*12]);
 meteorGeometry.attributes.position.needsUpdate=true;
 meteor.material.opacity=.9*Math.sin(Math.PI*age/1.75);
}
function syncEnvironment(now=new Date()){
 const {date,minutes}=koreanClock(now);
 environmentMinutes=minutes;
 const night=backgroundMode==='night'||(backgroundMode==='live'&&(minutes<360||minutes>=1080));
 const phase=night?'night':'day';
 const live=backgroundMode==='live';
 const seed=scenerySeed(date);
 const dawn=live*THREE.MathUtils.smoothstep(minutes,300,340)*(1-THREE.MathUtils.smoothstep(minutes,420,465));
 // A calm 24-minute weather cycle. The calendar seed keeps it synchronized
 // between visitors while each shower eases in and out instead of switching.
 const seconds=minutes*60+now.getUTCSeconds(),weatherCycle=(seconds+seed%1200)%1440;
 const shower=live*THREE.MathUtils.smoothstep(weatherCycle,360,470)*(1-THREE.MathUtils.smoothstep(weatherCycle,720,860));
 const clearing=live*THREE.MathUtils.smoothstep(weatherCycle,760,900)*(1-THREE.MathUtils.smoothstep(weatherCycle,1120,1360));
 weather.rainTarget=shower*.72;
 weather.fogTarget=THREE.MathUtils.clamp(dawn*.72+shower*.16,0,1);
 weather.afterRainTarget=clearing*.82;
 mistTarget=THREE.MathUtils.clamp(dawn*.30+shower*.07,0,.34);
 const nightDate=minutes<360?koreanClock(new Date(now.getTime()-86400000)).date:date;
 meteorSeed=scenerySeed(nightDate);
 meteorNight=live&&night&&meteorSeed%7<3;
 meteorMinute=minutes*60+now.getUTCSeconds()+now.getUTCMilliseconds()/1000;
 scenerySampleTime=performance.now();
 const dusk=live&&minutes>=1050&&minutes<1095;
 const from=dusk?(minutes<1070?'day':'sunset'):phase;
 const to=dusk?(minutes<1070?'sunset':'night'):phase;
 const blend=dusk?THREE.MathUtils.smoothstep(minutes,minutes<1070?1050:1070,minutes<1070?1070:1095):0;
 const start=skyStyles[from],end=skyStyles[to];
 const progress=backgroundMode==='day'?.5:THREE.MathUtils.clamp((minutes-360)/720,0,1);
 Object.assign(lightTarget,{phase,
  direct:THREE.MathUtils.lerp(start.direct,end.direct,blend),
  ambient:THREE.MathUtils.lerp(start.ambient,end.ambient,blend),
  fog:night?.0021:.0018,
  starlight:dusk?THREE.MathUtils.smoothstep(minutes,1075,1095):Number(night),
  cloudCount:shower>.08?11:3
 });
 const color=new THREE.Color();
 for(const key of ['top','horizon','cloud','sun','hemi']){
  lightTarget[key].setHex(start[key]).lerp(color.setHex(end[key]),blend);
 }
 const solarHeight=dusk?THREE.MathUtils.lerp(9,-4,THREE.MathUtils.smoothstep(minutes,1050,1080)):
  night?45:Math.max(9,Math.sin(progress*Math.PI)*68);
 lightTarget.light.set((progress-.5)*165,solarHeight,-95);
}
function animateEnvironment(dt,t){
 const target=lightTarget,k=1-Math.exp(-dt*1.1);
 animateWeather(dt,t);
 skyUniforms.topColor.value.lerp(target.top,k);skyUniforms.horizonColor.value.lerp(target.horizon,k);scene.fog.color.lerp(target.horizon,k);scene.fog.density=THREE.MathUtils.lerp(scene.fog.density,target.fog+weather.fog*.00145+weather.rain*.00062,k);skyUniforms.cloudColor.value.lerp(target.cloud,k);skyUniforms.sunColor.value.lerp(target.sun,k);
 skyUniforms.nightMix.value=THREE.MathUtils.lerp(skyUniforms.nightMix.value,target.starlight,k);
 sun.color.lerp(target.sun,k);hemi.color.lerp(target.hemi,k);sun.intensity=THREE.MathUtils.lerp(sun.intensity,target.direct*(1-weather.rain*.48),k);hemi.intensity=THREE.MathUtils.lerp(hemi.intensity,target.ambient*(1-weather.rain*.16),k);sun.target.position.set(player.position.x,0,player.position.z);sun.position.set(player.position.x+target.light.x*.42,Math.max(24,target.light.y*.7),player.position.z+target.light.z*.42);
 skySun.position.lerp(target.light,k);skyUniforms.sunDirection.value.copy(skySun.position).normalize();skySun.visible=target.phase!=='night'&&target.cloudCount<8;
 stars.material.opacity=THREE.MathUtils.lerp(stars.material.opacity,target.starlight*(target.cloudCount>=8?.27:.9),k);
 stars.visible=target.starlight>0;
 skyMoon.visible=target.phase==='night'&&target.cloudCount<8;
 animateFireflies(t);
 animateRareScenery(dt,t);

 }
finishReflectiveWater(waterMat,waterBodies,{riverStart,riverEnd});
syncEnvironment();
setInterval(syncEnvironment,30000);
$('qualityToggle').onclick=()=>{const on=$('qualityToggle').getAttribute('aria-checked')!=='true';$('qualityToggle').setAttribute('aria-checked',on);renderer.setPixelRatio(on?1:Math.min(devicePixelRatio,1.7));lightGraphics=on;atmosphere.cloudQuality.value=on?0:1;waterfallMist.visible=!on;shoreReeds.count=on?Math.floor(shoreReedCount*.45):shoreReedCount;grassField.update(camera.position.x,camera.position.z,on);forest.update(camera.position.x,camera.position.z,on);discoveries.update(camera.position.x,camera.position.z,on);renderer.shadowMap.enabled=!on;scene.traverse(o=>{if(o.isMesh){const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.needsUpdate=true);}});};
// Gentle procedural ambience: filtered wind and sparse, quiet birds. Starts only after a tap.
let audioCtx,audioGain,audioOn=false,birdTimer,pianoTimer;
const ambience={};
function noiseLayer({frequency,type='lowpass',duration,texture,pan=0}){
 const buffer=audioCtx.createBuffer(2,audioCtx.sampleRate*duration,audioCtx.sampleRate);
 for(let channel=0;channel<2;channel++){
  const samples=buffer.getChannelData(channel);
  let pink=0,brown=0;
  for(let i=0;i<samples.length;i++){
   const time=i/samples.length*Math.PI*2;
   const white=Math.random()*2-1;
   pink=.78*pink+.22*white;
   brown=.987*brown+.013*white;
   const swell=.72+.15*Math.sin(time*3+channel)+.11*Math.cos(time*7+channel*.5);
   const grains=.68+.22*Math.sin(time*17+channel)*Math.sin(time*29);
   const signal=texture==='wind'?brown*3+pink*.15:texture==='leaves'?pink*.65+white*.21:texture==='rain'?white*.46+pink*.38:pink*.8+white*.4;
   samples[i]=signal*swell*(texture==='leaves'?grains:1);
  }
 }
 const source=audioCtx.createBufferSource();
 const filter=audioCtx.createBiquadFilter();
 const gain=audioCtx.createGain();
 source.buffer=buffer;
 source.loop=true;
 filter.type=type;
 filter.frequency.value=frequency;
 gain.gain.value=0;
 source.connect(filter).connect(gain);
 const stereo=audioCtx.createStereoPanner?.();
 if(stereo){stereo.pan.value=pan;gain.connect(stereo).connect(audioGain);}
 else gain.connect(audioGain);
 source.start();
 return {gain,stereo};
}
let lastAudioUpdate=-Infinity;
function updateLocationAudio(){
 if(!audioOn||!audioCtx||audioCtx.currentTime-lastAudioUpdate<.15)return;
 const now=audioCtx.currentTime;
 lastAudioUpdate=now;
 const {x,z}=player.position;
 const clamp01=value=>THREE.MathUtils.clamp(value,0,1);
 const waterfall=clamp01(1-Math.hypot(x-falls.x,z-falls.z)/46);
 const shore=clamp01(1-(nearestWaterDistance(x,z)-1)/.7);
 const river=clamp01(1-(riverDistance(x,z)-3)/12);
 const forest=groves.reduce((value,g)=>Math.max(value,clamp01(1-Math.hypot(x-g.x,z-g.z)/19)),0);
 const night=lightTarget.phase==='night';
 const gust=.79+.15*Math.sin(now*.43)+.06*Math.sin(now*1.7);
 ambience.wind.gain.gain.setTargetAtTime((night?.47:.71)*gust*(1-forest*.35),now,.55);
 ambience.leaves.gain.gain.setTargetAtTime((.08+forest*.40)*gust,now,.45);
 ambience.stream.gain.gain.setTargetAtTime(Math.max(shore*.37,river*.46)*(1-waterfall*.5),now,.45);
 ambience.falls.gain.gain.setTargetAtTime(waterfall**1.55*.65,now,.45);
 ambience.rain.gain.gain.setTargetAtTime(weather.rain*(.38+forest*.16),now,.38);
 if(ambience.falls.stereo){
  const dx=falls.x-x,dz=falls.z-z;
  const pan=(dx*Math.cos(angle)-dz*Math.sin(angle))/Math.max(5,Math.hypot(dx,dz));
  ambience.falls.stereo.pan.setTargetAtTime(pan*.75,now,.35);
 }
}
async function toggleAudio(){
 try{
  if(!audioCtx){
   audioCtx=new (window.AudioContext||window.webkitAudioContext)();
   audioGain=audioCtx.createGain();
   audioGain.gain.value=0;
   audioGain.connect(audioCtx.destination);
   ambience.wind=noiseLayer({frequency:330,duration:13,texture:'wind'});
   ambience.leaves=noiseLayer({frequency:1700,type:'bandpass',duration:11,texture:'leaves',pan:-.20});
   ambience.stream=noiseLayer({frequency:1150,type:'bandpass',duration:17,texture:'water',pan:.14});
   ambience.falls=noiseLayer({frequency:1550,duration:19,texture:'water'});
   ambience.rain=noiseLayer({frequency:4200,type:'lowpass',duration:14,texture:'rain',pan:-.06});
  }
  await audioCtx.resume();
  audioOn=!audioOn;
  audioGain.gain.setTargetAtTime(audioOn?.32:0,audioCtx.currentTime,.35);
  if(audioOn){lastAudioUpdate=-Infinity;updateLocationAudio();chirp();scheduleNatureCalls();schedulePiano();}
  else{clearTimeout(birdTimer);clearTimeout(pianoTimer);}
  $('audioToggle').setAttribute('aria-checked',audioOn);
  $('sound').setAttribute('aria-label',audioOn?'자연의 소리 끄기':'자연의 소리 켜기');
  $('soundwaves').setAttribute('d',audioOn?'M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14':'m16 9 5 6m0-6-5 6');
  toast(audioOn?'초원의 자연 소리를 켰어요.':'자연의 소리를 껐어요.');
 }catch{toast('이 브라우저에서는 소리를 재생할 수 없어요.');}
}
function toneAt(time,frequency,duration,volume,type='sine'){
 const tone=audioCtx.createOscillator(),envelope=audioCtx.createGain();
 tone.type=type;tone.frequency.value=frequency;
 envelope.gain.setValueAtTime(.0001,time);
 envelope.gain.exponentialRampToValueAtTime(volume,time+.018);
 envelope.gain.exponentialRampToValueAtTime(.0001,time+duration);
 tone.connect(envelope).connect(audioGain);
 tone.start(time);tone.stop(time+duration+.03);
}
function natureCall(time,start,end,duration,volume,pan=0,type='sine'){
 const voice=audioCtx.createOscillator();
 const envelope=audioCtx.createGain();
 voice.type=type;
 voice.frequency.value=start;
 voice.frequency.setValueAtTime?.(start,time);
 voice.frequency.exponentialRampToValueAtTime?.(end,time+duration*.8);
 envelope.gain.setValueAtTime(.0001,time);
 envelope.gain.exponentialRampToValueAtTime(volume,time+duration*.21);
 envelope.gain.exponentialRampToValueAtTime(.0001,time+duration);
 voice.connect(envelope);
 const stereo=audioCtx.createStereoPanner?.();
 if(stereo){stereo.pan.value=pan;envelope.connect(stereo).connect(audioGain);}
 else envelope.connect(audioGain);
 voice.start(time);
 voice.stop(time+duration+.02);
}
function chirp(){
 if(!audioOn||document.hidden)return;
 const time=audioCtx.currentTime+.025;
 const pan=(Math.random()-.5)*1.4;
 const {x,z}=player.position;
 if(weather.rain>.38){
  // Birds grow quiet in rain; soft frogs and a low distant call take over.
  if(nearestWaterDistance(x,z)<2.2||riverDistance(x,z)<10){
   for(let i=0;i<3;i++)natureCall(time+i*.31,155+i*13,112,.22,.022+weather.rain*.012,-pan,'triangle');
  }
  return;
 }
 if(lightTarget.phase==='night'){
  const pitch=3900+Math.random()*750;
  for(let i=0;i<4;i++)natureCall(time+i*.115,pitch,pitch*.96,.061,.012,pan);
  if(nearestWaterDistance(x,z)<1.8||riverDistance(x,z)<8){
   for(let i=0;i<3;i++)natureCall(time+.7+i*.27,180+i*11,122,.19,.029,-pan,'triangle');
  }
  return;
 }
 const forest=groves.some(g=>Math.hypot(x-g.x,z-g.z)<17);
 const pitch=1500+Math.random()*1500;
 const count=forest?3+Math.floor(Math.random()*3):2;
 for(let i=0;i<count;i++){
  const start=pitch*(1+(i%3)*.14);
  const end=start*(i%2?.76:1.45);
  natureCall(time+i*.19,start,end,.11+Math.random()*.10,forest?.052:.025,pan);
  natureCall(time+i*.19,start*1.96,end*1.96,.095,forest?.008:.003,pan);
 }
}
function scheduleNatureCalls(){
 if(!audioOn)return;
 const night=lightTarget.phase==='night';
 birdTimer=setTimeout(()=>{
  chirp();
  scheduleNatureCalls();
 },(night?2600:3800)+Math.random()*(night?3600:7600));
}
function schedulePiano(){
 clearTimeout(pianoTimer);
 if(!audioOn)return;
 pianoTimer=setTimeout(()=>{
  if(audioOn&&playing&&!document.hidden)playPiano();
  schedulePiano();
 },150000+Math.random()*210000);
}
function playPiano(){
 const phrase=[
  [48,55,64,67,71],[45,52,64,60,67],[41,48,60,65,69],[43,50,62,67,71],
  [48,55,72,71,67],[45,52,69,67,64],[41,48,65,64,60],[48,55,64,67,72]
 ];
 const start=audioCtx.currentTime+.06;
 phrase.forEach((bar,i)=>{
  const at=start+i*3.2;
  bar.forEach((note,j)=>{
   const time=at+[0,.42,.75,1.55,2.38][j],hz=440*2**((note-69)/12);
   const volume=j<2?.037:.046,duration=j===4?2.2:1.8;
   toneAt(time,hz,duration,volume);
   toneAt(time,hz*2.002,duration*.48,volume*.18);
   toneAt(time,hz*3.01,duration*.21,volume*.075);
  });
 });
}
$('sound').onclick=toggleAudio;$('audioToggle').onclick=toggleAudio;
const movementCodes=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'];window.addEventListener('keydown',e=>{if(!playing||$('settingsDialog').open||$('birthDialog').open)return;if(movementCodes.includes(e.code)){e.preventDefault();registerActivity();keys.add(e.code);}});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();});
// One background finger or mouse drag rotates freely; two fingers change distance.
const viewPointers=new Map();let pinchDistance=0;
function registerActivity(){idleElapsed=0;overview=false;}
function updateIdleView(dt,blocked){
 if(!playing||blocked||document.hidden||autoTarget||keys.size||viewPointers.size){registerActivity();return;}
 idleElapsed=Math.min(idleElapsed+dt,idleViewDelay);
 overview=idleElapsed>=idleViewDelay;
}
document.addEventListener('pointerdown',registerActivity,{passive:true});
document.addEventListener('keydown',registerActivity);
document.addEventListener('wheel',registerActivity,{passive:true});
$('settingsDialog').addEventListener('close',registerActivity);
window.addEventListener('focus',registerActivity);
function closeOverview(){registerActivity();}
function resetView(){angle=0;viewPitch=.64;viewZoom=1;closeOverview();viewPointers.clear();pinchDistance=0;}
function zoomView(factor){lastGroundTap=null;viewZoom=THREE.MathUtils.clamp(viewZoom*factor,.5,2.1);closeOverview();}
function pointerGap(){const p=[...viewPointers.values()];return p.length>=2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;}
renderer.domElement.addEventListener('pointerdown',e=>{
 if(!playing||$('settingsDialog').open||$('birthDialog').open||(e.button!==undefined&&e.button!==0))return;
 e.preventDefault();registerActivity();const point=groundPointAt(e.clientX,e.clientY);viewPointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,downAt:performance.now(),tap:true,point});if(viewPointers.size>1){lastGroundTap=null;viewPointers.forEach(p=>p.tap=false);}renderer.domElement.setPointerCapture(e.pointerId);pinchDistance=pointerGap();
});
renderer.domElement.addEventListener('pointermove',e=>{
 const previous=viewPointers.get(e.pointerId);if(!previous)return;e.preventDefault();
 if(Math.hypot(e.clientX-previous.startX,e.clientY-previous.startY)>8){previous.tap=false;lastGroundTap=null;}
 const dx=e.clientX-previous.x,dy=e.clientY-previous.y;previous.x=e.clientX;previous.y=e.clientY;closeOverview();
 if(viewPointers.size>1){const gap=pointerGap();if(gap>12&&pinchDistance>12)zoomView(pinchDistance/gap);pinchDistance=gap;}
 else if(!previous.tap){
  angle-=dx*.006*(invertHorizontal?-1:1);
  viewPitch=THREE.MathUtils.clamp(viewPitch-dy*.005*(invertVertical?-1:1),-.75,1.25);
 }
});
function endViewPointer(e){const p=viewPointers.get(e.pointerId),tap=p&&p.tap&&viewPointers.size===1&&performance.now()-p.downAt<750&&Math.hypot(e.clientX-p.startX,e.clientY-p.startY)<=8;viewPointers.delete(e.pointerId);pinchDistance=pointerGap();if(tap)acceptGroundTap(p);}
function cancelViewPointer(e){if(viewPointers.delete(e.pointerId))lastGroundTap=null;pinchDistance=pointerGap();}
renderer.domElement.addEventListener('pointerup',endViewPointer);renderer.domElement.addEventListener('pointercancel',cancelViewPointer);renderer.domElement.addEventListener('lostpointercapture',cancelViewPointer);
renderer.domElement.addEventListener('wheel',e=>{if(!playing||$('settingsDialog').open||$('birthDialog').open)return;e.preventDefault();zoomView(Math.exp(THREE.MathUtils.clamp(e.deltaY,-160,160)*.0018));},{passive:false});
window.addEventListener('blur',()=>{lastGroundTap=null;keys.clear();viewPointers.clear();pinchDistance=0;});

function shoreRadius(water, angle){
 const segments=water===lake?96:water===pond?24:30;
 const irregular=water===lake?.045:water===pond?.12:.06;
 const step=2*Math.PI/segments;
 const start=Math.floor(angle/step)*step;
 const radius=a=>1+(Math.sin(a*3+.5)+Math.cos(a*5))*.5*irregular;
 const r0=radius(start),r1=radius(start+step),offset=angle-start;
 return r0*r1*Math.sin(step)/(r1*Math.sin(step-offset)+r0*Math.sin(offset));
}
function outsideWater(water,x,z){
 const dx=(x-water.x)/(water===pond?5.55:water.rx),dz=(z-water.z)/water.rz;
 return Math.hypot(dx,dz)>shoreRadius(water,Math.atan2(-dz,dx))+.12/Math.min(water.rx,water.rz);
}
function canWalk(x,z){return Math.abs(x)<worldLimit&&Math.abs(z)<worldLimit&&waterIndex.at(x,z).every(w=>outsideWater(w,x,z))&&(riverDistance(x,z)>4.4||onBridge(x,z))&&cliffDistance(x,z)>1.1&&!solidIndex.at(x,z).some(o=>(x-o.x)**2+(z-o.z)**2<o.radius**2);}
// Search dry-land routes to sampled shores of both water bodies, rather than one fixed spot.
let waterNavigation=null;
function createWaterNavigation(reach=.65){
 const step=1.25,halfGrid=Math.ceil(worldLimit/step)-1,size=halfGrid*2+1,origin=-halfGrid*step,world=id=>new THREE.Vector3(origin+(id%size)*step,0,origin+Math.floor(id/size)*step);
 const gridIndex=v=>Math.max(0,Math.min(size-1,Math.round((v-origin)/step)));
 const shores=[];
 for(const water of waterBodies){
  const count=water===lake?240:96;
  for(let i=0;i<count;i++){
   const angle=i/count*Math.PI*2,rx=water===pond?5.55:water.rx;
   const dx=Math.cos(angle)*rx,dz=-Math.sin(angle)*water.rz;
   const radius=shoreRadius(water,angle),length=Math.hypot(dx,dz);
   const contact=new THREE.Vector3(water.x+dx*(radius-.16/length),.035,water.z+dz*(radius-.16/length));
   const point=new THREE.Vector3(water.x+dx*(radius+reach/length),0,water.z+dz*(radius+reach/length));
   if(canWalk(point.x,point.z))shores.push({point,water,contact});
  }
 }
 const links=new Map();
 for(const shore of shores){const cx=gridIndex(shore.point.x),cz=gridIndex(shore.point.z);
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const x=cx+dx,z=cz+dz;if(x<0||z<0||x>=size||z>=size)continue;const id=z*size+x,p=world(id);if(!lineWalk(p,shore.point))continue;if(!links.has(id))links.set(id,[]);links.get(id).push({shore,cost:p.distanceTo(shore.point)});}
 }
 return {step,size,world,gridIndex,shores,links,walkable:new Uint8Array(size*size),edges:new Uint8Array(size*size*8)};
}
let drinkNavigation=null;
function waterRoute(sx,sz,reach=.65){
 const from=new THREE.Vector3(sx,0,sz);if(!canWalk(sx,sz))return [];
 if(drinkNavigation?.reach!==reach)drinkNavigation={reach,nav:createWaterNavigation(reach)};
 const {step,size,world,gridIndex,shores,links,walkable,edges}=drinkNavigation.nav;
 const candidates=shores.map(shore=>({shore,distance:from.distanceTo(shore.point)})).sort((a,b)=>a.distance-b.distance);
 let best=null,bestCost=Infinity,bestNode=-1;
 for(const candidate of candidates){if(lineWalk(from,candidate.shore.point)){best=candidate.shore;bestCost=candidate.distance;break;}}
 const result=points=>{points.water=best.water;points.contact=best.contact;return points;};
 // A visible nearest shore already gives the shortest possible route.
 if(best===candidates[0]?.shore)return result([best.point.clone()]);
 const distances=new Float64Array(size*size).fill(Infinity),parents=new Int32Array(size*size).fill(-1),heap=[];
 function push(id,cost){let i=heap.length;heap.push({id,cost});while(i>0){const p=(i-1)>>1;if(heap[p].cost<=cost)break;heap[i]=heap[p];i=p;}heap[i]={id,cost};}
 function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let k=i*2+1;if(k+1<heap.length&&heap[k+1].cost<heap[k].cost)k++;if(heap[k].cost>=last.cost)break;heap[i]=heap[k];i=k;}heap[i]=last;}return first;}
 const cx=gridIndex(sx),cz=gridIndex(sz);
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const x=cx+dx,z=cz+dz;if(x<0||z<0||x>=size||z>=size)continue;const id=z*size+x,p=world(id);if(lineWalk(from,p)){const cost=from.distanceTo(p);distances[id]=cost;parents[id]=id;push(id,cost);}}
 const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
 while(heap.length){const {id,cost}=pop();if(cost>distances[id])continue;if(cost>=bestCost)break;
  for(const link of links.get(id)||[]){if(cost+link.cost<bestCost){best=link.shore;bestCost=cost+link.cost;bestNode=id;}}
  const x=id%size,z=Math.floor(id/size);
  for(let k=0;k<directions.length;k++){const [dx,dz]=directions[k],xx=x+dx,zz=z+dz;if(xx<0||zz<0||xx>=size||zz>=size)continue;
   const next=zz*size+xx,nextCost=cost+step*(dx&&dz?Math.SQRT2:1);if(nextCost>=Math.min(distances[next],bestCost))continue;
   if(!walkable[next]){const p=world(next);walkable[next]=canWalk(p.x,p.z)?2:1;}if(walkable[next]===1)continue;
   const edge=id*8+k;if(!edges[edge])edges[edge]=lineWalk(world(id),world(next))?2:1;if(edges[edge]===1)continue;
   distances[next]=nextCost;parents[next]=id;push(next,nextCost);
  }
 }
 if(!best)return [];
 const points=[best.point.clone()];
 if(bestNode!==-1){let at=bestNode;while(true){points.push(world(at));if(parents[at]===at)break;at=parents[at];}points.reverse();}
 const smooth=[];let start=from,i=0;
 while(i<points.length){let far=-1;for(let j=i;j<points.length;j++){if(lineWalk(start,points[j]))far=j;else break;}if(far<0)return [];smooth.push(points[far]);start=points[far];i=far+1;}
 return result(smooth);
}
function walkToWater(){route=waterRoute(player.position.x,player.position.z,Math.max(.35,player.scale.x*(player.userData.type==='elephant'?.90:.62)));autoTarget=route.shift()||null;if(!autoTarget){setMode('walk');toast('지금은 물가로 가는 길을 찾지 못했어요. 조금 옮겨서 다시 시도해 주세요.');return false;}setMode('toWater');return true;}
const groundRaycaster=new THREE.Raycaster(),groundPointer=new THREE.Vector2();
function groundPointAt(clientX,clientY){
 const r=renderer.domElement.getBoundingClientRect();if(!r.width||!r.height)return null;
 groundPointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);camera.updateMatrixWorld(true);terrainMesh.updateWorldMatrix(true,false);groundRaycaster.setFromCamera(groundPointer,camera);
 return groundRaycaster.intersectObject(terrainMesh,false)[0]?.point.clone()||null;
}
function groundRoute(sx,sz,tx,tz){
 const from=new THREE.Vector3(sx,0,sz),target=new THREE.Vector3(tx,0,tz);
 if(!canWalk(sx,sz)||!canWalk(tx,tz))return [];
 if(lineWalk(from,target))return [target];
 const nav=waterNavigation??=createWaterNavigation(),{step,size,world,gridIndex}=nav,goalLinks=new Map();
 const goalsX=gridIndex(tx),goalsZ=gridIndex(tz);
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const x=goalsX+dx,z=goalsZ+dz;if(x<0||z<0||x>=size||z>=size)continue;const id=z*size+x,p=world(id);if(lineWalk(p,target))goalLinks.set(id,p.distanceTo(target));}
 if(!goalLinks.size)return [];
 const costs=new Float64Array(size*size).fill(Infinity),parents=new Int32Array(size*size).fill(-1),heap=[];
 function push(id,cost){const entry={id,cost,priority:cost+world(id).distanceTo(target)};let i=heap.length;heap.push(entry);while(i>0){const p=(i-1)>>1;if(heap[p].priority<=entry.priority)break;heap[i]=heap[p];i=p;}heap[i]=entry;}
 function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let k=i*2+1;if(k+1<heap.length&&heap[k+1].priority<heap[k].priority)k++;if(heap[k].priority>=last.priority)break;heap[i]=heap[k];i=k;}heap[i]=last;}return first;}
 const sxCell=gridIndex(sx),szCell=gridIndex(sz);
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const x=sxCell+dx,z=szCell+dz;if(x<0||z<0||x>=size||z>=size)continue;const id=z*size+x,p=world(id);if(lineWalk(from,p)){const cost=from.distanceTo(p);costs[id]=cost;parents[id]=id;push(id,cost);}}
 const directions=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];let bestNode=-1,bestCost=Infinity;
 while(heap.length){const {id,cost,priority}=pop();if(cost>costs[id])continue;if(priority>=bestCost)break;
  if(goalLinks.has(id)&&cost+goalLinks.get(id)<bestCost){bestCost=cost+goalLinks.get(id);bestNode=id;}
  const x=id%size,z=Math.floor(id/size);
  for(let k=0;k<directions.length;k++){const [dx,dz]=directions[k],xx=x+dx,zz=z+dz;if(xx<0||zz<0||xx>=size||zz>=size)continue;const next=zz*size+xx,nextCost=cost+step*(dx&&dz?Math.SQRT2:1);if(nextCost>=costs[next]||nextCost+world(next).distanceTo(target)>=bestCost)continue;
   if(!nav.walkable[next]){const p=world(next);nav.walkable[next]=canWalk(p.x,p.z)?2:1;}if(nav.walkable[next]===1)continue;
   const edge=id*8+k;if(!nav.edges[edge])nav.edges[edge]=lineWalk(world(id),world(next))?2:1;if(nav.edges[edge]===1)continue;
   costs[next]=nextCost;parents[next]=id;push(next,nextCost);
  }
 }
 if(bestNode<0)return [];
 const points=[target];let at=bestNode;while(true){points.push(world(at));if(parents[at]===at)break;at=parents[at];}points.reverse();
 const result=[];let previous=from,i=0;
 while(i<points.length){let far=-1;for(let j=i;j<points.length;j++){if(lineWalk(previous,points[j]))far=j;else break;}if(far<0)return [];result.push(points[far]);previous=points[far];i=far+1;}
 return result;
}
function acceptGroundTap(tap){
 const now=performance.now(),previous=lastGroundTap,run=previous&&now-previous.at<=360&&Math.hypot(tap.startX-previous.x,tap.startY-previous.y)<=24;
 if(run){lastGroundTap=null;moveToGroundPoint(previous.point,true);return;}
 if(moveToGroundPoint(tap.point))lastGroundTap={at:now,x:tap.startX,y:tap.startY,point:tap.point.clone()};
 else lastGroundTap=null;
}
function moveToGroundPoint(point,running=false){
 if(!point||!playing||$('settingsDialog').open||$('birthDialog').open)return false;
 const nextRoute=groundRoute(player.position.x,player.position.z,point.x,point.z);
 if(!nextRoute.length){toast('걸어갈 수 있는 풀밭을 터치해 주세요.');return false;}
 registerActivity();keys.clear();route=nextRoute;route.destination=point.clone();route.running=running;autoTarget=route.shift();setMode('walk');
 moveMarker.position.set(point.x,height(point.x,point.z)+.075,point.z);moveMarker.material.color.setHex(running?0xffcb89:0xfff4d5);moveMarker.visible=true;$('moveHint').style.opacity=0;return true;
}
function lineWalk(a,b){const distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(distance/.2));for(let i=0;i<=steps;i++){const f=i/steps;if(!canWalk(a.x+(b.x-a.x)*f,a.z+(b.z-a.z)*f))return false;}return true;}
const clock=new THREE.Clock();let total=0;const desiredCam=new THREE.Vector3(),lookTarget=new THREE.Vector3(),currentLook=new THREE.Vector3(-3,1,0),toProject=new THREE.Vector3();
function updateGait(a,dt,moving){
 const d=a.userData,travel=Math.min(.25,a.position.distanceTo(d.lastPosition));d.lastPosition.copy(a.position);
 d.runBlend=THREE.MathUtils.damp(d.runBlend||0,moving&&d.running?1:0,7,dt);
 if(moving)d.stridePhase+=travel/(1+d.runBlend*.22)*(d.type==='giraffe'?4.5:d.type==='rabbit'?9:d.type==='squirrel'?13:6.2);
 d.walk=THREE.MathUtils.damp(d.walk,moving?1:0,7,dt);
}
// Two-bone leg solver keeps the supporting feet on the local terrain.
function poseLeg(a,leg,zOffset,lift,lateral=0){
 const d=a.userData,l=leg.userData,co=Math.cos(a.rotation.y),si=Math.sin(a.rotation.y),px=l.baseX+lateral,pz=l.baseZ+zOffset;
 const wx=(px*co+pz*si)*a.scale.x,wz=(-px*si+pz*co)*a.scale.z;
 const terrainDelta=(height(a.position.x+wx,a.position.z+wz)-a.position.y)/a.scale.y;
 const dy=terrainDelta+l.sole+lift-d.visual.position.y-leg.position.y,dz=zOffset;
 const down=Math.hypot(dy,lateral),reach=Math.min(Math.hypot(down,dz),l.upper+l.lower-.001);
 const bend=l.front?1:-1,knee=bend*Math.acos(THREE.MathUtils.clamp((reach*reach-l.upper*l.upper-l.lower*l.lower)/(2*l.upper*l.lower),-1,1));
 const hip=Math.atan2(-dz,down)-Math.atan2(l.lower*Math.sin(knee),l.upper+l.lower*Math.cos(knee));
 leg.rotation.x=hip;leg.rotation.z=Math.atan2(lateral,-dy);l.knee.rotation.x=knee;l.foot.rotation.x=-hip-knee;l.foot.rotation.z=-leg.rotation.z;
}
function faceMotion(d,t,feeding,drink){
 const chew=Math.sin(t*(drink?4.5:8.5)+d.phase),blinkTime=(t+d.phase)%5.6;
 const blink=blinkTime<.17?1-.93*Math.sin(blinkTime/.17*Math.PI):1;
 d.eyes.forEach(eye=>eye.scale.y=blink);
 d.ears.forEach((ear,i)=>{ear.rotation.x=Math.sin(t*1.3+d.phase+i)*.065+feeding*.1;ear.rotation.y=Math.sin(t*.7+d.phase+i)*.07;});
 d.jaw.rotation.x=feeding*(.035+(chew+1)*.045);d.jaw.position.x=feeding*chew*.014;
 d.nibble.visible=!drink&&feeding>.45;d.nibble.scale.setScalar(.86+chew*.12);
}
function animateAnimal(a,dt,t,moving=false,rest=false,drink=false,graze=false){
 if(isSmall(a)||newAnimals[a.userData.type]){animateSmallPlayer(a,dt,t,moving,rest,drink,graze);return;}
 a.position.y=height(a.position.x,a.position.z);const d=a.userData,giraffe=d.type==='giraffe';updateGait(a,dt,moving);
 d.rest=THREE.MathUtils.damp(d.rest,rest?1:0,4,dt);d.graze=THREE.MathUtils.damp(d.graze,graze||drink?1:0,4,dt);
 d.visual.position.y=-d.rest*(giraffe?.82:.48)-d.graze*(giraffe?.12:.23)+Math.sin(t*1.6+d.phase)*.008+d.walk*Math.sin(d.stridePhase*2)*.018;
 d.body.scale.y=d.bodyScale[1]*(1+Math.sin(t*1.8+d.phase)*.012);
 d.legs.forEach((leg,i)=>{const offset=[0,Math.PI,Math.PI*.55,Math.PI*1.55][i],phase=THREE.MathUtils.euclideanModulo(d.stridePhase+offset,Math.PI*2),swing=phase<Math.PI,step=(swing?phase/Math.PI-.5:1.5-phase/Math.PI)*(giraffe?.68:.48)*d.walk*(1+d.runBlend*.22);
  const lift=(swing?Math.sin(phase):0)*d.walk*(giraffe?.16:.12)*(1+d.runBlend*.52),spread=giraffe?leg.userData.side*d.graze*(leg.userData.front?.07:.025):0;
  poseLeg(a,leg,step+d.rest*(leg.userData.front?.25:-.25),lift,spread);
 });
 // Bend the neck toward the grass, while keeping the face and jaw independent.
 const targetY=.58-(d.neck.position.y+d.visual.position.y),targetZ=giraffe?1.35:.40,L1=d.neckL1,L2=d.neckL2;
 const reach=Math.min(Math.hypot(targetY,targetZ),L1+L2-.002),bend=Math.acos(THREE.MathUtils.clamp((reach*reach-L1*L1-L2*L2)/(2*L1*L2),-1,1));
 const upper=Math.atan2(targetZ,targetY)-Math.atan2(L2*Math.sin(bend),L1+L2*Math.cos(bend));
 const idle=.19+Math.sin(t*.7+d.phase)*.025+d.walk*Math.sin(d.stridePhase)*.025;
 d.neck.rotation.x=THREE.MathUtils.damp(d.neck.rotation.x,THREE.MathUtils.lerp(idle,upper,d.graze),5,dt);
 d.neckLower.rotation.x=THREE.MathUtils.damp(d.neckLower.rotation.x,THREE.MathUtils.lerp(-.08,bend,d.graze),5,dt);
 d.head.rotation.x=THREE.MathUtils.lerp(.025,.58,d.graze)-d.neck.rotation.x-d.neckLower.rotation.x;
 d.head.rotation.y=(1-d.graze)*Math.sin(t*.45+d.phase)*.05;d.head.rotation.z=d.graze*Math.sin(t*4+d.phase)*.012;
 d.tail.rotation.z=Math.sin(t*1.5+d.phase)*.13+d.walk*Math.sin(d.stridePhase)*.04;
 faceMotion(d,t,d.graze,drink);
}
function animateSmallPlayer(a,dt,t,moving=false,rest=false,drink=false,graze=false){
 a.position.y=height(a.position.x,a.position.z);const d=a.userData,rabbit=d.type==='rabbit';updateGait(a,dt,moving);
 d.rest=THREE.MathUtils.damp(d.rest,rest?1:0,4,dt);d.graze=THREE.MathUtils.damp(d.graze,graze||drink?1:0,4,dt);
 const hop=rabbit?Math.max(0,Math.sin(d.stridePhase)):0,bodyLift=hop*.19*d.walk*(1+d.runBlend*.3);
 d.visual.position.y=bodyLift-d.rest*.045+(rabbit?-.025:.045)*d.graze;
 d.body.scale.y=d.bodyScale[1]*(1+Math.sin(t*2+d.phase)*.015-d.rest*.08);
 d.legs.forEach((leg,i)=>{const phase=d.stridePhase+(rabbit?(leg.userData.front?.35:-.2):(i===0||i===3?0:Math.PI));
  const swing=Math.max(0,Math.sin(phase)),step=Math.cos(phase)*(rabbit?.10:.085)*d.walk;
  const pawSnack=d.type==='squirrel'&&graze&&leg.userData.front?d.graze:0;
  poseLeg(a,leg,THREE.MathUtils.lerp(step, .12,pawSnack),bodyLift+swing*d.walk*.045+pawSnack*.30);
 });
 d.drink=THREE.MathUtils.damp(d.drink||0,drink?1:0,5,dt);
 d.head.position.y=d.headY-d.graze*(rabbit?.19:.10+d.drink*.19)-d.rest*.015;
 d.head.rotation.x=THREE.MathUtils.damp(d.head.rotation.x,d.graze*(rabbit?.62:.48)+d.rest*.10+d.walk*Math.sin(d.stridePhase)*.04,5,dt);
 d.head.rotation.y=(1-d.graze)*Math.sin(t*.6+d.phase)*.08;
 d.head.rotation.z=d.graze*Math.sin(t*5+d.phase)*.02;
 d.tail.rotation.z=Math.sin(t*1.6+d.phase)*(rabbit?.04:.10);d.tail.rotation.x=rabbit?0:Math.sin(d.stridePhase)*d.walk*.09;
 faceMotion(d,t,d.graze,drink);
}
// Restore the action overlay before the regular gait and feeding poses run.
const actionPose=new Map();
function resetActionPose(){
 for(const [bone,pose] of actionPose){
  bone.position.copy(pose.position);
  bone.quaternion.copy(pose.quaternion);
 }
 actionPose.clear();
}
function poseActionBone(bone,rx=0,ry=0,rz=0,y=0,z=0){
 if(!actionPose.has(bone))actionPose.set(bone,{position:bone.position.clone(),quaternion:bone.quaternion.clone()});
 bone.rotation.x+=rx;
 bone.rotation.y+=ry;
 bone.rotation.z+=rz;
 bone.position.y+=y;
 bone.position.z+=z;
}
function playTimedAction(d,p){
 const envelope=THREE.MathUtils.smoothstep(p,0,.19)*(1-THREE.MathUtils.smoothstep(p,.77,1));
 const cycle=p*Math.PI*2;
 const fore=d.legs.filter(leg=>leg.userData.front);
 const hind=d.legs.filter(leg=>!leg.userData.front);
 switch(d.type){
  case 'zebra': {
   const kick=Math.sin(Math.PI*THREE.MathUtils.smoothstep(p,.12,.76));
   poseActionBone(d.visual,-.15*kick);
   hind.forEach(leg=>{poseActionBone(leg,1.05*kick);poseActionBone(leg.userData.knee,-.48*kick);});
   break;
  }
  case 'gazelle': {
   const jump=Math.abs(Math.sin(cycle));
   poseActionBone(d.visual,.12*Math.sin(cycle*2),0,0,.56*jump);
   d.legs.forEach(leg=>poseActionBone(leg,(leg.userData.front?-.55:.56)*jump));
   break;
  }
  case 'elephant':
   poseActionBone(d.head,-.15*envelope);
   poseActionBone(d.trunk,(-.55+.40*Math.cos(cycle))*envelope,.65*Math.sin(cycle)*envelope,.26*Math.cos(cycle)*envelope);
   break;
  case 'hippo':
   poseActionBone(d.head,-.34*envelope);
   poseActionBone(d.jaw,.88*envelope);
   break;
  case 'rhino': {
   const scrape=Math.abs(Math.sin(cycle))*envelope;
   poseActionBone(fore[0],-.72*scrape);
   poseActionBone(fore[0].userData.knee,.58*scrape);
   poseActionBone(d.head,.19*envelope);
   break;
  }
  case 'turtle':
   poseActionBone(d.head,.22*envelope,0,0,-.10*envelope,-.24*envelope);
   d.legs.forEach(leg=>poseActionBone(leg,.32*envelope,0,-.50*leg.userData.side*envelope,.055*envelope));
   break;
  case 'guineaPig': {
   const hop=Math.sin(Math.PI*p)**2;
   poseActionBone(d.visual,.23*hop,.45*Math.sin(cycle)*hop,.20*hop,.29*hop);
   d.legs.forEach(leg=>poseActionBone(leg,.42*hop));
   break;
  }
  case 'chinchilla':
   poseActionBone(d.visual,0,0,(1.30+.32*Math.sin(cycle*3))*envelope,-.14*envelope);
   d.legs.forEach((leg,i)=>poseActionBone(leg,Math.sin(cycle*3+i)*.46*envelope));
   break;
  case 'hedgehog':
   poseActionBone(d.visual,.25*envelope,0,0,-.09*envelope);
   poseActionBone(d.head,.70*envelope,0,0,-.17*envelope,-.17*envelope);
   d.legs.forEach(leg=>poseActionBone(leg,(leg.userData.front?-.58:.58)*envelope,0,0,.09*envelope));
   break;
  case 'meerkat':
   poseActionBone(d.visual,-.84*envelope,0,0,.19*envelope);
   fore.forEach(leg=>poseActionBone(leg,1.20*envelope));
   hind.forEach(leg=>poseActionBone(leg,.74*envelope));
   poseActionBone(d.head,.57*envelope,.30*Math.sin(cycle)*envelope);
   break;
  case 'fennec':
   poseActionBone(d.head,0,.30*Math.sin(cycle)*envelope,.26*Math.cos(cycle)*envelope);
   d.ears.forEach((ear,i)=>poseActionBone(ear,.38*Math.sin(cycle*2+i*Math.PI)*envelope,.42*Math.cos(cycle+i*Math.PI)*envelope));
   break;
 }
}
function animateSpeciesAction(t,dt){
 const d=player.userData;
 const active=mode==='special';
 fruit.visible=active&&d.type==='squirrel'&&d.graze>.45;
 if(fruit.visible){
  if(fruit.parent!==d.jaw)d.jaw.add(fruit);
  fruit.position.copy(d.nibble.position);
  d.nibble.visible=false;
 }
 if(!active)return;
 const duration=speciesActions[d.type].duration;
 if(duration){
  speciesActionElapsed+=dt;
  if(speciesActionElapsed>=duration){setMode('walk');return;}
  playTimedAction(d,speciesActionElapsed/duration);
  return;
 }
 if(d.type==='rabbit'){
  poseActionBone(d.head,-.16,Math.sin(t*1.6)*.48);
  d.ears.forEach((ear,i)=>poseActionBone(ear,-.18,Math.sin(t*2.1+i)*.27));
 }
 if(d.type==='giraffe'){
  d.neck.rotation.x=THREE.MathUtils.damp(d.neck.rotation.x,.36,8,dt);
  d.neckLower.rotation.x=THREE.MathUtils.damp(d.neckLower.rotation.x,-.18,8,dt);
  d.head.rotation.x=-.28+Math.sin(t*2.4)*.045;
  faceMotion(d,t,.82,false);
 }
}
function frame(){requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.05);if(document.hidden)return;total+=dt;const t=total;natureTime.value=t;
 const blocked=$('settingsDialog').open||$('birthDialog').open;
 let moving=false;
 if(playing&&!blocked){let dx=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0),dz=(keys.has('ArrowDown')||keys.has('KeyS')?1:0)-(keys.has('ArrowUp')||keys.has('KeyW')?1:0);const mag=Math.hypot(dx,dz);
 if(mag>.12){lastGroundTap=null;if(mode!=='walk')setMode('walk');autoTarget=null;route=[];registerActivity();const cc=Math.cos(angle),ss=Math.sin(angle);const xx=dx*cc+dz*ss,zz=-dx*ss+dz*cc;dx=xx;dz=zz;const scale=Math.max(1,mag);dx/=scale;dz/=scale;$('moveHint').style.opacity=0;}
 else if(autoTarget){dx=autoTarget.x-player.position.x;dz=autoTarget.z-player.position.z;const len=Math.hypot(dx,dz);if(len<(route.water&&route.length===0?.15:.28)){autoTarget=route.shift()||null;if(!autoTarget){if(route.water){setMode('drink');player.rotation.y=Math.atan2(route.contact.x-player.position.x,route.contact.z-player.position.z);toast('시원한 물 한 모금. 오늘도 잘 지냈어요.');}else if(route.tree){
  player.rotation.y=Math.atan2(route.tree.x-player.position.x,route.tree.z-player.position.z);
  setMode('special');
  toast(speciesActions.giraffe.message);
 }else setMode('walk');}dx=dz=0;}else{dx/=len;dz/=len;}}
 else dx=dz=0;
 if(Math.hypot(dx,dz)>.05){const speed=(player.userData.type==='rabbit'?2.1:player.userData.type==='squirrel'?2.4:2.7)*((autoTarget&&route.running)||keys.has('ShiftLeft')||keys.has('ShiftRight')?1.8:1);let nx=player.position.x+dx*speed*dt,nz=player.position.z+dz*speed*dt;if(canWalk(nx,nz)){player.position.x=nx;player.position.z=nz;moving=true;}else if(canWalk(nx,player.position.z)){player.position.x=nx;moving=true;}else if(canWalk(player.position.x,nz)){player.position.z=nz;moving=true;}else if(autoTarget){if(route.water)walkToWater();else if(route.tree||!moveToGroundPoint(route.destination,route.running)){autoTarget=null;route=[];setMode('walk');}}
 let targetAngle=Math.atan2(dx,dz),delta=THREE.MathUtils.euclideanModulo(targetAngle-player.rotation.y+Math.PI,Math.PI*2)-Math.PI;player.rotation.y+=delta*Math.min(dt*8,1);}
 }
 moveMarker.visible=!!autoTarget&&!route.water&&!route.tree;moveMarker.scale.setScalar(1+Math.sin(t*3)*.09);
 updateIdleView(dt,blocked);
 player.userData.running=!!(moving&&((autoTarget&&route.running)||keys.has('ShiftLeft')||keys.has('ShiftRight')));
 resetActionPose();
 animateAnimal(player,dt,t,moving,mode==='rest',mode==='drink',mode==='graze'||(mode==='special'&&player.userData.type==='squirrel'));
 if(mode==='drink'&&route.contact){
  const d=player.userData;
  if(d.neck)d.head.position.copy(d.drinkHeadBase??=d.head.position.clone());
  else {d.head.position.x=0;d.head.position.z=d.drinkHeadZ??=d.head.position.z;}
  const tip=d.muzzleTip.getWorldPosition(new THREE.Vector3());
  const parent=d.head.parent;
  const correction=parent.worldToLocal(route.contact.clone()).sub(parent.worldToLocal(tip));
  d.head.position.addScaledVector(correction,THREE.MathUtils.smoothstep(d.graze,0,1));
 }else{
  const d=player.userData;
  if(d.drinkHeadBase)d.head.position.copy(d.drinkHeadBase);
  if(d.drinkHeadZ!==undefined){d.head.position.x=0;d.head.position.z=d.drinkHeadZ;}
 }
 animateSpeciesAction(t,dt);
 animateMeadowPeers(dt,t);
 npcs.forEach((a,i)=>animateNpcEcology(a,i,dt,t,moving));
 animateCritters(dt,t,moving);animateWaterfall(t);

 birds.forEach((b,i)=>{const a=t*.045+i*1.25;b.visible=lightTarget.phase!=='night'&&weather.rain<.72;b.position.set(player.position.x+Math.cos(a)*27,12+height(player.position.x,player.position.z)+Math.sin(a*2+i)*2,player.position.z+Math.sin(a)*24-14);b.rotation.y=-a;b.children.forEach((w,j)=>w.rotation.z=(j?1:-1)*(1.1+Math.sin(t*3+i)*.3));});
 ripples.forEach((r,i)=>{const s=(r.userData.lake?1.6:1)+((t*.13+i*.27)%1)*(r.userData.lake?2.5:2);r.scale.set(s,s*.58,1);});
 if(playing){
  const view=playerView(player),pitch=overview?.8:viewPitch,radius=view.radius*viewZoom*(overview?1.9:1);
  const eye=view.eye,horizontal=radius*Math.cos(Math.max(0,pitch));
  desiredCam.set(player.position.x+Math.sin(angle)*horizontal,player.position.y+eye+radius*Math.sin(Math.max(0,pitch)),player.position.z+Math.cos(angle)*horizontal);
  // Keep the camera above the terrain even while tilting toward the sky.
  desiredCam.y=Math.max(desiredCam.y,height(desiredCam.x,desiredCam.z)+1.1);
  const ahead=THREE.MathUtils.clamp((.5-pitch)*12,0,12),skyLift=Math.tan(Math.max(0,-pitch))*(horizontal+ahead);
  lookTarget.set(player.position.x-Math.sin(angle)*ahead,player.position.y+eye+skyLift,player.position.z-Math.cos(angle)*ahead);
 }else{desiredCam.set(mobile()?25:27,mobile()?23:20,mobile()?35:31);lookTarget.set(mobile()?0:-7,mobile()?2:1,0);}
 camera.position.lerp(desiredCam,1-Math.exp(-dt*2.1));if(playing)camera.position.y=Math.max(camera.position.y,height(camera.position.x,camera.position.z)+.9);currentLook.lerp(lookTarget,1-Math.exp(-dt*2.7));camera.lookAt(currentLook);skyDome.position.copy(camera.position);forest.update(camera.position.x,camera.position.z,lightGraphics);discoveries.update(camera.position.x,camera.position.z,lightGraphics);grassField.update(camera.position.x,camera.position.z,lightGraphics);
 treeSight.focus.value.copy(player.position);
 const playerEye=playerView(player).eye;
 treeSight.focus.value.y+=playerEye;
 treeSight.radius.value=playing?Math.max(1.35,playerEye*.9):0;
 if(playing){toProject.copy(player.position);toProject.y+=playerView(player).tag;toProject.project(camera);$('playerTag').style.display=toProject.z>-1&&toProject.z<1&&Math.abs(toProject.x)<1.05&&Math.abs(toProject.y)<1.05?'':'none';$('playerTag').style.left=`${(toProject.x*.5+.5)*innerWidth}px`;$('playerTag').style.top=`${(-toProject.y*.5+.5)*innerHeight-8}px`;}

 placeMeadowTags();
 updateLocationAudio();
 animateEnvironment(dt,t);renderer.render(scene,camera);
}
camera.position.set(mobile()?25:27,mobile()?23:20,mobile()?35:31);camera.lookAt(currentLook);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
document.addEventListener('visibilitychange',()=>{registerActivity();lastGroundTap=null;keys.clear();viewPointers.clear();pinchDistance=0;if(!document.hidden){syncEnvironment();}if(audioCtx){if(document.hidden)audioCtx.suspend();else if(audioOn)audioCtx.resume();}});
animateAnimal(player,.05,0);frame();$('birth').disabled=false;setTimeout(()=>{$('load').style.opacity=0;setTimeout(()=>$('load').style.display='none',850);},300);

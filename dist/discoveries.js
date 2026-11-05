import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Quiet scenery only: no triggers, rewards, dialogs, or interactions.
export function createDiscoveries(scene,{height,allowed,stone,bark,soil,leaf}){
 const earth=soil.clone();earth.color.setHex(0x807354);earth.side=THREE.DoubleSide;
 const inner=new THREE.MeshStandardMaterial({color:0x353027,roughness:1,side:THREE.DoubleSide});
 const darkness=new THREE.MeshBasicMaterial({color:0x100e0b,side:THREE.DoubleSide});
 const moss=leaf.clone();moss.color.setHex(0x6d8050);moss.onBeforeCompile=()=>{};
 const cutWood=new THREE.MeshStandardMaterial({color:0xb29a70,roughness:1});
 const cap=new THREE.MeshStandardMaterial({color:0xb99a70,roughness:1});
 const stem=new THREE.MeshStandardMaterial({color:0xd8d0b1,roughness:1});
 const fossil=new THREE.MeshStandardMaterial({color:0xc3b99b,roughness:1});
 const rock=new THREE.IcosahedronGeometry(1,1),softRock=new THREE.IcosahedronGeometry(1,2),box=new THREE.BoxGeometry(1,1,1);
 const models=new Map(),catalog=[['burrow',4.4],['hollow-log',3.8],['cairn',1.5],['stone-circle',5],['ancient-arch',4.7],['mushroom-ring',3.7],['fossil-stone',2.8]];
 function model(type){
  if(models.has(type))return models.get(type);
  const root=new THREE.Group(),colliders=[];
  const add=(geometry,material,position,scale=[1,1,1],rotation=[0,0,0])=>{const m=new THREE.Mesh(geometry,material);m.position.set(...position);m.scale.set(...scale);m.rotation.set(...rotation);root.add(m);return m;};
  const solid=(x,z,radius)=>colliders.push({x,z,radius});
  if(type==='burrow'){
   // A real recessed opening in a raised earth bank, not a dark disk on flat soil.
   const sections=[[1.5,3.1,2.55],[0,3.5,2.75],[-1.7,2.8,2.3],[-3,1.7,1.45],[-3.7,.18,.12]];
   const positions=[],uv=[],indices=[],segments=24;
   for(let row=0;row<sections.length;row++)for(let j=0;j<=segments;j++){
    const a=j/segments*Math.PI,[z,rx,ry]=sections[row];positions.push(Math.cos(a)*rx,Math.sin(a)*ry-.10,z);uv.push(j/segments,row/sections.length);
    if(row<sections.length-1&&j<segments){const k=row*(segments+1)+j;indices.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);}
   }
   const shell=new THREE.BufferGeometry();shell.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));shell.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));shell.setIndex(indices);shell.computeVertexNormals();add(shell,earth,[0,0,0]);
   const front=new THREE.Shape();front.moveTo(3.1,-.10);for(let i=0;i<=24;i++){const a=i/24*Math.PI;front.lineTo(Math.cos(a)*3.1,Math.sin(a)*2.55-.10);}front.lineTo(-1.25,-.10);for(let i=24;i>=0;i--){const a=i/24*Math.PI;front.lineTo(Math.cos(a)*1.25,Math.sin(a)*1.55-.10);}front.closePath();
   add(new THREE.ShapeGeometry(front),earth,[0,0,1.5]);
   // Build inner vault explicitly so the opening faces the same direction as the bank.
   const wallPositions=[],wallUV=[],wallIndices=[];
   for(let end=0;end<2;end++)for(let i=0;i<=24;i++){const a=i/24*Math.PI;wallPositions.push(Math.cos(a)*1.25,Math.sin(a)*1.55-.1,end? -1.5:1.49);wallUV.push(i/24,end);if(end===0&&i<24){wallIndices.push(i,i+1,i+25,i+1,i+26,i+25);}}
   const vault=new THREE.BufferGeometry();vault.setAttribute('position',new THREE.Float32BufferAttribute(wallPositions,3));vault.setAttribute('uv',new THREE.Float32BufferAttribute(wallUV,2));vault.setIndex(wallIndices);vault.computeVertexNormals();add(vault,inner,[0,0,0]);
   const end=new THREE.Shape();end.moveTo(1.25,-.1);for(let i=0;i<=24;i++){const a=i/24*Math.PI;end.lineTo(Math.cos(a)*1.25,Math.sin(a)*1.55-.1);}end.closePath();add(new THREE.ShapeGeometry(end),darkness,[0,0,-1.51]);
   for(let i=0;i<9;i++){const a=i/8*Math.PI;add(rock,stone,[Math.cos(a)*1.48,Math.sin(a)*1.75-.06,1.55],[.33,.30,.28],[0,i*.8,a]);}
   add(softRock,moss,[-1.4,2.26,-.25],[.9,.22,1.4]);add(softRock,moss,[1.5,1.95,-1.5],[.8,.18,1]);solid(0,-.7,3.65);
  }else if(type==='hollow-log'){
   const outer=new THREE.CylinderGeometry(1.1,1.25,5.3,16,1,true);outer.rotateX(Math.PI/2);add(outer,bark,[0,1.05,0]);
   const inside=new THREE.CylinderGeometry(.73,.8,5.3,16,1,true);inside.rotateX(Math.PI/2);add(inside,inner,[0,1.05,0]);
   add(new THREE.RingGeometry(.8,1.25,20),cutWood,[0,1.05,-2.65],[1,1,1],[0,Math.PI,0]);add(new THREE.RingGeometry(.73,1.1,20),cutWood,[0,1.05,2.65]);
   add(softRock,moss,[.18,2.08,-.4],[.72,.17,1.9]);
   for(const z of [-1.65,0,1.65])solid(0,z,1.18);
  }else if(type==='cairn'){
   let y=-.08;for(let i=0;i<7;i++){const r=1.0-i*.11,h=.42-i*.035;add(rock,i%3?stone:moss,[Math.sin(i*2)*.12,y+h*.75,0],[r,h,r*.76],[0,i*.9,i%2?.08:-.06]);y+=h*1.45;}solid(0,0,1.08);
  }else if(type==='stone-circle'){
   for(let i=0;i<7;i++){const a=i/8*Math.PI*2,x=Math.cos(a)*3.6,z=Math.sin(a)*3.6,h=1.3+i%3*.45;add(rock,stone,[x,h*.67,z],[.65,h,.7],[.06,a,.08*Math.sin(i)]);solid(x,z,.8);}
   add(rock,moss,[.6,.15,-.6],[.8,.25,.6]);
  }else if(type==='ancient-arch'){
   for(const side of [-1,1]){for(let i=0;i<3;i++)add(box,stone,[side*2.2,.4+i*.75,0],[.8,.8,1],[0,side*.04,.015*side]);solid(side*2.2,0,.78);}
   for(let i=0;i<13;i++){const a=(i+.5)/13*Math.PI;add(box,stone,[Math.cos(a)*2.2,2.2+Math.sin(a)*2.2,0],[.65,.72,1],[0,0,a-Math.PI/2]);}
   add(softRock,moss,[-2.2,2.0,.3],[.5,.3,.6]);add(box,stone,[3.3,.28,1.1],[1.1,.5,.9],[.05,.6,.2]);solid(3.3,1.1,.8);
  }else if(type==='mushroom-ring'){
   for(let i=0;i<11;i++){const a=i/11*Math.PI*2,r=2.2+.35*Math.sin(i*3),x=Math.cos(a)*r,z=Math.sin(a)*r,h=.42+(i%4)*.17;
    add(new THREE.CylinderGeometry(.10,.15,h,7),stem,[x,h*.5,z]);add(softRock,cap,[x,h,z],[.44+(i%3)*.12,.23,.48+(i%3)*.10]);
   }
  }else if(type==='fossil-stone'){
   add(softRock,stone,[0,.6,0],[2.2,.85,1.9]);
   const points=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI*5,r=.13+i/64*1.33,x=Math.cos(a)*r,z=Math.sin(a)*r*.87;points.push(new THREE.Vector3(x,.62+.85*Math.sqrt(Math.max(0,1-(x/2.2)**2-(z/1.9)**2)),z));}
   add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),64,.065,5,false),fossil,[0,0,0]);solid(0,0,2.15);
  }
  root.userData.colliders=colliders;models.set(type,root);return root;
 }
 const records=[],obstacles=[];
 for(let i=0;i<56;i++){
  const [type,radius]=catalog[i%catalog.length],col=i%7,row=Math.floor(i/7);
  // Several discoveries are close enough to find on an ordinary first walk.
  const close=[[-31,-43],[45,26],[-42,7],[52,-9],[-22,49],[11,34],[62,49]];
  const target=i<7?close[i]:[-292+col*94,-290+row*82];
  let spot=null;
  for(let j=0;j<110;j++){
   const a=j*2.39996,r=j===0?0:Math.sqrt(j)*2.6,x=target[0]+Math.cos(a)*r,z=target[1]+Math.sin(a)*r;
   if(!allowed(x,z,radius)||records.some(o=>Math.hypot(o.x-x,o.z-z)<o.radius+radius+8))continue;spot={x,z};break;
  }
  if(!spot)continue;
  const {x,z}=spot,angle=i*1.731+.4,base=height(x,z),co=Math.cos(angle),si=Math.sin(angle);
  const group=new THREE.Group();group.name='discovery-'+type;group.position.set(x,base,z);group.rotation.y=angle;group.userData.keepSeparate=true;
  const prototype=model(type),batches=new Map();
  for(const child of prototype.children){
   child.updateMatrix();const geometry=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();geometry.applyMatrix4(child.matrix);
   const p=geometry.attributes.position;for(let v=0;v<p.count;v++){const px=p.getX(v),pz=p.getZ(v);p.setY(v,p.getY(v)+height(x+px*co+pz*si,z-px*si+pz*co)-base);}geometry.computeVertexNormals();
   if(!batches.has(child.material))batches.set(child.material,[]);batches.get(child.material).push(geometry);
  }
  for(const [material,parts] of batches){const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
  const colliders=prototype.userData.colliders.map(o=>({x:x+o.x*co+o.z*si,z:z-o.x*si+o.z*co,radius:o.radius}));obstacles.push(...colliders);
  scene.add(group);records.push({type,x,z,radius,group,colliders});
 }
 // The prototypes have been baked into small, material-batched landmark groups.
 const geometries=new Set();for(const root of models.values())root.traverse(o=>{if(o.isMesh)geometries.add(o.geometry);});for(const geometry of geometries)geometry.dispose();
 return {records,obstacles,update(x,z,light=false){for(const item of records)item.group.visible=Math.hypot(item.x-x,item.z-z)<(light?180:260);}};
}

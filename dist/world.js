import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

export class SpatialIndex {
 constructor(size=12){this.size=size;this.cells=new Map();}
 add(item,rx=item.radius,rz=rx){
  for(let x=Math.floor((item.x-rx)/this.size);x<=Math.floor((item.x+rx)/this.size);x++)
   for(let z=Math.floor((item.z-rz)/this.size);z<=Math.floor((item.z+rz)/this.size);z++){
    const key=x+','+z;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(item);
   }
 }
 at(x,z){return this.cells.get(Math.floor(x/this.size)+','+Math.floor(z/this.size))||[];}
}

// Reuse one tree model across the map. Near chunks retain the full canopy;
// distant chunks use the same silhouette with fewer leaves and a single draw.
export function createForest(scene,trees,materials,foliage,height){
 const highParts=materials.map(()=>[]),lowParts=[],pose=new THREE.Object3D();
 const add=(geometry,material,pos,scale=[1,1,1],rotation=[0,0,0],lowGeometry=geometry)=>{
  pose.position.set(...pos);pose.scale.set(...scale);pose.rotation.set(...rotation);pose.updateMatrix();
  const g=geometry.index?geometry.toNonIndexed():geometry.clone();g.applyMatrix4(pose.matrix);highParts[material].push(g);
  const low=lowGeometry.index?lowGeometry.toNonIndexed():lowGeometry.clone();low.applyMatrix4(pose.matrix);
  const color=materials[material].color,colors=new Float32Array(low.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
  low.setAttribute('color',new THREE.BufferAttribute(colors,3));lowParts.push(low);
 };
 const trunk=new THREE.CylinderGeometry(.18,.35,4.8,8),branch=new THREE.CylinderGeometry(.09,.17,2.9,5),lowLeaf=new THREE.IcosahedronGeometry(1,0);
 add(trunk,0,[0,2.4,0]);
 for(let i=0;i<3;i++){const a=i*Math.PI*2/3+.2;add(branch,0,[Math.cos(a)*.65,4.05,Math.sin(a)*.65],[1,1,1],[Math.sin(a)*.52,0,-Math.cos(a)*.52]);}
 for(let i=0;i<7;i++){const a=i*Math.PI*2/7,r=1.8+(i%2)*.35;add(foliage,1+i%5,[Math.cos(a)*r,4.8+Math.sin(a*2)*.22,Math.sin(a)*r*.8],[2.6,1.42+(i%3)*.12,2.15],[0,a*.7,0],lowLeaf);}
 for(let i=0;i<5;i++){const a=i*Math.PI*2/5+.4;add(foliage,1+(i+1)%5,[Math.cos(a)*1.25,5.95+(i%2)*.28,Math.sin(a)*1.05],[2.3,1.45,2],[0,-a*.6,0],lowLeaf);}
 add(foliage,3,[.15,6.65,0],[2.5,1.22,2.1],[0,0,0],lowLeaf);
 const highGeometry=highParts.map(parts=>mergeGeometries(parts,false)),lowGeometry=mergeGeometries(lowParts,false);
 for(const parts of [...highParts,lowParts])parts.forEach(g=>g.dispose());trunk.dispose();branch.dispose();lowLeaf.dispose();
 const lowMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
 const cells=new Map(),size=64;
 for(const tree of trees){const x=Math.floor(tree.x/size),z=Math.floor(tree.z/size),key=x+','+z;if(!cells.has(key))cells.set(key,{x:(x+.5)*size,z:(z+.5)*size,trees:[]});cells.get(key).trees.push(tree);}
 const chunks=[];
 for(const cell of cells.values()){
  const group=new THREE.Group();group.name='forest-chunk';group.userData.keepSeparate=true;scene.add(group);
  const near=new THREE.Group();group.add(near);
  const meshes=highGeometry.map((geometry,i)=>{const m=new THREE.InstancedMesh(geometry,materials[i],cell.trees.length);m.castShadow=m.receiveShadow=true;near.add(m);return m;});
  const far=new THREE.InstancedMesh(lowGeometry,lowMaterial,cell.trees.length);far.receiveShadow=true;group.add(far);
  cell.trees.forEach((tree,i)=>{
   pose.position.set(tree.x,height(tree.x,tree.z),tree.z);pose.rotation.set(0,tree.x*.37+tree.z*.19,0);pose.scale.set(tree.scale,tree.scale,tree.scale);pose.updateMatrix();
   for(const m of [...meshes,far])m.setMatrixAt(i,pose.matrix);
  });
  for(const m of [...meshes,far])m.computeBoundingSphere();chunks.push({...cell,group,near,far});
 }
 return {chunks,update(x,z,light=false){
  for(const chunk of chunks){const distance=Math.hypot(x-chunk.x,z-chunk.z);chunk.group.visible=distance<(light?360:520);chunk.near.visible=distance<(light?72:112);chunk.far.visible=!chunk.near.visible;}
 }};
}

// Nine reusable grass tiles follow the camera. The seed is tied to the tile,
// so returning to a meadow restores the same tufts without retaining a huge map.
export function createGrassField(scene,geometry,material,{height,allowed,limit}){
 const size=48,capacity=2600,tiles=[],pose=new THREE.Object3D(),color=new THREE.Color();
 let centerX=Infinity,centerZ=Infinity,lightMode=false;
 for(let i=0;i<9;i++){const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.name='meadow-grass';mesh.receiveShadow=true;mesh.userData.keepSeparate=true;scene.add(mesh);tiles.push({mesh,key:null,count:0});}
 function fill(tile,x,z){
  let seed=(Math.imul(x+573,73856093)^Math.imul(z+389,19349663))>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};let count=0;
  for(let attempt=0;attempt<capacity*3&&count<capacity;attempt++){
   const px=(x+random())*size,pz=(z+random())*size;
   if(Math.abs(px)>limit||Math.abs(pz)>limit||!allowed(px,pz))continue;
   pose.position.set(px,height(px,pz)-.025,pz);pose.rotation.set(0,random()*Math.PI*2,0);
   const spread=.8+random()*.55;pose.scale.set(spread,.7+random()*.8,spread);pose.updateMatrix();tile.mesh.setMatrixAt(count,pose.matrix);
   tile.mesh.setColorAt(count,color.setHex([0x879c58,0x9bad66,0xa9b775,0xb9ba78][Math.floor(random()*4)]));count++;
  }
  tile.key=x+','+z;tile.count=count;tile.mesh.count=count;tile.mesh.instanceMatrix.needsUpdate=true;if(tile.mesh.instanceColor)tile.mesh.instanceColor.needsUpdate=true;tile.mesh.computeBoundingSphere();tile.mesh.count=lightMode?Math.floor(count*.36):count;
 }
 return {tiles,update(x,z,light=false){
  const cx=Math.floor(x/size),cz=Math.floor(z/size);
  if(light!==lightMode){lightMode=light;for(const tile of tiles)tile.mesh.count=light?Math.floor(tile.count*.36):tile.count;}
  if(cx===centerX&&cz===centerZ)return;centerX=cx;centerZ=cz;
  const needed=[];for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)needed.push({x:cx+dx,z:cz+dz,key:(cx+dx)+','+(cz+dz)});
  const spare=tiles.filter(tile=>!needed.some(n=>n.key===tile.key));
  for(const cell of needed)if(!tiles.some(tile=>tile.key===cell.key))fill(spare.pop(),cell.x,cell.z);
 }};
}

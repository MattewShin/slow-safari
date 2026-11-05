const capacity=16;
const presenceTTL=12_000;
const species=new Set(['giraffe','zebra','gazelle','rabbit','squirrel','elephant','hippo','rhino',
 'turtle','guineaPig','chinchilla','hedgehog','meerkat','fennec']);
const motions=new Set(['walk','run','idle','rest','graze','drink']);
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

async function readUpdate(request){
 const reader=request.body?.getReader();
 if(!reader)return null;
 const decoder=new TextDecoder();
 let input='',bytes=0;
 while(true){
  const {done,value}=await reader.read();
  if(done)break;
  bytes+=value.byteLength;
  if(bytes>512){await reader.cancel();return null;}
  input+=decoder.decode(value,{stream:true});
 }
 try{return JSON.parse(input+decoder.decode());}catch{return null;}
}

async function updateMeadow(request,env,url){
 if(request.method!=='POST')return json({error:'method'},405);
 const origin=request.headers.get('Origin');
 if(origin&&origin!==url.origin)return json({error:'origin'},403);
 const data=await readUpdate(request);
 if(!data||typeof data.id!=='string'||!/^[0-9a-f]{32}$/.test(data.id))return json({error:'invalid'},400);
 // Expose only a derived identifier, so peers cannot overwrite another session.
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.id));
 const id=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 if(data.leave===true){
  await env.DB.prepare('DELETE FROM meadow_presence WHERE id=?').bind(id).run();
  return json({players:[]});
 }
 const {x,z,yaw,motion}=data;
 if(!species.has(data.species)||!motions.has(motion)||![x,z,yaw].every(Number.isFinite)||
    Math.abs(x)>=WORLD_LIMIT||Math.abs(z)>=WORLD_LIMIT||Math.abs(yaw)>Math.PI+.001)return json({error:'invalid'},400);

 const now=Date.now(),cutoff=now-presenceTTL;
 // The admission check and insert share a statement so simultaneous joins respect capacity.
 const [,write,list]=await env.DB.batch([
  env.DB.prepare('DELETE FROM meadow_presence WHERE seen < ?').bind(cutoff),
  env.DB.prepare(`
   INSERT INTO meadow_presence (id,species,x,z,yaw,motion,seen)
   SELECT ?,?,?,?,?,?,?
   WHERE EXISTS (SELECT 1 FROM meadow_presence WHERE id=?)
      OR (SELECT COUNT(*) FROM meadow_presence) < ?
   ON CONFLICT(id) DO UPDATE SET species=excluded.species,x=excluded.x,z=excluded.z,
    yaw=excluded.yaw,motion=excluded.motion,seen=excluded.seen
  `).bind(id,data.species,x,z,yaw,motion,now,id,capacity),
  env.DB.prepare('SELECT id,species,x,z,yaw,motion FROM meadow_presence WHERE id<>? LIMIT ?').bind(id,capacity-1)
 ]);
 if(!write.meta.changes)return json({error:'full',capacity},409);
 return json({players:list.results,capacity});
}

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/meadow'){
   try{return await updateMeadow(request,env,url);}
   catch(error){console.error('Meadow presence failed',error);return json({error:'unavailable'},503);}
  }
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
  const path=url.pathname==='/'?'/index.html':url.pathname;
  if(!Object.hasOwn(assets,path))return new Response('Not found',{status:404});
  const contentType=path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':
   path.endsWith('.html')?'text/html':'text/plain';
  return new Response(request.method==='HEAD'?null:assets[path],{headers:{
   'Content-Type':contentType+'; charset=utf-8',
   'Cache-Control':path.endsWith('.html')?'no-cache':'public, max-age=60',
   'X-Content-Type-Options':'nosniff'
  }});
 }
};

const endpoint='/api/meadow';

export function connectMeadow({sample,onPlayers,onStatus}){
 const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
 let timer,request,generation=0,lastSnapshotAt=-Infinity;
 function leave(){
  generation++;
  clearTimeout(timer);
  request?.abort();
  request=null;
  lastSnapshotAt=-Infinity;
  onPlayers([]);
  navigator.sendBeacon(endpoint,JSON.stringify({id,leave:true}));
 }
 async function tick(){
  if(document.hidden||request)return;
  const current=generation;
  const controller=new AbortController();
  request=controller;
  const timeout=setTimeout(()=>controller.abort(),4000);
  let delay=950;
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id,...sample()}),signal:controller.signal,cache:'no-store'});
   if(current!==generation)return;
   if(response.status===409){
    onPlayers([]);onStatus('함께 걷는 초원이 가득 찼어요');delay=6000;return;
   }
   if(!response.ok)throw new Error('Meadow connection failed');
   const {players}=await response.json();
   if(current!==generation)return;
   lastSnapshotAt=performance.now();
   onPlayers(players);
   onStatus('함께 걷는 사람 '+(players.length+1)+'명 · 나 포함');
  }catch{
   if(current!==generation)return;
   if(performance.now()-lastSnapshotAt>=12000)onPlayers([]);
   onStatus('초원에 다시 연결하는 중');
   delay=1800;
  }finally{
   clearTimeout(timeout);
   if(current===generation){request=null;timer=setTimeout(tick,delay);}
  }
 }
 document.addEventListener('visibilitychange',()=>{
  clearTimeout(timer);
  if(!document.hidden)tick();
 });
 window.addEventListener('pagehide',leave);
 window.addEventListener('pageshow',tick);
 tick();
}

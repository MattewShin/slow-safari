const clockFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function koreanClock(now=new Date()){
 const p=Object.fromEntries(clockFormatter.formatToParts(now).map(({type,value})=>[type,value]));
 return {date:p.year+'-'+p.month+'-'+p.day,minutes:Number(p.hour)*60+Number(p.minute),text:p.hour+':'+p.minute};
}

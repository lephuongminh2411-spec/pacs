// Synthetic tide series for the interactive prototype. Not an operational forecast.
export const clock=(n:number)=>{const m=((Math.round(n)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
export const minutes=(s:string)=>{if(!/^\d{2}:\d{2}$/.test(s))return NaN;const [h,m]=s.split(':').map(Number);return h<24&&m<60?h*60+m:NaN};
export function dayNumber(date:string){return Math.floor(Date.parse(date+'T00:00:00Z')/86400000)}
export function tide(min:number,day=0){return 1.9+1.55*Math.cos((min-930-day*42)*Math.PI*2/745)+0.18*Math.sin(min*Math.PI/1440)}
export function conditions(time:string,draft:number,date:string,port='SSIT'){const m=minutes(time),day=((dayNumber(date)%14)+14)%14;const transit=port==='SSIT'?105:port==='Thị Vải'?140:90;const atPickup=14.2+tide(m,day)-draft-.15;const critical=12.5+tide(m+60,day)-draft-.3;const atBerth=13+tide(m+transit,day)-draft-.2;return {pickup:+atPickup.toFixed(2),critical:+critical.toFixed(2),berth:+atBerth.toFixed(2),transit,arrival:clock(m+transit),safe:atPickup>=1.5&&critical>=1&&atBerth>=1};}
export function safeWindows(date:string,draft:number,port='SSIT'){const spans:{start:number,end:number}[]=[];let start:number|null=null;for(let m=0;m<=1440;m+=5){const ok=m<1440&&conditions(clock(m),draft,date,port).safe;if(ok&&start===null)start=m;if(!ok&&start!==null){if(m-start>=15)spans.push({start,end:m-5});start=null}}return spans.map((w,i)=>({...w,id:date+'-'+i,date,mid:clock(Math.round((w.start+w.end)/10)*5),from:clock(w.start),to:clock(w.end)}))}
export function validDate(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(dayNumber(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s}

export function quarterHourSlots(start:number,end:number){const slots:string[]=[];for(let m=Math.ceil(start/15)*15;m<=end;m+=15)slots.push(clock(m));return slots}
export function suggestedQuarterHour(w:{start:number;end:number}){const slots=quarterHourSlots(w.start,w.end);return slots.length?slots[Math.floor((slots.length-1)/2)]:''}

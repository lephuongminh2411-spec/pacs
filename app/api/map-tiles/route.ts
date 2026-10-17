export const dynamic='force-dynamic';
// Fixed upstream and geographic limits: this route is not an arbitrary URL proxy.
export async function GET(request:Request){
 const p=new URL(request.url).searchParams;
 const raw=['z','x','y'].map(k=>p.get(k)||'');
 if(raw.some(v=>!/^\d{1,7}$/.test(v)))return new Response('Invalid tile',{status:400});
 const [z,x,y]=raw.map(Number),n=2**z;
 if(z<8||z>18||x>=n||y>=n)return new Response('Invalid tile',{status:400});
 const lon=(t:number)=>t/n*360-180,lat=(t:number)=>Math.atan(Math.sinh(Math.PI*(1-2*t/n)))*180/Math.PI;
 if(lon(x+1)<106.5||lon(x)>107.5||lat(y)<9.9||lat(y+1)>11)return new Response('Outside PACS map area',{status:404});
 const imagery=p.get('layer')==='imagery';
 const url=imagery?`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`:`https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
 try{
  const upstream=await fetch(url,{headers:{'User-Agent':'PACS-Prototype/1.0 (+https://pacs-pilot.grassyzebra8.chatgpt.site)','Referer':'https://pacs-pilot.grassyzebra8.chatgpt.site/'},signal:AbortSignal.timeout(8000)});
  if(!upstream.ok||!upstream.headers.get('content-type')?.startsWith('image/')){console.warn('PACS map provider',imagery?'imagery':'osm',upstream.status);return new Response('Map provider unavailable',{status:502,headers:{'Cache-Control':'no-store','X-Map-Upstream-Status':String(upstream.status)}})}
  return new Response(upstream.body,{headers:{'Content-Type':upstream.headers.get('content-type')!,'Cache-Control':upstream.headers.get('cache-control')||'public, max-age=604800','X-Content-Type-Options':'nosniff'}});
 }catch(e){console.warn('PACS map fetch',imagery?'imagery':'osm',e instanceof Error?e.message:'unknown');return new Response('Map provider unavailable',{status:502,headers:{'Cache-Control':'no-store'}})}
}

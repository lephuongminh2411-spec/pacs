import ts from 'typescript';import fs from 'node:fs';import assert from 'node:assert/strict';
const sessions=new Map(),trips=new Map();
const db={prepare(sql){
 const stmt={async all(){return {results:[...trips.values()]}},bind(...a){return {
 async first(){if(sql.includes('FROM sessions')){const s=sessions.get(a[0]);return s&&s.expires>a[1]?s:null}return trips.get(a[0])||null},
 async all(){return {results:[...trips.values()]}},
 async run(){if(sql==='DELETE FROM trips')trips.clear();if(sql.startsWith('INSERT INTO sessions'))sessions.set(a[0],{token:a[0],account:a[1],expires:a[2]});if(sql.startsWith('INSERT INTO trips'))trips.set(a[0],{id:a[0],data:a[1],revision:0});if(sql.startsWith('UPDATE trips')){const r=trips.get(a[1]);if(r.revision!==a[2])return {meta:{changes:0}};trips.set(a[1],{...r,data:a[0],revision:r.revision+1})}return {meta:{changes:1}}}
 }} };return stmt;
}};
const transpile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const scheduleUrl=moduleUrl(transpile(fs.readFileSync('lib/schedule.ts','utf8')));
const permissionsUrl=moduleUrl(transpile(fs.readFileSync('lib/trip-permissions.ts','utf8')));
const accountsUrl=moduleUrl(transpile(fs.readFileSync('lib/accounts.ts','utf8')));
const voyageUrl=moduleUrl(transpile(fs.readFileSync('lib/voyage.ts','utf8').replace("'./schedule'",JSON.stringify(scheduleUrl))));
const schedule=await import(scheduleUrl);const {conditions,safeWindows,clock,minutes,suggestedQuarterHour,quarterHourSlots}=schedule;
for(const draft of [8.5,11,13.5,15,18])for(const date of ['2026-09-21','2026-10-16','2026-10-17'])for(const port of ['SSIT','Cái Mép','Thị Vải']){
 const windows=safeWindows(date,draft,port);for(const w of windows){assert.ok(w.end>=w.start);assert.ok(conditions(w.mid,draft,date,port).safe);for(let m=w.start;m<=w.end;m+=5)assert.ok(conditions(clock(m),draft,date,port).safe)}
}
assert.ok(safeWindows('2026-10-16',13.5).length>0);assert.notDeepEqual(safeWindows('2026-10-16',13.5),safeWindows('2026-10-16',8.5));
let code=transpile(fs.readFileSync('app/api/pacs/route.ts','utf8').replace("import {env} from 'cloudflare:workers';",'const env=globalThis.__testEnv;').replace("'../../../lib/schedule'",JSON.stringify(scheduleUrl)).replace("'../../../lib/accounts'",JSON.stringify(accountsUrl)).replace("'../../../lib/voyage'",JSON.stringify(voyageUrl)).replace("'../../../lib/trip-permissions'",JSON.stringify(permissionsUrl)));const testPassword=crypto.randomUUID();globalThis.__testEnv={DB:db,PACS_PASSWORD:testPassword};const {POST}=await import(moduleUrl(code));
async function call(token,b){if(b.action==='create'&&!b.order)b={loa:120,...b,order:{agencyName:'DEMO',email:'a@example.com',phone:'0900',address:'Vung Tau',gt:'15000'}};const r=await POST(new Request('https://pacs.test/api/pacs',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(b)}));return {status:r.status,...await r.json()}}
const login=async account=>(await call('',{action:'login',account,password:testPassword})).token;const g=await login('daily01'),d=await login('dieudo01'),a=await login('hoatieu.a'),b=await login('hoatieu.b'),c=await login('hoatieu.c');assert.equal((await call('',{action:'login',account:'dieudo01',password:'wrong'})).status,401);assert.equal((await call('',{action:'list'})).status,401);
const date='2026-10-16',win=safeWindows(date,13.5)[0],time=suggestedQuarterHour(win);
const invalidTime=Array.from({length:24},(_,h)=>clock(h*60)).find(x=>!conditions(x,13.5,date).safe);
assert.equal((await call(g,{action:'create',name:'BAD',draft:13.5,date,time:invalidTime})).status,400);
assert.equal((await call(a,{action:'create',name:'BAD',draft:13.5,date,time})).status,403);
assert.equal((await call(d,{action:'create',name:'DISPATCH CANNOT CREATE',draft:13.5,date,time})).status,403);
const made=await call(g,{action:'create',name:'TEST SHIP',draft:13.5,date,time,port:'SSIT'});assert.equal(made.status,200);const id=made.id;let revision=0;const action=async(token,name,extra={})=>{const x=await call(token,{action:name,id,revision,...extra});if(x.status===200)revision++;return x};
assert.equal((await call(d,{action:'list'})).trips.length,1);assert.equal((await call(g,{action:'list'})).trips.length,1);
assert.equal((await action(g,'confirm')).status,403);assert.equal((await action(d,'confirm')).status,403);assert.equal((await action(d,'consult',{person:'hoatieu.a'})).status,200);assert.equal((await call(a,{action:'list'})).trips.length,1);assert.equal((await call(b,{action:'list'})).trips.length,0);assert.equal((await action(b,'respond',{response:'agree'})).status,403);
const proposed=clock(win.start+10);assert.equal((await action(a,'respond',{response:'propose',time:invalidTime})).status,400);assert.equal((await action(a,'respond',{response:'propose',time:proposed,note:'Đề xuất thử'})).status,200);assert.equal((await action(d,'confirm',{time:invalidTime})).status,400);assert.equal((await action(d,'confirm',{time:clock(win.end)})).status,400);assert.equal((await action(d,'review_request',{decision:'approve'})).status,200);assert.equal((await action(d,'confirm',{time:proposed})).status,200);assert.equal((await action(d,'assign',{person:'hoatieu.b'})).status,400);assert.equal((await action(d,'authority_submit')).status,200);assert.equal((await action(d,'authority_result',{decision:'approved',reference:'DEMO-001'})).status,200);assert.equal((await action(d,'assign',{person:'hoatieu.b'})).status,200);assert.equal((await call(b,{action:'list'})).trips[0].time,proposed);assert.equal((await call(c,{action:'list'})).trips.length,0);assert.equal((await action(a,'device_check')).status,403);assert.equal((await action(a,'start')).status,403);
assert.equal((await action(b,'request_change',{time:proposed,note:'Cần thêm thời gian chuẩn bị'})).status,400);assert.equal((await action(b,'device_check')).status,400);assert.equal((await action(b,'pickup_plan_ack')).status,200);assert.equal((await action(b,'request_change',{time:proposed,note:'Cần thêm thời gian chuẩn bị'})).status,200);
assert.equal((await action(b,'request_change',{time:proposed,note:'Lặp'})).status,400);
assert.equal((await action(d,'request_counter',{time:clock(win.start+15),note:'Điều chỉnh phương án'})).status,200);
assert.equal((await action(a,'request_accept_counter')).status,403);
assert.equal((await action(b,'request_accept_counter')).status,200);
assert.equal((await action(d,'review_request',{decision:'approve'})).status,200);
assert.equal((await call(g,{action:'list'})).trips[0].time,clock(win.start+15));
assert.equal((await action(d,'message',{pilot:'hoatieu.b',content:'Chuẩn bị kiểm tra thiết bị.'})).status,200);
assert.equal((await call(b,{action:'list'})).trips[0].messages[0].content,'Chuẩn bị kiểm tra thiết bị.');
assert.equal((await call(a,{action:'list'})).trips[0].messages.length,0);
assert.equal((await action(b,'message',{content:'Đã nhận.'})).status,200);
assert.equal((await call(d,{action:'list'})).trips[0].messages.length,2);
assert.equal((await action(g,'message',{content:'Không được gửi'})).status,403);
assert.equal((await action(d,'message',{pilot:'hoatieu.c',content:'Không liên quan'})).status,403);
const cast=await call(d,{action:'broadcast',zone:'Gành Rái',content:'Gió tăng 23 kn'});assert.equal(cast.sent,1);revision++;
assert.equal((await call(b,{action:'list'})).trips[0].alerts[0].detail,'Gió tăng 23 kn');
assert.equal((await call(g,{action:'list'})).trips[0].messages,undefined);
assert.equal((await call(g,{action:'list'})).trips[0].alerts,undefined);
assert.equal((await call(b,{action:'broadcast',content:'Không có quyền'})).status,403);
assert.equal((await action(b,'depart')).status,400);assert.equal((await action(b,'device_check')).status,400);assert.equal((await action(b,'pickup_plan_ack')).status,200);assert.equal((await action(b,'start')).status,403);assert.equal((await action(b,'device_check')).status,200);
assert.equal((await action(b,'device_scenario',{aisFailure:true})).status,200);assert.equal((await action(b,'device_check')).status,200);assert.equal((await action(b,'depart')).status,400);assert.equal((await call(d,{action:'list'})).trips[0].device.results[2],'Không nhận tín hiệu');
assert.equal((await action(b,'device_report')).status,200);assert.ok((await call(d,{action:'list'})).trips[0].device.reported);assert.equal((await action(b,'device_backup')).status,200);assert.equal((await action(b,'device_check')).status,200);assert.equal((await call(d,{action:'list'})).trips[0].device.unit,'P-08');
assert.equal((await action(b,'device_scenario',{offline:true})).status,200);assert.equal((await action(b,'device_check')).status,200);assert.equal((await call(b,{action:'list'})).trips[0].device.ready,true);assert.equal((await action(b,'depart')).status,200);assert.equal((await action(d,'authority_result',{decision:'approved',reference:'DEMO-UPDATED'})).status,200);assert.equal((await action(b,'start')).status,200);assert.equal((await action(b,'alert_add',{category:'collision',title:'Tàu B quá gần',tag:'collision-v2',detail:'CPA 0,05 nm',level:'Nguy hiểm cao'})).status,200);
const dedup=await call(b,{action:'alert_add',id,revision,category:'collision',tag:'collision-v2',title:'Tàu B quá gần'});assert.ok(dedup.deduplicated);
const alert=(await call(d,{action:'list'})).trips[0].alerts.find(x=>x.tag==='collision-v2');
assert.equal((await action(a,'alert_status',{alertId:alert.id,status:'ack'})).status,403);
assert.equal((await action(b,'alert_status',{alertId:alert.id,status:'ack'})).status,200);
assert.equal((await call(d,{action:'list'})).trips[0].alerts.find(x=>x.id===alert.id).status,'ack');
assert.equal((await action(d,'alert_status',{alertId:alert.id,status:'resolved'})).status,200);
assert.equal((await action(b,'feedback',{reviews:{[alert.id]:{rating:'accurate'}}})).status,403);assert.equal((await action(b,'finish')).status,200);assert.equal((await call(g,{action:'list'})).trips[0].status,'completed');assert.equal((await call(d,{action:'confirm',id,revision:0})).status,409);
assert.equal((await action(a,'feedback',{note:'Sai người'})).status,403);assert.equal((await action(b,'feedback',{reviews:{invalid:{rating:'accurate'}}})).status,400);assert.equal((await action(b,'feedback',{note:'Cảnh báo hữu ích',reviews:{[alert.id]:{rating:'partial',note:'Cần sớm hơn'}}})).status,200);assert.equal((await call(d,{action:'list'})).trips[0].recommendationReviews[alert.id].rating,'partial');assert.equal((await action(b,'feedback_review',{decision:'verified'})).status,403);assert.equal((await action(d,'feedback_review',{decision:'verified'})).status,200);assert.equal((await call(d,{action:'list'})).trips[0].feedbackReview.decision,'verified');
console.log('PASS: computed safe windows; agency-only time selection; dispatch review/assignment; request/counter/approval; private two-way trip messages; broadcast; live alert persistence/acknowledgement/deduplication; Edge readiness/AIS/offline/backup; voyage lifecycle; feedback review; role isolation and revision conflicts.');

assert.equal((await call(b,{action:'list'})).user.pilotGrade,'Hạng Nhì');assert.equal((await call(a,{action:'list'})).user.pilotNumber,'HT-001');
const lowTime=suggestedQuarterHour(safeWindows(date,8.5)[0]);const lowTrip=await call(g,{action:'create',name:'SMALL DRAFT',draft:8.5,date,time:lowTime,port:'SSIT'});assert.equal(lowTrip.status,200);
assert.equal((await call(d,{action:'assign',id:lowTrip.id,revision:0,person:'hoatieu.c'})).status,403);
assert.equal((await call(d,{action:'confirm',id:lowTrip.id,revision:0,time:lowTime})).status,200);
assert.equal((await call(d,{action:'authority_submit',id:lowTrip.id,revision:1})).status,200);assert.equal((await call(d,{action:'authority_result',id:lowTrip.id,revision:2,decision:'approved',reference:'DEMO-002'})).status,200);assert.equal((await call(d,{action:'assign',id:lowTrip.id,revision:3,person:'hoatieu.c'})).status,200);
assert.ok((await call(c,{action:'list'})).trips.some(t=>t.id===lowTrip.id));
console.log('PASS: account profiles expose demo pilot rank and number; normal-draft request can be confirmed without consultation; assignment remains blocked until time confirmation.');

const morePilot=await call('',{action:'login',account:'hoatieu.l',password:testPassword});assert.equal(morePilot.user.name,'Bùi Thanh Sơn');assert.equal(morePilot.user.pilotGrade,'Hạng Ba');
const savedOrder=await call(g,{action:'create',name:'ORDER SNAPSHOT',draft:8.5,date,time:lowTime,port:'SSIT',order:{agencyName:'TEST AGENT',taxId:'DEMO',email:'ops@example.com',phone:'0900000000',address:'Vũng Tàu',owner:'OWNER',flag:'Việt Nam',shipType:'Container',notes:'Yêu cầu tàu lai'}});assert.equal(savedOrder.status,200);const received=(await call(d,{action:'list'})).trips.find(t=>t.id===savedOrder.id);assert.equal(received.order.agencyName,'TEST AGENT');assert.equal(received.order.notes,'Yêu cầu tàu lai');assert.equal(received.order.email,'ops@example.com');
assert.equal((await call(g,{action:'create',name:'BAD ORDER',draft:8.5,date,time:lowTime,order:{agencyName:'Missing contact'}})).status,400);
console.log('PASS: expanded pilot accounts authenticate; agency order snapshot reaches dispatch; incomplete order contact fields are rejected.');

assert.equal((await call(g,{action:'reset_demo',confirmation:'RESET_PACS_DEMO'})).status,403);assert.equal((await call(d,{action:'reset_demo',confirmation:'RESET_PACS_DEMO'})).status,403);trips.clear();console.log('PASS: permanent bulk deletion rejected for all roles.');
// Upgrade flow: conflicts, T−2 acknowledgement, history capture and replay permissions.
async function step(tk,tripId,action,extra={}){const trip=(await call(d,{action:'list'})).trips.find(t=>t.id===tripId);return call(tk,{action,id:tripId,revision:trip.revision,...extra})}
const demo1=await call(g,{action:'create',name:'REPLAY ONE',date,time:lowTime,draft:8.5,port:'SSIT'}),demo2=await call(g,{action:'create',name:'OVERLAP TWO',date,time:lowTime,draft:8.5,port:'SSIT'});
for(const item of [demo1,demo2]){assert.equal((await step(d,item.id,'confirm')).status,200);assert.equal((await step(d,item.id,'authority_submit')).status,200);assert.equal((await step(d,item.id,'authority_result',{decision:'approved',reference:'DEMO-003'})).status,200)}
assert.equal((await step(d,demo1.id,'assign',{person:'hoatieu.b'})).status,200);const overlap=await step(d,demo2.id,'assign',{person:'hoatieu.b'});assert.equal(overlap.status,409);assert.ok(overlap.conflicts.includes(demo1.id));assert.equal((await step(d,demo2.id,'assign',{person:'hoatieu.c'})).status,200);
assert.equal((await step(b,demo1.id,'pickup_plan_ack')).status,200);assert.equal((await call(b,{action:'list'})).trips.find(t=>t.id===demo1.id).pickupPlanAckKey,date+'T'+lowTime);
const frame={own:{lat:10.4,lon:107.02,heading:345,sog:7.3},targets:[{id:'v1',name:'TEST TARGET',lat:10.42,lon:107.03,heading:170,sog:6.2}],simMinute:600};
assert.equal((await step(b,demo1.id,'track_append',{frame})).status,403);
for(const action of ['device_check','depart','start'])assert.equal((await step(b,demo1.id,action)).status,200);
assert.equal((await step(b,demo1.id,'track_append',{frame:{own:{lat:100,lon:0,heading:0}}})).status,400);assert.equal((await step(b,demo1.id,'track_append',{frame})).status,200);assert.ok((await step(b,demo1.id,'track_append',{frame})).deduplicated);
assert.equal((await step(b,demo1.id,'scenario_log',{scenario:'ais'})).status,200);assert.equal((await step(b,demo1.id,'track_append',{frame:{...frame,scenario:'ais',aisFailure:true}})).status,200);
const listed=(await call(d,{action:'list'})).trips.find(t=>t.id===demo1.id);assert.ok(!('track' in listed));assert.equal(listed.trackCount,2);const stored=await call(b,{action:'trip_history',id:demo1.id});assert.equal(stored.track.length,2);assert.equal(stored.scenarios[0].kind,'ais');assert.equal((await call(a,{action:'trip_history',id:demo1.id})).status,403);assert.equal((await call(g,{action:'trip_history',id:demo1.id})).status,403);
assert.equal((await step(b,demo1.id,'alert_add',{category:'weather',title:'Gió tăng',detail:'Kiểm tra điều kiện',recommendation:'Liên hệ điều độ',tag:'new-wind'})).status,200);const alert2=(await call(d,{action:'list'})).trips.find(t=>t.id===demo1.id).alerts[0];assert.equal((await step(b,demo1.id,'alert_status',{alertId:alert2.id,status:'ack'})).status,200);assert.equal((await step(d,demo1.id,'alert_status',{alertId:alert2.id,status:'resolved'})).status,200);const audited=(await call(d,{action:'trip_history',id:demo1.id})).alerts[0];assert.equal(audited.history.length,2);assert.equal(audited.history[0].status,'ack');assert.equal(audited.history[1].status,'resolved');assert.equal(audited.recommendation,'Liên hệ điều độ');
assert.equal((await step(b,demo1.id,'finish',{frame:{...frame,scenario:'reset'}})).status,200);assert.equal((await step(b,demo1.id,'track_append',{frame})).status,403);assert.ok((await call(d,{action:'trip_history',id:demo1.id})).track.length>=2);
console.log('PASS: assignment overlap blocked and another pilot accepted; T−2 read state persists; valid track frames/scenario states persist without bloating list responses; history is role-scoped; alert acknowledgement/resolution audit survives voyage completion.');

const {pilotEligibility,accounts}=await import(accountsUrl);assert.equal(accounts['hoatieu.d'].pilotGrade,'Ngoại hạng');assert.ok(pilotEligibility({loa:350,order:{gt:120000}},'hoatieu.a'));assert.equal(pilotEligibility({loa:350,order:{gt:120000}},'hoatieu.d'),'');assert.ok(pilotEligibility({loa:120},'hoatieu.a'));assert.equal(pilotEligibility({loa:120,order:{gt:10000}},'hoatieu.e',true),'');console.log('PASS: demo LOA/GT certificate bounds, missing GT, unavailable pilot, extra-class pilot, and authority gate.');

// Role-scoped edits, invalidation, reassignment, cancellation and incident coordination.
const nextDate='2026-10-19',nextTime=suggestedQuarterHour(safeWindows(nextDate,8.5)[0]);
const managed=await call(g,{action:'create',name:'MANAGED',date:nextDate,time:nextTime,draft:8.5,port:'SSIT'});assert.equal(managed.status,200);
const vals={name:'MANAGED UPDATED',date:nextDate,time:nextTime,from:'P/S3',port:'SSIT',direction:'in',draftFront:8.5,draftAft:8.5,loa:120,gt:15000};
assert.equal((await step(b,managed.id,'edit_trip',{values:vals,reason:'Không có quyền'})).status,403);
assert.equal((await step(g,managed.id,'edit_trip',{values:vals})).status,400);
assert.equal((await step(g,managed.id,'edit_trip',{values:{...vals,draftFront:13.5,draftAft:13.5,time:Array.from({length:24},(_,h)=>clock(h*60)).find(x=>!conditions(x,13.5,nextDate).safe)},reason:'Giờ thiếu nước'})).status,400);
assert.equal((await step(g,managed.id,'edit_trip',{values:vals,reason:'Sửa phiếu'})).status,200);
assert.equal((await step(d,managed.id,'confirm')).status,200);assert.equal((await step(g,managed.id,'edit_trip',{values:vals,reason:'Đã chốt'})).status,403);
assert.equal((await step(d,managed.id,'authority_submit')).status,200);assert.equal((await step(d,managed.id,'authority_result',{decision:'approved',reference:'CV-TEST'})).status,200);assert.equal((await step(d,managed.id,'assign',{person:'hoatieu.b'})).status,200);
assert.equal((await step(b,managed.id,'reassign',{person:'hoatieu.c',reason:'Tự đổi'})).status,403);
assert.equal((await step(d,managed.id,'reassign',{person:'hoatieu.c',reason:'Đổi người'})).status,200);assert.equal((await step(d,managed.id,'reassign',{person:'hoatieu.e',reason:'Hoa tiêu rảnh'})).status,200);
assert.equal((await step(d,managed.id,'reassign',{person:'hoatieu.c',reason:'Đổi người'})).status,200);
assert.ok((await call(b,{action:'list'})).trips.some(t=>t.id===managed.id));assert.equal((await step(b,managed.id,'device_check')).status,403);
assert.equal((await step(d,managed.id,'edit_trip',{values:{...vals,time:clock(minutes(nextTime)+5)},reason:'Đổi kế hoạch'})).status,200);
let current=(await call(d,{action:'list'})).trips.find(t=>t.id===managed.id);assert.equal(current.status,'draft');assert.equal(current.assigned,'');assert.equal(current.authority,null);assert.equal(current.device,null);assert.equal(current.edits.length,2);
assert.equal((await step(g,managed.id,'cancel_trip',{reason:'Rút yêu cầu'})).status,200);current=(await call(d,{action:'list'})).trips.find(t=>t.id===managed.id);assert.equal(current.status,'cancelled');assert.ok(current.events.some(e=>e.text.includes('Rút yêu cầu')));assert.equal((await step(d,managed.id,'confirm')).status,403);
assert.equal((await step(d,managed.id,'append_note',{reason:'Lưu hồ sơ'})).status,200);
assert.equal((await step(b,demo2.id,'cancel_trip',{reason:'Sai hoa tiêu'})).status,403);
assert.equal((await step(c,demo2.id,'device_check')).status,400);assert.equal((await step(c,demo2.id,'pickup_plan_ack')).status,200);for(const action of ['device_check','depart','start'])assert.equal((await step(c,demo2.id,action)).status,200);
assert.equal((await step(d,demo2.id,'edit_trip',{values:vals,reason:'Đang dẫn'})).status,403);assert.equal((await step(d,demo2.id,'cancel_trip',{reason:'Đang dẫn'})).status,403);assert.equal((await step(d,demo2.id,'reassign',{person:'hoatieu.a',reason:'Đang dẫn'})).status,403);
assert.equal((await step(c,demo2.id,'incident_hold',{reason:'Không đúng quyền'})).status,403);assert.equal((await step(d,demo2.id,'incident_hold',{reason:'Gió tăng'})).status,200);current=(await call(d,{action:'list'})).trips.find(t=>t.id===demo2.id);assert.equal(current.status,'sailing');assert.equal(current.incident.active,true);assert.equal((await step(d,demo2.id,'incident_resume',{reason:'Đã phối hợp'})).status,200);assert.equal((await step(c,demo2.id,'append_note',{reason:'Nhật ký sự cố'})).status,200);
console.log('PASS: server rejects unrelated edits, missing reasons, unsafe plans and post-departure mutations; edits invalidate approvals/assignment; reassignment revokes former pilot writes; cancellation preserves audit; incident handling preserves active voyage.');

for(const scenario of ['crosswind','current','visibility','overtaking','combined'])assert.equal((await step(c,demo2.id,'scenario_log',{scenario})).status,200);const scenarioHistory=await call(c,{action:'trip_history',id:demo2.id});assert.ok(scenarioHistory.scenarios.some(s=>s.kind==='combined'));console.log('PASS: expanded weather and traffic scenarios persist in voyage history.');

assert.deepEqual(quarterHourSlots(380,710).slice(0,3),['06:30','06:45','07:00']);assert.equal(minutes(suggestedQuarterHour({start:380,end:710}))%15,0);assert.equal((await call(g,{action:'create',name:'OFF GRID',draft:8.5,date,time:'09:05'})).status,400);console.log('PASS: agency times use safe quarter-hour slots; unassigned pilots have no fabricated leave/device locks.');

assert.equal((await call(c,{action:'reset_pilot_schedule',confirmation:'RESET_PILOT_SCHEDULE'})).status,403);assert.equal((await call(d,{action:'reset_pilot_schedule',confirmation:'WRONG'})).status,403);const completedBefore=(await call(d,{action:'list'})).trips.filter(t=>t.status==='completed').length;const resetResult=await call(d,{action:'reset_pilot_schedule',confirmation:'RESET_PILOT_SCHEDULE'});assert.equal(resetResult.status,200);assert.ok(resetResult.reset>0);const afterReset=(await call(d,{action:'list'})).trips;assert.equal(afterReset.filter(t=>t.assigned&&['assigned','departed','sailing'].includes(t.status)).length,0);assert.equal(afterReset.filter(t=>t.status==='completed').length,completedBefore);console.log('PASS: schedule reset cancels only active assignments, frees pilots and preserves completed histories.');

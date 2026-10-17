import {env} from 'cloudflare:workers';
import {assignmentWindow,assignmentConflicts,appendTrack,sanitizeTrackFrame,pickupPlanKey} from '../../../lib/voyage';
import {canReadTrip,canEditTrip,canCancelTrip} from '../../../lib/trip-permissions';
import {accounts,pilotEligibility} from '../../../lib/accounts';
import {conditions,minutes,validDate,safeWindows} from '../../../lib/schedule';
export const dynamic='force-dynamic';
const people=accounts;
const reply=(x:any,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const stages=['assigned','departed'];
let schemaReady:Promise<unknown>|null=null;
const ensureSchema=(db:D1Database)=>schemaReady??=db.batch([
 db.prepare('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY NOT NULL, account TEXT NOT NULL, expires INTEGER NOT NULL)'),
 db.prepare('CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, revision INTEGER DEFAULT 0 NOT NULL)'),
 db.prepare('CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires)')
]).catch(e=>{schemaReady=null;throw e});
export async function POST(req:Request){try{const b:any=await req.json(),db=env.DB!;await ensureSchema(db);
if(b.action==='login'){if(!env.PACS_PASSWORD)return reply({error:'Cần đặt PACS_PASSWORD trong Secrets của Cloudflare trước khi đăng nhập.'},503);if(!people[b.account]||b.password!==env.PACS_PASSWORD)return reply({error:'Tài khoản hoặc mật khẩu chưa đúng.'},401);const token=crypto.randomUUID();await db.prepare('INSERT INTO sessions(token,account,expires) VALUES(?,?,?)').bind(token,b.account,Date.now()+86400000).run();return reply({token,user:{id:b.account,...people[b.account]}})}
const token=req.headers.get('Authorization')?.replace('Bearer ','')||'';const s:any=await db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').bind(token,Date.now()).first();if(!s||!people[s.account])return reply({error:'Vui lòng đăng nhập lại.'},401);const user={id:s.account,...people[s.account]};
if(b.action==='reset_demo')return reply({error:'Không được xóa hồ sơ chuyến. Sử dụng Hủy chuyến và ghi lý do.'},403);
if(b.action==='reset_pilot_schedule'){
 if(user.role!=='dispatch'||b.confirmation!=='RESET_PILOT_SCHEDULE')return reply({error:'Không có quyền đặt lại lịch hoa tiêu.'},403);
 const rows:any=await db.prepare('SELECT * FROM trips').all();let reset=0;
 for(const row of rows.results){const t=JSON.parse(row.data);if(!t.assigned||!['assigned','departed','sailing'].includes(t.status))continue;const reason='Đặt lại lịch hoa tiêu theo yêu cầu điều độ';t.cancelled={by:user.name,at:Date.now(),reason,previousStatus:t.status};t.status='cancelled';t.allocationStart=null;t.allocationEnd=null;t.events.push({text:'Hủy chuyến · '+reason,by:user.name,at:Date.now()});const result:any=await db.prepare('UPDATE trips SET data=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(t),t.id,row.revision).run();if(result.meta.changes)reset++}
 return reply({ok:true,reset});
}
if(b.action==='logout'){await db.prepare('DELETE FROM sessions WHERE token=?').bind(token).run();return reply({ok:true})}
if(b.action==='list'){const rows:any=await db.prepare('SELECT * FROM trips').all();const trips=rows.results.map((r:any)=>(()=>{const {track,...trip}=JSON.parse(r.data);return {...trip,trackCount:track?.length||0,trackStartedAt:track?.[0]?.at,revision:r.revision}})()).filter((t:any)=>canReadTrip(t,user)).map((t:any)=>{if(user.role==='agency'){const {messages,alerts,device,changeRequest,recommendationReviews,...publicTrip}=t;return publicTrip}if(user.role==='pilot')return {...t,messages:(t.messages||[]).filter((m:any)=>m.pilot===user.id)};return t});return reply({trips,user})}
if(b.action==='create'){if(user.role!=='agency')return reply({error:'Đại lý chọn giờ và tạo yêu cầu; điều độ tiếp nhận và phân công.'},403);const date=b.date||new Date().toISOString().slice(0,10),draft=Number(b.draft),time=b.time,port=String(b.port||'SSIT');if(!validDate(date)||!Number.isFinite(minutes(time||''))||!Number.isFinite(draft)||draft<1||draft>20||!String(b.name||'').trim())return reply({error:'Kiểm tra lại thông tin tàu, ngày và giờ.'},400);if(minutes(time)%15!==0)return reply({error:'Chọn giờ theo mốc 15 phút.'},400);if(!conditions(time,draft,date,b.direction==='out'?String(b.from||'SSIT'):port).safe)return reply({error:'Giờ chọn nằm ngoài khung giờ an toàn. Vui lòng chọn lại.'},400);const order=b.order?Object.fromEntries(['agencyName','taxId','email','phone','address','owner','ownerAddress','flag','imo','callSign','shipType','gt','beam','notes'].map(key=>[key,String(b.order[key]||'').trim().slice(0,key==='notes'?1000:200)])):null;if(order&&(!order.agencyName||!order.email||!order.phone||!order.address))return reply({error:'Bổ sung thông tin liên hệ của phiếu yêu cầu.'},400);const t={order,id:crypto.randomUUID(),code:'CM-'+date.slice(5).replace('-','')+'-'+crypto.randomUUID().slice(0,4).toUpperCase(),name:String(b.name).trim().slice(0,80),draft,draftFront:Number(b.draftFront)||draft,draftAft:Number(b.draftAft)||draft,dwt:Number(b.dwt)||70000,loa:Number(b.loa)||172,date,time,port,from:b.from||'P/S3',direction:b.direction||'in',agency:user.role==='agency'?user.id:'',status:'draft',consult:'',assigned:'',response:'',proposed:'',note:'',events:[{text:'Đã chọn giờ '+time+' trong khung an toàn · Gửi yêu cầu điều độ',by:user.name,at:Date.now()}]};await db.prepare('INSERT INTO trips(id,data,revision) VALUES(?,?,0)').bind(t.id,JSON.stringify(t)).run();return reply({ok:true,id:t.id})}
if(b.action==='broadcast'){
 if(user.role!=='dispatch')return reply({error:'Không có quyền phát cảnh báo.'},403);
 const content=String(b.content||'').trim().slice(0,500);if(!content)return reply({error:'Nhập nội dung cảnh báo.'},400);
 const rows:any=await db.prepare('SELECT * FROM trips').all();let sent=0;
 for(const r of rows.results){const v=JSON.parse(r.data);if(!v.assigned||['completed','cancelled'].includes(v.status))continue;const alert={id:crypto.randomUUID(),category:'weather',level:'Cảnh báo',title:'Điều kiện khu vực · '+String(b.zone||'Toàn cảng'),detail:content,status:'new',at:Date.now(),by:user.name};v.alerts=[...(v.alerts||[]),alert].slice(-100);v.events.push({text:'Điều độ phát cảnh báo khu vực',by:user.name,at:Date.now()});const x:any=await db.prepare('UPDATE trips SET data=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(v),v.id,r.revision).run();if(x.meta.changes)sent++}
 return reply({ok:true,sent});
}
const row:any=await db.prepare('SELECT * FROM trips WHERE id=?').bind(b.id).first();if(!row)return reply({error:'Không tìm thấy chuyến.'},404);if(b.action==='trip_history'){const data=JSON.parse(row.data);if(!(user.role==='dispatch'||user.role==='pilot'&&data.assigned===user.id))return reply({error:'Không có quyền xem hành trình.'},403);return reply({track:data.track||[],scenarios:data.scenarios||[],alerts:data.alerts||[],events:data.events||[]})}if(row.revision!==b.revision)return reply({error:'Chuyến vừa được cập nhật. Vui lòng thử lại.'},409);const t=JSON.parse(row.data),previousTime=t.time;let text='';
if(!canReadTrip(t,user))return reply({error:'Bạn không có quyền truy cập chuyến này.'},403);
if(['completed','cancelled'].includes(t.status)&&!['feedback','feedback_review','message','append_note'].includes(b.action))return reply({error:'Hồ sơ đã đóng; chỉ được bổ sung ghi chú và đánh giá.'},403);
const isSafe=(time:string)=>Number.isFinite(minutes(time||''))&&conditions(time,t.draft,t.date||'2026-10-16',t.direction==='out'?t.from:t.port).safe&&safeWindows(t.date||'2026-10-16',t.draft,t.direction==='out'?t.from:t.port).some(w=>minutes(time)>=w.start&&minutes(time)<=w.end);
const mutationActions=['edit_trip','cancel_trip','reassign','incident_hold','incident_resume','append_note'];
if(mutationActions.includes(b.action)){
 const reason=String(b.reason||'').trim().slice(0,1000);if(!reason)return reply({error:'Nhập lý do hoặc nội dung ghi chú.'},400);
 if(b.action==='append_note'){t.notes=[...(t.notes||[]),{id:crypto.randomUUID(),text:reason,by:user.name,at:Date.now()}];text='Bổ sung ghi chú · '+reason}
 if(b.action==='edit_trip'){
  if(!canEditTrip(t,user))return reply({error:'Không được sửa kế hoạch ở trạng thái hiện tại.'},403);
  const v=b.values||{},draftFront=Number(v.draftFront),draftAft=Number(v.draftAft),draft=Math.max(draftFront,draftAft),loa=Number(v.loa),gt=Number(v.gt);
  if(!String(v.name||'').trim()||!validDate(v.date)||!Number.isFinite(minutes(v.time||''))||![draftFront,draftAft].every(x=>Number.isFinite(x)&&x>=1&&x<=20)||!Number.isFinite(loa)||loa<=0||!Number.isFinite(gt)||gt<=0||!String(v.from||'').trim()||!String(v.port||'').trim()||v.from===v.port||!['in','out'].includes(v.direction))return reply({error:'Kiểm tra tên tàu, tuyến, ngày giờ, LOA, GT và mớn nước.'},400);
  if(!conditions(v.time,draft,v.date,v.direction==='out'?v.from:v.port).safe)return reply({error:'Giờ mới nằm ngoài khung đủ nước.'},400);
  const before={name:t.name,date:t.date,time:t.time,from:t.from,port:t.port,draft:t.draft,loa:t.loa,gt:t.order?.gt||t.gt,assigned:t.assigned,consult:t.consult,status:t.status};
  t.previousPilots=[...new Set([...(t.previousPilots||[]),t.assigned,t.consult].filter(Boolean))];
  Object.assign(t,{name:String(v.name).trim().slice(0,80),date:v.date,time:v.time,from:String(v.from).slice(0,100),port:String(v.port).slice(0,100),direction:v.direction,draftFront,draftAft,draft,loa,gt,status:'draft',assigned:'',consult:'',proposed:'',response:'',note:'',review:null,authority:null,device:null,changeRequest:null,pickupPlanAckKey:null,allocationStart:null,allocationEnd:null});
  t.order={...(t.order||{}),gt:String(gt)};
  t.edits=[...(t.edits||[]),{before,reason,at:Date.now(),by:user.name}];text='Sửa kế hoạch · Cần kiểm tra và chốt lại · '+reason;
 }
 if(b.action==='cancel_trip'){
  if(!canCancelTrip(t,user))return reply({error:'Không có quyền hủy chuyến ở trạng thái này. Chuyến đang dẫn cần phối hợp xử lý sự cố.'},403);
  t.cancelled={by:user.name,at:Date.now(),reason,previousStatus:t.status};t.status='cancelled';t.allocationStart=null;t.allocationEnd=null;text='Hủy chuyến · '+reason;
 }
 if(b.action==='reassign'){
  if(user.role!=='dispatch'||t.status!=='assigned')return reply({error:'Chỉ điều độ được đổi hoa tiêu trước khi xuất phát.'},403);
  if(t.authority?.status!=='approved')return reply({error:'Cần ghi nhận cảng vụ chấp thuận.'},400);
  const why=pilotEligibility(t,b.person,true);if(why||b.person===t.assigned)return reply({error:why||'Chọn hoa tiêu khác.'},400);
  t.previousPilots=[...new Set([...(t.previousPilots||[]),t.assigned].filter(Boolean))];t.assigned=b.person;t.device=null;t.pickupPlanAckKey=null;t.changeRequest=null;text='Đổi hoa tiêu → '+people[b.person].name+' · '+reason;
 }
 if(['incident_hold','incident_resume'].includes(b.action)){
  if(user.role!=='dispatch'||!['assigned','departed','sailing'].includes(t.status))return reply({error:'Chỉ điều độ được ghi nhận xử lý sự cố trong chuyến hoạt động.'},403);
  if(b.action==='incident_resume'&&!t.incident?.active)return reply({error:'Không có sự cố đang mở.'},400);
  t.incident={active:b.action==='incident_hold',reason,by:user.name,at:Date.now()};text=(b.action==='incident_hold'?'Yêu cầu phối hợp xử lý sự cố · ':'Ghi nhận đã phối hợp xử lý sự cố · ')+reason;
 }
}
if(user.role==='dispatch'){
if(b.action==='complete_specs'&&!t.assigned){if(!(Number(b.loa)>0)||!Number.isFinite(Number(b.loa))||!(Number(b.gt)>0)||!Number.isFinite(Number(b.gt)))return reply({error:'LOA và GT phải là số dương.'},400);if(!(Number(t.loa)>0))t.loa=Number(b.loa);if(!(Number(t.order?.gt||t.gt)>0))t.gt=Number(b.gt);text='Bổ sung LOA / GT còn thiếu từ hồ sơ tàu'}
if(b.action==='operational_ack'&&t.operationalRequest?.status==='pending'){t.operationalRequest={...t.operationalRequest,status:'ack',by:user.name,ackAt:Date.now()};text='Điều độ ghi nhận phối hợp phương án qua VHF'}
if(b.action==='feedback_review'&&t.status==='completed'&&['verified','rejected'].includes(b.decision)){t.feedbackReview={decision:b.decision,by:user.name,at:Date.now()};text='PACS Review · '+(b.decision==='verified'?'Đã xác minh phản hồi':'Cần xem lại phản hồi')}
if(b.action==='review_request'){
 const r=t.changeRequest?.status==='pending'?t.changeRequest:null;
 if(!r&&t.status!=='consulted')return reply({error:'Không có yêu cầu chờ xử lý.'},400);
 if(!['approve','reject'].includes(b.decision))return reply({error:'Chọn duyệt hoặc từ chối.'},400);
 const proposed=r?r.time:t.proposed;if(b.decision==='approve'&&!isSafe(proposed))return reply({error:'Giờ đề xuất không đủ nước.'},400);
 if(r){r.status=b.decision==='approve'?'approved':'rejected';r.reviewedAt=Date.now();if(b.decision==='approve'){t.time=r.time;t.authority={status:'pending',reason:'Thay đổi giờ · cần xác nhận lại'};if(t.device)t.device.ready=false}}
 else{t.review={decision:b.decision,at:Date.now()};if(b.decision==='reject')t.proposed=t.time}
 text=(b.decision==='approve'?'Duyệt':'Từ chối')+' đề xuất đổi giờ · '+proposed;
}
if(b.action==='request_counter'&&t.changeRequest?.status==='pending'){
 if(!isSafe(b.time))return reply({error:'Giờ đề xuất lại không đủ nước.'},400);t.changeRequest={...t.changeRequest,status:'counter',counter:b.time,counterNote:String(b.note||'').slice(0,500)};text='Điều độ đề xuất lại giờ '+b.time;
}
if(['consult','assign'].includes(b.action)){const reason=pilotEligibility(t,b.person,b.action==='assign');if(reason)return reply({error:reason+' · Đối chiếu chứng chỉ; không phải quy định pháp lý.'},400)}
if(b.action==='authority_submit'&&['confirmed','assigned','departed'].includes(t.status)){t.authority={status:'pending',submittedAt:Date.now()};text='Ghi nhận đã gửi hồ sơ ngoài PACS · Chờ cảng vụ'}
if(b.action==='authority_result'&&['confirmed','assigned','departed'].includes(t.status)&&t.authority?.status==='pending'){if(!['approved','rejected'].includes(b.decision)||!String(b.reference||'').trim())return reply({error:'Nhập số văn bản / căn cứ kết quả cảng vụ.'},400);t.authority={...t.authority,status:b.decision,reference:String(b.reference).slice(0,200),at:Date.now(),by:user.name};text='Ghi nhận kết quả cảng vụ: '+b.decision}
if(b.action==='consult'&&['draft','consulted'].includes(t.status)&&people[b.person]?.role==='pilot'){t.consult=b.person;t.status='consulting';t.response='';t.proposed='';t.review=null;text='Gửi xin ý kiến → '+people[b.person].name}
if(b.action==='confirm'&&['draft','consulted'].includes(t.status)&&!(t.status==='draft'&&t.draft>10)){const expected=t.review?.decision==='reject'?t.time:t.proposed||t.time;const time=b.time||expected;if(time!==expected)return reply({error:'Điều độ chỉ xác nhận giờ đại lý hoặc giờ đã được hoa tiêu đề xuất.'},400);if(!isSafe(time))return reply({error:'Giờ chốt không nằm trong khung an toàn.'},400);t.time=time;t.status='confirmed';text='Chốt lịch chính thức '+t.time}
if(b.action==='assign'&&t.status==='confirmed'&&people[b.person]?.role==='pilot'){if(t.authority?.status!=='approved')return reply({error:'Cần ghi nhận cảng vụ chấp thuận trước khi phân công.'},400);t.assigned=b.person;t.status='assigned';t.device=null;text='Phân công dẫn tàu → '+people[b.person].name}
}else if(user.role==='pilot'){
if(b.action==='respond'&&t.consult===user.id&&t.status==='consulting'){const time=b.response==='agree'?t.time:b.time;if(!isSafe(time))return reply({error:'Giờ đề xuất không nằm trong khung an toàn.'},400);t.response=b.response==='agree'?'Đồng ý giờ đề xuất':'Đề xuất giờ khác';t.proposed=time;t.note=String(b.note||'').slice(0,1000);t.status='consulted';t.review=null;text=t.response+' · '+t.proposed}
if(t.assigned===user.id){
if(['device_check','depart','start','request_change'].includes(b.action)&&t.pickupPlanAckKey!==pickupPlanKey(t))return reply({error:'Xem và xác nhận phương án đón T−2 trước khi tiếp tục.'},400);
if(b.action==='operational_request'&&['assigned','departed','sailing'].includes(t.status)){if(!['shift','side','hold'].includes(b.kind)||!String(b.note||'').trim()||t.operationalRequest?.status==='pending')return reply({error:'Kiểm tra loại phương án, lý do hoặc yêu cầu đang chờ.'},400);t.operationalRequest={kind:b.kind,note:String(b.note).slice(0,1000),status:'pending',at:Date.now(),by:user.name};text='Hoa tiêu yêu cầu phối hợp phương án · '+b.kind}
if(b.action==='pickup_plan_ack'&&stages.includes(t.status)){t.pickupPlanAckKey=pickupPlanKey(t);t.pickupPlanSeenAt=Date.now();text='Đã xem phương án đón T−2'}
if(b.action==='device_scenario'&&stages.includes(t.status)){const previous=t.device||{};t.device={...previous,ready:false,checkedAt:null,aisFailure:!!b.aisFailure,offline:!!b.offline,results:null};text='Thiết bị · '+(b.aisFailure?'Lỗi AIS':b.offline?'Mất kết nối cloud':'Đặt lại kịch bản')}
if(b.action==='device_backup'&&stages.includes(t.status)){t.device={ready:false,unit:'P-08',backup:true,aisFailure:false,offline:!!t.device?.offline};text='Chuyển thiết bị dự phòng P-08 · Cần kiểm tra lại'}
if(b.action==='device_report'&&stages.includes(t.status)){t.device={...t.device,ready:false,reported:true};text='Báo lỗi thiết bị cho điều độ · Chờ xử lý'}
if(b.action==='device_check'&&stages.includes(t.status)){const d=t.device||{},failed=d.aisFailure,results=['Đã kết nối','HPE 6,2 m',failed?'Không nhận tín hiệu':'Đang thu tín hiệu','Chưa cấu hình','Đã sẵn sàng','Đã lưu offline','86% · Ổn định',d.offline?'Mất kết nối · Đã có bản offline':'Đã đồng bộ'];t.device={...d,ready:!failed,checkedAt:Date.now(),results,reported:false,unit:d.unit||'P-07'};text=failed?'Kiểm tra thiết bị không đạt · AIS không có tín hiệu':'Kiểm tra thiết bị đạt · '+t.device.unit}
if(b.action==='depart'&&t.status==='assigned'){if(!t.device?.ready)return reply({error:'Cần kiểm tra thiết bị đạt trước khi xuất phát.'},400);t.status='departed';text='Đã rời trạm lên cano · Chưa lên tàu'}
if(b.action==='start'&&t.status==='departed'){if(t.authority&&t.authority.status!=='approved')return reply({error:'Lịch đã đổi; cần điều độ ghi nhận lại kết quả cảng vụ.'},400);if(!t.device?.ready)return reply({error:'Thiết bị chưa sẵn sàng.'},400);t.status='sailing';t.started=Date.now();text='Bắt đầu dẫn tàu'}
if(b.action==='finish'&&t.status==='sailing'){if(b.frame)t.track=appendTrack(t.track,sanitizeTrackFrame(b.frame));t.status='completed';t.finished=Date.now();text='Kết thúc chuyến'}
if(b.action==='feedback'&&t.status==='completed'){const entries=Object.entries(b.reviews||{});if(entries.some(([id,r]:any)=>!(t.alerts||[]).some((a:any)=>a.id===id)||!['accurate','partial','incorrect'].includes(r?.rating)))return reply({error:'Chọn đánh giá hợp lệ cho các khuyến nghị của chuyến.'},400);t.feedback=String(b.note||'').slice(0,1000);if(b.reviews)t.recommendationReviews=Object.fromEntries(entries.map(([id,r]:any)=>[id,{rating:r.rating,note:String(r.note||'').slice(0,1000),at:Date.now(),by:user.id}]));text='Lưu đánh giá khuyến nghị sau chuyến'}
}}
if(b.action==='message'){
 const target=user.role==='dispatch'?b.pilot:user.id;
 if((user.role==='dispatch'||user.role==='pilot')&&[t.consult,t.assigned].includes(target)&&target){const content=String(b.content||'').trim().slice(0,2000);if(!content)return reply({error:'Nhập nội dung tin nhắn.'},400);t.messages=[...(t.messages||[]),{id:crypto.randomUUID(),pilot:target,sender:user.id,name:user.name,content,at:Date.now()}].slice(-200);text='Tin nhắn mới · '+user.name}
}
if(user.role==='pilot'&&t.assigned===user.id){
 if(b.action==='request_change'&&['assigned','departed'].includes(t.status)){
  if(t.changeRequest&&['pending','counter'].includes(t.changeRequest.status))return reply({error:'Đang có đề xuất chờ xử lý.'},400);if(!isSafe(b.time)||!String(b.note||'').trim())return reply({error:'Chọn giờ đủ nước và nhập lý do.'},400);t.changeRequest={id:crypto.randomUUID(),time:b.time,note:String(b.note).slice(0,1000),status:'pending',at:Date.now(),pilot:user.id};text='Hoa tiêu đề nghị đổi giờ sang '+b.time;
 }
 if(b.action==='request_accept_counter'&&t.changeRequest?.status==='counter'){if(!isSafe(t.changeRequest.counter))return reply({error:'Giờ đề xuất lại không còn trong khung đủ nước.'},400);t.changeRequest={...t.changeRequest,time:t.changeRequest.counter,status:'pending'};text='Hoa tiêu đồng ý giờ điều độ đề xuất · Chờ duyệt'}
 if(b.action==='track_append'&&t.status==='sailing'){const frame=sanitizeTrackFrame(b.frame);if(!frame)return reply({error:'Khung hành trình không hợp lệ.'},400);const before=t.track||[],next=appendTrack(before,frame);if(next===before)return reply({ok:true,deduplicated:true});t.track=next;const updated:any=await db.prepare('UPDATE trips SET data=?,revision=revision+1 WHERE id=? AND revision=?').bind(JSON.stringify(t),t.id,row.revision).run();return updated.meta.changes?reply({ok:true}):reply({error:'Chuyến vừa cập nhật; thử lại.'},409)}
 if(b.action==='scenario_log'&&t.status==='sailing'&&['crossing','wind','crosswind','current','visibility','overtaking','combined','ukc','ais','stop','reset'].includes(b.scenario)){t.scenarios=[...(t.scenarios||[]),{id:crypto.randomUUID(),kind:b.scenario,at:Date.now(),by:user.id}].slice(-100);text='Tình huống · '+({crossing:'Tàu cắt ngang',wind:'Gió giật tăng',crosswind:'Gió ngang khi đón',current:'Dòng ngang tăng',visibility:'Tầm nhìn giảm',overtaking:'Tàu phía sau vượt lên',combined:'Gió giật + tàu cắt ngang',ukc:'Mực nước giảm / UKC hạn chế',ais:'AIS gián đoạn',stop:'Dừng tình huống',reset:'Đặt lại tình huống'} as any)[b.scenario]}
 if(b.action==='alert_add'&&t.status==='sailing'){
  const category=['collision','ukc','weather'].includes(b.category)?b.category:'system',tag=String(b.tag||category).slice(0,100),last=(t.alerts||[]).find((a:any)=>a.tag===tag&&Date.now()-a.at<180000);if(last)return reply({ok:true,deduplicated:true});t.alerts=[...(t.alerts||[]),{id:crypto.randomUUID(),category,tag,title:String(b.title||'Cảnh báo hành trình').slice(0,150),detail:String(b.detail||'').slice(0,700),level:String(b.level||'Cảnh báo').slice(0,40),status:'new',at:Date.now(),recommendation:String(b.recommendation||b.detail||'').slice(0,700)}].slice(-100);text='Cảnh báo '+category+' · '+String(b.title||'');
 }
}
if(b.action==='alert_status'&&(user.role==='dispatch'||(user.role==='pilot'&&t.assigned===user.id))){
 const a=(t.alerts||[]).find((a:any)=>a.id===b.alertId||(b.title&&a.title===b.title));if(a&&['ack','resolved'].includes(b.status)){if(a.status===b.status)return reply({ok:true,deduplicated:true});a.history=[...(a.history||[]),{status:b.status,at:Date.now(),by:user.name}].slice(-30);a.status=b.status;a.updatedAt=Date.now();a.updatedBy=user.name;text=(b.status==='ack'?'Đã xác nhận':'Đã xử lý')+' cảnh báo · '+a.title}
}
if(!text)return reply({error:'Thao tác không hợp lệ với quyền hoặc trạng thái chuyến.'},403);let reservation:any=null;if(t.assigned&&!['completed','cancelled'].includes(t.status)&&(b.action==='assign'||b.action==='reassign'||t.time!==previousTime)){const rows:any=await db.prepare('SELECT * FROM trips').all();const conflicts=assignmentConflicts(rows.results.map((r:any)=>JSON.parse(r.data)),t,t.assigned);if(conflicts.length)return reply({error:'Hoa tiêu trùng lịch với '+conflicts.map((v:any)=>v.name+' · '+v.time).join(', ')+'. Trùng khoảng giờ dẫn tàu dự kiến.',conflicts:conflicts.map((v:any)=>v.id)},409);reservation=assignmentWindow(t);t.allocationStart=reservation.start;t.allocationEnd=reservation.end}
 t.events.push({text,by:user.name,at:Date.now()});const guard=reservation?" AND NOT EXISTS(SELECT 1 FROM trips AS other WHERE other.id<>? AND json_extract(other.data,'$.assigned')=? AND json_extract(other.data,'$.status') IN ('assigned','departed','sailing') AND ROUND((julianday(json_extract(other.data,'$.date')||'T'||json_extract(other.data,'$.time')||':00+07:00')-2440587.5)*86400000)<? AND (ROUND((julianday(json_extract(other.data,'$.date')||'T'||json_extract(other.data,'$.time')||':00+07:00')-2440587.5)*86400000)+(CASE (CASE WHEN json_extract(other.data,'$.direction')='out' THEN json_extract(other.data,'$.from') ELSE json_extract(other.data,'$.port') END) WHEN 'SSIT' THEN 105 WHEN 'Thị Vải' THEN 140 ELSE 90 END)*60000)>?)":"";const params=reservation?[t.id,t.assigned,reservation.end,reservation.start]:[];const updated:any=await db.prepare('UPDATE trips SET data=?,revision=revision+1 WHERE id=? AND revision=?'+guard).bind(JSON.stringify(t),t.id,row.revision,...params).run();if(!updated.meta.changes)return reply({error:reservation?'Lịch vừa thay đổi hoặc hoa tiêu đã được phân công trùng giờ. Chọn lại người thực hiện.':'Có cập nhật đồng thời, vui lòng thử lại.'},409);return reply({ok:true});
}catch(e){return reply({error:'Không thể kết nối hệ thống. Vui lòng thử lại.'},500)}}

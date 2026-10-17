// Finish from a fresh server revision after the telemetry writer has drained.
export async function completeVoyage({tripId,frame,load,send}:{tripId:string;frame:any;load:()=>Promise<any[]>;send:(body:any)=>Promise<any>}){
 for(let attempt=0;attempt<3;attempt++){
  const trip=(await load()).find(t=>t.id===tripId);
  if(!trip)throw Error('Không tìm thấy chuyến. Tải lại lịch để kiểm tra.');
  if(trip.status==='completed')return trip;
  if(trip.status!=='sailing')throw Error('Chỉ hoàn tất được chuyến đang dẫn tàu.');
  try{await send({action:'finish',id:tripId,revision:trip.revision,frame});return {...trip,status:'completed',finished:Date.now(),revision:trip.revision+1}}
  catch(error:any){if(error.status!==409||attempt===2)throw error}
 }
 throw Error('Chưa hoàn tất được chuyến. Vui lòng thử lại.');
}

export const planningStages=['draft','consulting','consulted','confirmed','assigned'];
export function canReadTrip(t:any,u:any){return u.role==='dispatch'||u.role==='agency'&&t.agency===u.id||u.role==='pilot'&&(t.consult===u.id||t.assigned===u.id||(t.previousPilots||[]).includes(u.id))}
export function canEditTrip(t:any,u:any){return u.role==='dispatch'&&planningStages.includes(t.status)||u.role==='agency'&&t.agency===u.id&&['draft','consulting','consulted'].includes(t.status)}
export function canCancelTrip(t:any,u:any){return u.role==='dispatch'&&[...planningStages,'departed'].includes(t.status)||u.role==='agency'&&t.agency===u.id&&['draft','consulting','consulted'].includes(t.status)}

// One reading interval across all categories; only a higher severity can interrupt it.
class PacsAlertPolicy {
 constructor(readMs=60000,startupMs=0){this.readMs=readMs;this.notBefore=startupMs>0?Date.now()+startupMs:-Infinity;this.reset()}
 reset(){this.lastAt=null;this.lastPriority=0;this.lastCategory='';this.current=null;this.queue=new Map();this.seen=new Map()}
 acknowledge(){this.current=null}
 offer(event,now=Date.now()){
  const priority=event.immediate?3:event.level==='Nguy hiểm cao'?2:1,key=event.tag+'|'+priority,seenAt=this.seen.get(key);
  if(seenAt!==undefined&&now-seenAt<180000)return null;
  this.seen.set(key,now);for(const [key,at] of this.seen)if(now-at>600000)this.seen.delete(key);
  const item={...event,priority,at:now},group=event.category==='collision'?'collision':event.tag;
  if((priority>=2||now>=this.notBefore)&&(this.lastAt===null||priority>this.lastPriority||priority===3&&this.current?.tag!==event.tag))return this.present(item,now);
  const old=this.queue.get(group);if(!old||priority>old.priority||priority===old.priority&&(item.rank??Infinity)<=(old.rank??Infinity))this.queue.set(group,item);
  return null;
 }
 present(item,now){this.lastAt=now;this.lastPriority=item.priority;this.lastCategory=item.category;this.current=item;this.queue.delete(item.category==='collision'?'collision':item.tag);return item}
 next(now=Date.now(),relevant=()=>true){
  for(const [key,item] of this.queue)if(now-item.at>180000||!relevant(item))this.queue.delete(key);
  if(this.lastAt!==null&&now-this.lastAt<this.readMs)return null;
  const items=[...this.queue.values()].filter(item=>(item.priority>=2||now>=this.notBefore)&&!(this.current?.priority>=2&&item.priority<this.current.priority)).sort((a,b)=>b.priority-a.priority||(a.category===this.lastCategory)-(b.category===this.lastCategory)||a.at-b.at);
  return items.length?this.present(items[0],now):null;
 }
}
globalThis.PacsAlertPolicy=PacsAlertPolicy;

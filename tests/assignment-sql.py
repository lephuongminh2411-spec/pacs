import sqlite3,json,re,datetime
source=open('app/api/pacs/route.ts').read();guard=json.loads('"'+re.search(r'const guard=reservation\?"(.*?)":"";',source).group(1)+'"');db=sqlite3.connect(':memory:');db.execute('create table trips(id text primary key,data text,revision integer default 0)')
def instant(t):return int(datetime.datetime.fromisoformat(t['date']+'T'+t['time']+':00+07:00').timestamp()*1000)
def window(t):return instant(t),instant(t)+105*60000
def store(t):db.execute('insert or replace into trips values(?,?,0)',(t['id'],json.dumps(t)))
def assign(t):
 start,end=window(t);updated={**t,'assigned':'hoatieu.b','status':'assigned','allocationStart':start,'allocationEnd':end};return db.execute('UPDATE trips SET data=?,revision=revision+1 WHERE id=? AND revision=?'+guard,(json.dumps(updated),t['id'],0,t['id'],'hoatieu.b',end,start)).rowcount
base={'date':'2026-10-18','time':'14:00','port':'SSIT','direction':'in','draft':8.5,'assigned':'','status':'confirmed'}
store({**base,'id':'one'});store({**base,'id':'two'});assert assign({**base,'id':'one'})==1;assert assign({**base,'id':'two'})==0
# Existing pre-upgrade trip uses its date/time/port when reservation fields are absent.
db.execute('delete from trips');store({**base,'id':'old','assigned':'hoatieu.b','status':'assigned'});touch={**base,'id':'touch','time':'15:45'};store(touch);assert assign(touch)==1
# Adjacent calendar days still overlap.
db.execute('delete from trips');store({**base,'id':'old','assigned':'hoatieu.b','status':'assigned','date':'2026-10-17','time':'23:00'});new={**base,'id':'next','time':'00:30'};store(new);assert assign(new)==0
print('PASS: atomic SQLite assignment guard prevents overlapping writes, permits exact buffer boundaries, supports existing trips and checks midnight overlaps.')

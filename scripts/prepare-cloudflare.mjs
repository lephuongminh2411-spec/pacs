import {readFileSync,writeFileSync} from 'node:fs';
const file='wrangler.json',config=JSON.parse(readFileSync(file,'utf8'));
const id=process.env.PACS_DATABASE_ID||config.d1_databases?.find(d=>d.binding==='DB')?.database_id;
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'')){
 console.error('Thieu PACS_DATABASE_ID. Tao D1 pacs-pilot-db, chay schema.sql trong D1 Console, roi dat Database ID vao bien build PACS_DATABASE_ID. Khong can API token trong code.');process.exit(1);
}
config.d1_databases=[{binding:'DB',database_name:'pacs-pilot-db',database_id:id}];
writeFileSync(file,JSON.stringify(config,null,2)+'\n');
console.log('Da cau hinh D1 binding DB.');

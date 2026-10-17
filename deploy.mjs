import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('.',import.meta.url)));
process.env.WRANGLER_SEND_METRICS='false';
const configPath='wrangler.json',config=JSON.parse(readFileSync(configPath,'utf8'));
const wrangler='node_modules/wrangler/bin/wrangler.js';
function run(script,args,{capture=false}={}){
 const result=spawnSync(process.execPath,[script,...args],{stdio:capture?['inherit','pipe','inherit']:'inherit',encoding:'utf8',env:process.env});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error('Buoc trien khai that bai. Khong tu dong chuyen sang goi tra phi.');
 return result.stdout;
}
try{
 if(!existsSync(wrangler))throw Error('Hay chay: npx --yes pnpm@11.25.0 install --frozen-lockfile');
 if(!process.env.CLOUDFLARE_API_TOKEN)run(wrangler,['login']);
 run(wrangler,['whoami']);
 const dbName='pacs-pilot-db';
 function databases(){return JSON.parse(run(wrangler,['d1','list','--json'],{capture:true}))}
 let database=databases().find(d=>d.name===dbName);
 if(!database){run(wrangler,['d1','create',dbName,'--location','apac','--update-config=false']);database=databases().find(d=>d.name===dbName)}
 if(!database?.uuid)throw Error('Khong tim thay D1. Kiem tra tai khoan Cloudflare dang chon.');
 config.d1_databases=[{binding:'DB',database_name:dbName,database_id:database.uuid}];
 writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
 run(wrangler,['d1','execute',dbName,'--remote','--file','schema.sql','--yes','--config',configPath]);
 run('node_modules/vinext/dist/cli.js',['build']);
 run(wrangler,['deploy','--config','dist/server/wrangler.json']);
 console.log('\nDA TRIEN KHAI. Mo dia chi workers.dev that hien o tren.');
}catch(error){console.error('\n'+error.message);process.exitCode=1}

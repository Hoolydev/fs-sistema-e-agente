// Homologação explícita de uma consulta por CNPJ; nunca repete automaticamente.
import { readFile, mkdir, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { request } from 'node:https';
import { isValidCnpj } from '../dist/src/orchestrator/parser.js';
const args = process.argv.slice(2);
const option = k => args.includes(k) ? args[args.indexOf(k)+1] : undefined;
const cnpj=option('--cnpj'),runId=option('--run-id');
if(!cnpj||!isValidCnpj(cnpj)||!/^[a-zA-Z0-9_-]{6,100}$/.test(runId??'')) process.exit(2);
const folder=join('/app/data/homologacao',runId);
await mkdir(folder,{recursive:true,mode:0o700});
const guard=await open(join(folder,'started.json'),'wx',0o600).catch(()=>null);
if(!guard){console.error('Run-id já iniciado; revisar antes de nova chamada.');process.exit(2);}
await guard.writeFile(JSON.stringify({cnpj,startedAt:new Date().toISOString()}));await guard.close();
const requestJson=(url,method,headers,body='')=>new Promise((resolve,reject)=>{
 const r=request(url,{method,headers,rejectUnauthorized:true,signal:AbortSignal.timeout(60000)},res=>{
  let size=0;const chunks=[];
  res.on('data',c=>{size+=c.length;if(size>20*1024*1024)r.destroy();else chunks.push(c);});
  res.on('error',()=>reject(new Error('response_interrupted')));
  res.on('end',()=>{const raw=Buffer.concat(chunks);let data;try{data=JSON.parse(raw.toString('utf8'));}catch{data=null;}resolve({status:res.statusCode,raw,data});});
 });r.on('error',()=>reject(new Error('network_error')));r.end(body);
});
let result;
try{
 const key=(await readFile('/run/serpro-divida/consumer-key','utf8')).trim(),secret=(await readFile('/run/serpro-divida/consumer-secret','utf8')).trim();
 const auth=await requestJson('https://gateway.apiserpro.serpro.gov.br/token','POST',{Authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},'grant_type=client_credentials');
 if(auth.status!==200||typeof auth.data?.access_token!=='string')throw new Error('authentication_failed');
 const response=await requestJson(`https://gateway.apiserpro.serpro.gov.br/consulta-divida-ativa-df/api/v1/devedor/${cnpj}`,'GET',{Authorization:`Bearer ${auth.data.access_token}`,Accept:'application/json','X-Request-Tag':runId.slice(0,32)});
 await writeFile(join(folder,'devedor.json'),response.raw,{mode:0o600,flag:'wx'});
 const rows=response.data;
 const arrayValid=Array.isArray(rows)&&rows.every(r=>r&&typeof r==='object'&&String(r.cpfCnpj??'').replace(/\D/g,'')===cnpj&&typeof r.numeroInscricao==='string');
 const ids=arrayValid?rows.map(r=>r.numeroInscricao):[];
 const unique=arrayValid&&new Set(ids).size===ids.length;
 result={ok:response.status===200&&arrayValid&&unique,runId,cnpj,status:response.status,bytes:response.raw.length,cnpjVerified:arrayValid,uniqueInscriptions:unique?ids.length:null};
}catch{result={ok:false,runId,cnpj,code:'authentication_network_or_processing_failed'};}
await writeFile(join(folder,'result.json'),JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});
console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const base=process.env.FS_CONNECTOR_HOME||join(homedir(),'Documents/ChatGPT/FS Soluções Tributarias/conector-local');
const [cmd,arg]=process.argv.slice(2);
let path='/status', method='GET', data:unknown;
if(cmd==='abrir'){path='/session/open';method='POST';}
else if(cmd==='login'){path='/session/login';method='POST';}
else if(cmd==='analisar'||cmd==='coletar'){path='/jobs';method='POST';data={cnpj:(arg||'').replace(/[.\/-]/g,''),operation:cmd};}
else if(cmd==='pedido'&&arg){path=`/jobs/${encodeURIComponent(arg)}`;}
else if(cmd==='retomar'&&arg){path=`/jobs/${encodeURIComponent(arg)}/resume`;method='POST';}
else if(cmd && cmd!=='status'){console.error('Uso: fs-conector status | abrir | login | coletar CNPJ | analisar CNPJ | pedido ID | retomar ID');process.exit(1);}
try {
const token=(await readFile(join(base,'secrets/local-token'),'utf8')).trim();
const r=await fetch(`http://127.0.0.1:18765${path}`,{method,headers:{authorization:`Bearer ${token}`,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
console.log(JSON.stringify(await r.json(),null,2));if(!r.ok)process.exit(1);
}catch {console.error('Conector indisponível. Verifique o agente local do macOS.');process.exit(1);}

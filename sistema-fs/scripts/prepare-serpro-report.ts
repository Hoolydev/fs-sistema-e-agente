import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reportFromSerpro } from '../lib/diagnostico/serpro-evidence';
// Operates exclusively on already-collected evidence; never calls a fiscal API.
try {
 const args=process.argv.slice(2), options=new Map<string,string>();
 for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1]||options.has(args[i]))throw new Error('INVALID_ARGS');options.set(args[i],args[i+1]);}
 const required=['cnpj','rfb-text','rfb-pdf','pgfn-json','collected-at','report-id','version','output'];
 if(options.size!==required.length||required.some(k=>!options.has(`--${k}`)))throw new Error('INVALID_ARGS');
 const get=(key:string)=>options.get(`--${key}`)!;
 const rfb=readFileSync(get('rfb-pdf')), pgfn=readFileSync(get('pgfn-json'));
 if(rfb.subarray(0,5).toString()!=='%PDF-')throw new Error('INVALID_PDF');
 const hash=(buffer:Buffer)=>createHash('sha256').update(buffer).digest('hex');
 const report=reportFromSerpro({cnpj:get('cnpj'),rfbText:readFileSync(get('rfb-text'),'utf8'),pgfn:JSON.parse(pgfn.toString('utf8')),collectedAt:get('collected-at'),rfbHash:hash(rfb),pgfnHash:hash(pgfn),reportId:get('report-id'),version:Number(get('version'))});
 writeFileSync(get('output'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
 console.log('DiagnosticReport FS preparado. Conferir conciliação e apresentação antes de arquivar.');
} catch {
 console.error('Preparação interrompida. Confira layout, identidade, valores e argumentos --cnpj --rfb-text --rfb-pdf --pgfn-json --collected-at --report-id --version --output. A saída não será sobrescrita.');process.exitCode=1;
}

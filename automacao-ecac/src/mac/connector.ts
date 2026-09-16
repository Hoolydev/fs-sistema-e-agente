import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, readdir, rename, writeFile, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import Fastify from 'fastify';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { z } from 'zod';
import { isValidCnpj } from '../orchestrator/parser.js';
import { authenticateWithDigitalCertificate, switchToCorporateProxyProfile } from '../rpa/ecac-playwright.js';
import { HumanInterventionRequired } from '../rpa/automation.js';

export const jobInput = z.object({
  cnpj: z.string().regex(/^\d{14}$/).refine(isValidCnpj),
  operation: z.enum(['coletar', 'analisar']).default('analisar'),
}).strict();
export function tokenMatches(received: string, expected: string): boolean {
  const a=Buffer.from(received), b=Buffer.from(expected);
  return a.length===b.length && b.length>0 && timingSafeEqual(a,b);
}
const base=process.env.FS_CONNECTOR_HOME || join(homedir(),'Documents/ChatGPT/FS Soluções Tributarias/conector-local');
const node=process.execPath;
const port=18765;
const cdpPort=19222;
const portal='https://cav.receita.fazenda.gov.br/ecac/';
type Job={id:string;cnpj:string;operation:'coletar'|'analisar';status:string;createdAt:string;updatedAt:string;note?:string;directory:string};

export async function startConnector() {
  for(const dir of ['', 'jobs','logs','secrets','browser']) await mkdir(join(base,dir),{recursive:true,mode:0o700});
  const tokenPath=join(base,'secrets/local-token');
  if(!existsSync(tokenPath)) await writeFile(tokenPath,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
  const token=(await readFile(tokenPath,'utf8')).trim();
  const app=Fastify({logger:false,bodyLimit:16*1024});
  let context:BrowserContext|undefined;
  let page:Page|undefined;
  let sessionStatus='fechada';
  let sessionNote='';
  let active:string|undefined;
  let authenticationPending=false;
  const jobs=new Map<string,Job>();
  const save=async(job:Job)=>{
    job.updatedAt=new Date().toISOString();
    const path=join(base,'jobs',job.id+'.json');
    await writeFile(path+'.tmp',JSON.stringify(job,null,2),{mode:0o600});await rename(path+'.tmp',path);
  };
  for(const file of await readdir(join(base,'jobs'))) {
    if(!/^[a-f0-9-]+\.json$/.test(file))continue;
    const j=JSON.parse(await readFile(join(base,'jobs',file),'utf8')) as Job;
    if(['iniciando','coletando','gerando_parecer'].includes(j.status)) {
      j.status='revisao_necessaria';j.note='Execução interrompida; não foi repetida automaticamente.';await save(j);
    }
    jobs.set(j.id,j);
  }
  app.addHook('onRequest',async(req,reply)=>{
    if(req.url==='/health')return;
    const auth=req.headers.authorization||'';
    if(!tokenMatches(auth,`Bearer ${token}`))return reply.code(401).send({error:'unauthorized'});
  });
  const open=async()=>{
    if(context && page && !page.isClosed())return;
    const pfx=await readFile(join(base,'secrets/certificate.pfx'));
    const passphrase=(await readFile(join(base,'secrets/passphrase'),'utf8')).replace(/\r?\n$/,'');
    try {
      context=await chromium.launchPersistentContext(join(base,'browser'),{
        channel:'chrome',headless:false,acceptDownloads:true,viewport:null,
        locale:'pt-BR',timezoneId:'America/Sao_Paulo',
        clientCertificates:[{origin:'https://certificado.sso.acesso.gov.br',pfx,passphrase}],
        args:[`--remote-debugging-port=${cdpPort}`,'--remote-debugging-address=127.0.0.1'],
      });
    } finally {pfx.fill(0);}
    page=context.pages()[0]||await context.newPage();
    context.on('close',()=>{context=undefined;page=undefined;sessionStatus='fechada';});
    await page.goto(portal,{waitUntil:'domcontentloaded',timeout:60000});
    sessionStatus='aguardando_login';
  };
  const runScript=async(script:string,args:string[],job:Job)=>{
    const logfile=join(job.directory,script+'.log');
    const proc=spawn(node,[join(base,'pipeline/src',script),...args],{
      cwd:job.directory,
      env:{...process.env,FS_CONNECTOR_VAULT:join(base,'secrets/pipeline.env'),FS_ECAC_CDP_URL:`http://127.0.0.1:${cdpPort}`},
      stdio:['ignore','pipe','pipe'],shell:false,
    });
    let log='';
    const collect=(b:Buffer)=>{if(log.length<2_000_000)log+=b.toString();};
    proc.stdout.on('data',collect);proc.stderr.on('data',collect);
    const timer=setTimeout(()=>proc.kill('SIGTERM'),20*60*1000);
    const code=await new Promise<number>((resolve,reject)=>{proc.on('error',reject);proc.on('close',c=>resolve(c??1));}).finally(()=>clearTimeout(timer));
    await writeFile(logfile,log,{mode:0o600});
    return code;
  };
  const execute=async(job:Job)=>{
    active=job.id;
    try {
      if(!page || page.isClosed()) {job.status='aguardando_login';job.note='Abra a sessão e autentique no Chrome do Mac.';return;}
      if(!/^https:\/\/cav\.receita\.fazenda\.gov\.br\/ecac(?:\/|$)/i.test(page.url())) {
        job.status='aguardando_login';job.note='Faça o login no Chrome e retome este pedido.';return;
      }
      job.status='iniciando';await save(job);
      await switchToCorporateProxyProfile(page,job.cnpj,60000);
      await mkdir(job.directory,{recursive:true,mode:0o700});
      for(const name of ['src','skills'])if(!existsSync(join(job.directory,name)))await symlink(join(base,'pipeline',name),join(job.directory,name),'dir');
      job.status='coletando';await save(job);
      const code=await runScript('coletar.mjs',['--cnpj',job.cnpj,'--razao',`Empresa ${job.cnpj}`],job);
      if(code!==0){job.status='coleta_incompleta';job.note='Uma etapa de coleta falhou. Nenhum parecer completo foi liberado.';return;}
      const root=join(job.directory,'out',job.cnpj);
      const dirs=(await readdir(root)).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d));
      if(dirs.length!==1)throw new Error('Pasta de fontes ambígua');
      const sourceDir=join(root,dirs[0]!);
      if(await runScript('analisar.mjs',['--pasta',sourceDir],job)!==0)throw new Error('Extração do dossiê falhou');
      const data=JSON.parse(await readFile(join(sourceDir,'dossie/dados.json'),'utf8')) as {cnpj?:string};
      if((data.cnpj||'').replace(/\D/g,'')!==job.cnpj)throw new Error('CNPJ do dossiê divergente ou ausente');
      if(job.operation==='coletar'){job.status='coleta_concluida';return;}
      job.status='gerando_parecer';await save(job);
      const diagnosis=await runScript('diagnosticar.mjs',['--pasta',sourceDir],job);
      job.status=diagnosis===0?'pronto_para_revisao':'revisao_necessaria';
      if(diagnosis!==0)job.note='Diagnóstico pendente: conferir login do Claude e o log da etapa.';
    } catch(e) {
      job.status='revisao_necessaria';
      job.note=e instanceof Error?e.message.slice(0,300):'Erro na execução local.';
    } finally {await save(job);active=undefined;}
  };
  app.get('/health',async()=>({status:'ok',name:'FS Conector Mac',version:'0.1.0',whatsapp:'nao_conectado'}));
  app.get('/status',async()=>({session:sessionStatus,note:sessionNote,active:active??null,url:page?.url()??null,jobs:[...jobs.values()]}));
  app.post('/session/open',async(_req,reply)=>{if(active||authenticationPending)return reply.code(409).send({error:'busy'});await open();return {session:sessionStatus};});
  app.post('/session/login',async(_req,reply)=>{
    if(active||authenticationPending)return reply.code(409).send({error:'busy'});
    await open();sessionStatus='autenticando';sessionNote='';authenticationPending=true;
    void authenticateWithDigitalCertificate(page!,{ECAC_LOGIN_URL:portal,RPA_JOB_TIMEOUT_MS:90000,HUMAN_INTERVENTION_TIMEOUT_MS:600000},async()=>{sessionStatus='aguardando_confirmacao';sessionNote='Resolva o desafio manualmente na janela do Chrome.';})
      .then(()=>{sessionStatus='autenticada';sessionNote='';})
      .catch((error:unknown)=>{sessionStatus='aguardando_login';sessionNote=error instanceof HumanInterventionRequired?error.message:'Login não concluído. Verifique a janela do Chrome.';})
      .finally(()=>{authenticationPending=false;});
    return reply.code(202).send({session:sessionStatus});
  });
  app.get('/session/inspect',async()=>({url:page?.url(),text:await page?.locator('body').innerText().catch(()=>''),frames:page?.frames().map(f=>f.url())}));
  app.post('/session/screenshot',async()=>{if(!page)throw new Error('Abra a sessão');const path=join(base,'logs/session.png');await page.screenshot({path,fullPage:true});await chmod(path,0o600);return {path};});
  app.post('/jobs',async(req,reply)=>{
    const parsed=jobInput.safeParse(req.body);
    if(!parsed.success)return reply.code(400).send({error:'invalid_job'});
    if(active||authenticationPending)return reply.code(409).send({error:'busy'});
    const id=randomUUID();const now=new Date().toISOString();
    const job:Job={...parsed.data,id,status:'recebido',createdAt:now,updatedAt:now,directory:join(base,'jobs',id)};
    active=id;jobs.set(id,job);
    try{await save(job);}catch(e){active=undefined;jobs.delete(id);throw e;}
    void execute(job);
    return reply.code(202).send({id});
  });
  app.post<{Params:{id:string}}>('/jobs/:id/resume',async(req,reply)=>{
    const job=jobs.get(req.params.id);
    if(!job)return reply.code(404).send({error:'not_found'});
    if(active||authenticationPending||job.status!=='aguardando_login')return reply.code(409).send({error:'cannot_resume'});
    void execute(job);return reply.code(202).send({id:job.id});
  });
  app.get<{Params:{id:string}}>('/jobs/:id',async(req,reply)=>jobs.get(req.params.id)??reply.code(404).send({error:'not_found'}));
  app.addHook('onClose',async()=>{await context?.close();});
  await app.listen({host:'127.0.0.1',port});
  process.on('SIGTERM',()=>{void app.close().then(()=>process.exit(0));});
  console.log(JSON.stringify({status:'ready',url:`http://127.0.0.1:${port}`,base}));
}

// Homologação local: usa o handler real do site e redireciona apenas o fetch do
// webhook para localhost. Não abre WhatsApp, não envia mensagens ou publica dados.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
process.loadEnvFile('.env.local');
const site=process.argv[2];
if(!site)throw Error('Informe o caminho do api/diagnostic.js do site.');
const {handleDiagnostic}=await import(pathToFileURL(site));
const id=randomUUID(),origin='https://site-homologacao.example';
const input={submissionId:id,company:'TESTE LOCAL · Integração do site',cnpj:'11222333000181',name:'Contato fictício',email:'homologacao@example.test',phone:'62999999999',city:'Goiânia',state:'GO',regime:'real',need:'diagnostico',message:'Teste local do formulário até o Comercial. Dados fictícios.',consent:true,website:''};
const env={DIAGNOSTIC_WEBHOOK_URL:'https://crm-homologacao.example/api/webhooks/diagnostico',DIAGNOSTIC_WEBHOOK_TOKEN:process.env.FS_DIAGNOSTIC_WEBHOOK_TOKEN,DIAGNOSTIC_WEBHOOK_SECRET:process.env.FS_DIAGNOSTIC_WEBHOOK_SECRET,DIAGNOSTIC_PIPELINE_ID:'comercial',DIAGNOSTIC_STAGE_ID:'novos-contatos'};
const make=()=>new Request(`${origin}/api/diagnostic`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)});
for(let i=0;i<2;i++){
 const result=await handleDiagnostic(make(),{env,fetcher:(_url,options)=>fetch('http://localhost:3100/api/webhooks/diagnostico',options)});
 assert.equal(result.status,200);assert.equal((await result.json()).delivery,'webhook');
}
const response=await fetch('http://localhost:3100/api/comercial/leads'),{leads}=await response.json();
const found=leads.filter(l=>l.event.event_id===id);assert.equal(found.length,1);assert.equal(found[0].stage,'novos-contatos');assert.equal(found[0].event.company.name,input.company);
console.log('PASS: formulário real → webhook assinado → contato persistido → reenvio sem duplicação.');
console.log('Contato local de homologação:',found[0].id);

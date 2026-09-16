import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const base='https://fs-solucoes-sistema.vercel.app',site='https://www.fssolucoestributarias.com.br';
const access=JSON.parse(readFileSync('.local/provisioned-user.json','utf8'));
const login=await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:access.email,password:access.password})});assert.equal(login.status,200);
const headers={cookie:login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')};
assert.equal((await fetch(base+'/api/comercial/leads')).status,401);
const before=await fetch(base+'/api/comercial/leads',{headers});assert.equal(before.status,200);
const input={submissionId:randomUUID(),company:'HOMOLOGAÇÃO FS · Teste de integração',cnpj:'11222333000181',name:'Contato de teste',email:'homologacao@example.test',phone:'62999999999',city:'Goiânia',state:'GO',regime:'real',need:'diagnostico',message:'Registro fictício criado para verificar site, webhook, Comercial e anexos. Não entrar em contato.',consent:true,website:''};
writeFileSync('.local/production-test-event.json',JSON.stringify(input),{mode:0o600});
for(let i=0;i<2;i++){
 const result=await fetch(site+'/api/diagnostic/',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify(input)});
 assert.equal(result.status,200);const body=await result.json();assert.equal(body.delivery,'webhook');
}
let data=await (await fetch(base+'/api/comercial/leads',{headers})).json();
const found=data.leads.filter(l=>l.event.event_id===input.submissionId);assert.equal(found.length,1);const lead=found[0];assert.equal(lead.stage,'novos-contatos');assert.equal(lead.event.company.name,input.company);
const form=new FormData();form.set('kind','parecer');form.set('file',new Blob([readFileSync('../output/pdf/FS-Parecer-Demonstrativo.pdf')],{type:'application/pdf'}),'TESTE-Parecer-Demonstrativo.pdf');
const upload=await fetch(`${base}/api/comercial/leads/${lead.id}/anexos`,{method:'POST',headers:{...headers,Origin:base},body:form});assert.equal(upload.status,201);
const attachment=(await upload.json()).lead.attachments[0];
const url=`${base}/api/comercial/leads/${lead.id}/anexos/${attachment.id}`;
assert.equal((await fetch(url)).status,401);
const file=await fetch(url,{headers});assert.equal(file.status,200);assert.ok(Buffer.from(await file.arrayBuffer()).subarray(0,5).equals(Buffer.from('%PDF-')));
writeFileSync('.local/production-test-result.json',JSON.stringify({leadId:lead.id,eventId:input.submissionId,attachmentId:attachment.id}),{mode:0o600});
console.log('PASS: site publicado → webhook → PostgreSQL → Novos contatos; reenvio único; upload/leitura de PDF; acesso autenticado. Nenhuma mensagem WhatsApp enviada.');

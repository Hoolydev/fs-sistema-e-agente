import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {archiveDocument,documents,documentContent} from '../lib/documentos/store';
import {agentActor} from '../lib/documentos/access';
Object.assign(process.env,{NODE_ENV:'test'});delete process.env.DATABASE_URL;delete process.env.FS_CRM_DATABASE_URL;process.env.FS_CRM_LOCAL_DIR=mkdtempSync(join(tmpdir(),'fs-acervo-test-'));
test('acervo mantém PDF e protocolo idempotente, busca por CNPJ ou nome com acentos',async()=>{
 const input={externalId:'test-one',cnpj:'47733961000179',company:'Empresa Soluções',name:'Parecer.pdf',kind:'parecer',createdAt:'2026-09-16T12:00:00Z'};const pdf=Buffer.from('%PDF-1.4\ntest-only');
 const id=await archiveDocument(input,pdf);assert.equal(await archiveDocument(input,pdf),id);
 assert.equal((await documents('solucoes')).length,1);assert.equal((await documents('47.733.961/0001-79'))[0].id,id);assert.ok((await documentContent(id))?.content.equals(pdf));
 await assert.rejects(archiveDocument(input,Buffer.from('%PDF-different')),/CONFLICT/);assert.equal(await documentContent('../secret'),null);
});
test('token válido sem número autorizado não libera documento',()=>{
 const env={NODE_ENV:'test' as const,FS_AGENT_SERVICE_TOKEN:'secret-test',FS_AGENT_ALLOWED_PHONES:'5562982540748'};
 const req=(phone:string,token:string)=>new Request('https://fs.test/api/agent/documents',{headers:{authorization:`Bearer ${token}`,'x-fs-requester-phone':phone}});
 assert.equal(agentActor(req('5562982540748','secret-test'),env),'5562982540748');assert.equal(agentActor(req('5562000000000','secret-test'),env),null);assert.equal(agentActor(req('5562982540748','wrong'),env),null);
});

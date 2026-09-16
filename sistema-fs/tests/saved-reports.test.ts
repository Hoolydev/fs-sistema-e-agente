import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demoReport } from '../lib/diagnostico/demo';
import { archiveCanonicalReport,savedReport } from '../lib/diagnostico/store';
import { documentContent,documents } from '../lib/documentos/store';
import { generateDiagnosticPdf } from '../lib/diagnostico/pdf';
Object.assign(process.env,{NODE_ENV:'test'});delete process.env.DATABASE_URL;delete process.env.FS_CRM_DATABASE_URL;process.env.FS_CRM_LOCAL_DIR=mkdtempSync(join(tmpdir(),'fs-report-test-'));
const report={...structuredClone(demoReport),mode:'real' as const,sources:demoReport.sources.map(s=>({...s,status:s.status==='demonstrativo'?'coletado' as const:s.status})),opinion:{...demoReport.opinion!,scenario:null}};
const logo=readFileSync('public/brand/fs-horizontal.png');
test('parecer e tela compartilham dados, PDF e protocolo imutáveis',async()=>{
 const id=await archiveCanonicalReport('synthetic-001',report,logo);
 assert.equal(await archiveCanonicalReport('synthetic-001',report,logo),id);
 assert.deepEqual(await savedReport(id),report);
 const stored=await documentContent(id);assert.ok(stored?.content.equals(Buffer.from(generateDiagnosticPdf(report,logo))));
 assert.equal((await documents())[0].reportUrl,`/diagnostico/${id}`);
 await assert.rejects(archiveCanonicalReport('synthetic-001',{...report,summary:'Mudou'},logo),/CONFLICT/);
 assert.equal(await savedReport('../secret'),null);
});
test('API canônica recusa demonstração como parecer real',async()=>{
 await assert.rejects(archiveCanonicalReport('demo',demoReport,logo),/REAL_EVIDENCE/);
});

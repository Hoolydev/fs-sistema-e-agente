import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
Object.assign(process.env, { NODE_ENV: 'test' }); delete process.env.DATABASE_URL; delete process.env.FS_CRM_DATABASE_URL; process.env.FS_CRM_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'fs-sitfis-test-'));
import { runPreliminaryDiagnostic } from '../lib/diagnostico/consulta';
import { completeSitfis, reprocessSitfis, requestSitfis, sitfisStatusFor } from '../lib/diagnostico/sitfis';
import { query } from '../lib/comercial/store';
import { savedReport } from '../lib/diagnostico/store';
import { documents } from '../lib/documentos/store';
import { summarize } from '../lib/diagnostico/model';
import { reportFromSerpro } from '../lib/diagnostico/serpro-evidence';

const cnpj = '12345678000195';
const text = `CNPJ: 12.345.678 - EMPRESA SINTÉTICA
Dados Cadastrais da Matriz __________
CNPJ: 12.345.678/0001-95
Pendência - Débito (SIEF) __________
Receita PA/Exerc. Dt. Vcto
2089-01 - IRPJ 1º
TRIM/2026 30/04/2026 150,00 100,00 20,00 5,00 125,00 DEVEDOR
Débito com Exigibilidade Suspensa (SIEF) __________
Receita PA/Exerc. Dt. Vcto
0561-07 - IRRF 08/2026 18/09/2026 60,00 50,00 A ANALISAR-A VENCER
__________ Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional __________
Pendência - Inscrição (SIDA) __________
20.2.26.000001-00 3551-IRPJ 20/07/2026 11111.111.111/2026-11 DEVEDOR PRINCIPAL
Situação: ATIVA EM COBRANCA
__________
Final do Relatório`;
const pgfnRow = { cpfCnpj: cnpj, numeroInscricao: '2022600000100', valorTotalConsolidadoMoeda: '1.250,00', situacaoDescricao: 'ATIVA AJUIZADA NEGOCIADA NO SISPAR', numeroProcesso: '11111111111202611', dataInscricao: '20/07/2026' };
const env = { NODE_ENV: 'test', SERPRO_DIVIDA_CONSUMER_KEY: 'k', SERPRO_DIVIDA_CONSUMER_SECRET: 's', FS_AGENT_SERVICE_TOKEN: 'tok', FS_AGENT_URL: 'https://agente.test' } as NodeJS.ProcessEnv;
const serpro = (async (url: string) => url.endsWith('/token') ? new Response(JSON.stringify({ access_token: 't' }), { status: 200 }) : url.includes('/devedor/') ? new Response(JSON.stringify([pgfnRow]), { status: 200 }) : new Response('{}', { status: 404 })) as unknown as typeof fetch;
const pdfOf = async () => { const d = await PDFDocument.create(); d.addPage(); return Buffer.from(await d.save()); };
const actor = { id: 'u1', name: 'Fernando' };

test('mapeador SITFIS: inscrição negociada no SISPAR entra no passivo e situação desconhecida continua barrando', () => {
  const report = reportFromSerpro({ cnpj, rfbText: text, pgfn: [pgfnRow], collectedAt: '2026-10-06T12:00:00.000Z', rfbHash: 'a'.repeat(64), pgfnHash: 'b'.repeat(64), reportId: 'X', version: 2 });
  assert.deepEqual(summarize(report), { rfb: 12500, pgfn: 125000, total: 137500, count: 1 });
  assert.equal(report.debts[1].judicialProcess, 'Ajuizada (número do juízo não informado na fonte)');
  assert.ok(report.supplements?.some(s => s.title === 'PGFN - inscrições ativas por situação'));
  assert.throws(() => reportFromSerpro({ cnpj, rfbText: text, pgfn: [{ ...pgfnRow, situacaoDescricao: 'DESCONHECIDA' }], collectedAt: '2026-10-06T12:00:00.000Z', rfbHash: 'a', pgfnHash: 'b', reportId: 'X', version: 2 }), /STATUS/);
  assert.throws(() => reportFromSerpro({ cnpj, rfbText: text.replace(/Pendência - Inscrição[\s\S]*/, 'Pendência - Inscrição (SIDA) ____\n____\nFinal do Relatório'), pgfn: [], collectedAt: '2026-10-06T12:00:00.000Z', rfbHash: 'a', pgfnHash: 'b', reportId: 'X', version: 2 }), /PGFN_EMPTY/);
  assert.equal(reportFromSerpro({ cnpj, rfbText: text.replace(/Pendência - Inscrição[\s\S]*/, 'Pendência - Inscrição (SIDA) ____\n____\nFinal do Relatório'), pgfn: [], pgfnNotFound: true, collectedAt: '2026-10-06T12:00:00.000Z', rfbHash: 'a', pgfnHash: 'b', reportId: 'X', version: 2 }).debts.length, 1);
});
test('pedido ao agente: um por parecer, falha de rede ou recusa registradas sem consulta', async () => {
  const base = await runPreliminaryDiagnostic(cnpj, 'u1', { env, fetchImpl: serpro });
  const calls: { url: string; body: string; auth: string }[] = [];
  const agent = (async (url: string, init: RequestInit) => { calls.push({ url, body: String(init.body), auth: String((init.headers as Record<string, string>).authorization) }); return new Response('{}', { status: 202 }); }) as unknown as typeof fetch;
  const first = await requestSitfis({ baseDocumentId: base.id, cnpj, actor, ownerId: null }, env, agent);
  assert.equal(first.status, 'solicitado'); assert.equal(calls[0].url, 'https://agente.test/sistema/sitfis'); assert.equal(calls[0].auth, 'Bearer tok'); assert.equal(JSON.parse(calls[0].body).requestId, first.id);
  const again = await requestSitfis({ baseDocumentId: base.id, cnpj, actor, ownerId: null }, env, agent);
  assert.equal(again.id, first.id); assert.equal(calls.length, 1);
  const other = await runPreliminaryDiagnostic('51646813000194', 'u1', { env, fetchImpl: (async (url: string) => url.endsWith('/token') ? new Response(JSON.stringify({ access_token: 't' }), { status: 200 }) : new Response(JSON.stringify([{ message: 'CNPJ não encontrado' }]), { status: 404 })) as unknown as typeof fetch });
  const down = await requestSitfis({ baseDocumentId: other.id, cnpj: '51646813000194', actor, ownerId: null }, env, (async () => { throw new Error('offline'); }) as unknown as typeof fetch);
  assert.equal(down.status, 'falhou'); assert.match(down.message, /não respondeu/);
  const noToken = await requestSitfis({ baseDocumentId: other.id, cnpj: '51646813000194', actor, ownerId: null }, { ...env, FS_AGENT_SERVICE_TOKEN: '' }, agent);
  assert.equal(noToken.status, 'falhou'); assert.equal(calls.length, 1);
});
test('resultado: versão completa Receita + PGFN sem nova consulta PGFN, PDF oficial na documentação e idempotência', async () => {
  const base = await runPreliminaryDiagnostic(cnpj, 'u1', { env, fetchImpl: serpro, force: true, now: () => new Date(Date.now() + 1000) });
  const req = await requestSitfis({ baseDocumentId: base.id, cnpj, actor, ownerId: null, force: true }, env, (async () => new Response('{}', { status: 202 })) as unknown as typeof fetch);
  const pdf = await pdfOf();
  await assert.rejects(completeSitfis({ requestId: req.id, cnpj: '51646813000194', ok: true, pdf, text }), /CNPJ_MISMATCH/);
  const done = await completeSitfis({ requestId: req.id, cnpj, ok: true, pdf, text, collectedAt: '2026-10-06T15:00:00.000Z' });
  assert.equal(done.status, 'concluido'); assert.ok(done.resultDocumentId && done.sitfisDocumentId);
  const full = await savedReport(done.resultDocumentId!);
  assert.equal(full?.sources.find(s => s.id === 'rfb')?.status, 'coletado'); assert.deepEqual(summarize(full!), { rfb: 12500, pgfn: 125000, total: 137500, count: 1 });
  assert.equal(full?.annexes?.at(-1)?.type, 'Relatório de situação fiscal (RFB)');
  assert.ok((await documents(cnpj)).some(d => d.id === done.sitfisDocumentId && d.docType === 'situacao_fiscal'));
  const status = await sitfisStatusFor(base.id, null); assert.equal(status?.resultDocumentId, done.resultDocumentId);
  assert.equal((await completeSitfis({ requestId: req.id, cnpj, ok: true, pdf, text })).resultDocumentId, done.resultDocumentId);
});
test('relatório fora do layout vai para revisão com o PDF guardado; recusa da Receita explica a procuração', async () => {
  const base = await runPreliminaryDiagnostic(cnpj, 'u1', { env, fetchImpl: serpro, force: true, now: () => new Date(Date.now() + 2000) });
  const ok202 = (async () => new Response('{}', { status: 202 })) as unknown as typeof fetch;
  const req = await requestSitfis({ baseDocumentId: base.id, cnpj, actor, ownerId: null, force: true }, env, ok202);
  const review = await completeSitfis({ requestId: req.id, cnpj, ok: true, pdf: await pdfOf(), text: 'Dados Cadastrais da Matriz __\nCNPJ: 12.345.678/0001-95\nCNPJ: 12.345.678 - EMPRESA\nLAYOUT NOVO' });
  assert.equal(review.status, 'revisao'); assert.ok(review.sitfisDocumentId); assert.equal(review.resultDocumentId, null); assert.match(review.message, /leitura manual/);
  // Depois do ajuste no leitor, a releitura usa o PDF e o texto guardados, sem nova consulta.
  await query('UPDATE fs_sitfis_requests SET source_text=$1 WHERE id=$2', [text, req.id]);
  const redone = await reprocessSitfis(req.id);
  assert.equal(redone.status, 'concluido'); assert.ok(redone.resultDocumentId); assert.equal(redone.sitfisDocumentId, review.sitfisDocumentId);
  await assert.rejects(reprocessSitfis(req.id), /NOT_REPROCESSABLE/);
  const req2 = await requestSitfis({ baseDocumentId: base.id, cnpj, actor, ownerId: null, force: true }, env, ok202);
  const denied = await completeSitfis({ requestId: req2.id, cnpj, ok: false, code: 'access_denied' });
  assert.equal(denied.status, 'falhou'); assert.match(denied.message, /procuração eletrônica/);
});

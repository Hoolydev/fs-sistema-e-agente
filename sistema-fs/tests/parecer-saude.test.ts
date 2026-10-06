import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
Object.assign(process.env, { NODE_ENV: 'test' }); delete process.env.DATABASE_URL; delete process.env.FS_CRM_DATABASE_URL; process.env.FS_CRM_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'fs-saude-test-'));
import { preliminaryReport } from '../lib/diagnostico/preliminar';
import { buildOpinion, fiscalHealth } from '../lib/diagnostico/opinion';
import { summarize } from '../lib/diagnostico/model';
import { generateDiagnosticPdf } from '../lib/diagnostico/pdf';
import { reissuePreliminary, runPreliminaryDiagnostic } from '../lib/diagnostico/consulta';
import { savedReport, validateCanonicalReport } from '../lib/diagnostico/store';
import { archiveDocument } from '../lib/documentos/store';
import { mergeOpinionWithAnnexes } from '../lib/diagnostico/anexos';
import { brlCents, complementPayload, emptyComplement } from '../components/diagnostico/complemento';
import type { PgfnEvidence } from '../lib/diagnostico/pgfn';

const CNPJ = '04907399000140', logo = readFileSync('public/brand/fs-horizontal.png');
const row = (n: number, juizo = '') => ({ numeroInscricao: `80 1 26 00000${n}-10`, numeroProcesso: `10000.00000${n}/2026-11`, situacaoDescricao: 'ATIVA EM COBRANCA', valorTotalConsolidadoMoeda: '1.000,00', cpfCnpj: CNPJ, dataInscricao: '2026-01-10', ...(juizo ? { numeroJuizo: juizo } : {}) });
const evidence = (rows: ReturnType<typeof row>[]): PgfnEvidence => { const raw = Buffer.from(JSON.stringify(rows)); return { outcome: rows.length ? 'inscricoes' : 'sem_inscricoes', rows, raw, sha256: 'a'.repeat(64), httpStatus: rows.length ? 200 : 404, collectedAt: '2026-10-01T12:00:00.000Z' }; };
const build = (rows: ReturnType<typeof row>[], rfbManual?: Parameters<typeof preliminaryReport>[0]['rfbManual']) => preliminaryReport({ cnpj: CNPJ, cadastro: null, pgfn: evidence(rows), reportId: 'FS-T-1', version: 1, rfbManual });

test('índice de saúde: sem Receita Federal fica parcial e não trata ausência como regular', () => {
  const h = fiscalHealth(build([row(1), row(2), row(3)]));
  assert.equal(h.partial, true); assert.equal(h.factors[1].points, null); assert.equal(h.factors[3].points, 0);
  assert.equal(h.evaluatedMax, 75); assert.equal(h.score, Math.round((12 + 20 + 0 + 5) / 75 * 100)); assert.equal(h.band?.label, 'Risco elevado');
  const clean = fiscalHealth(build([], { hasDebts: false, reference: 'Relatório do cliente 01/10/2026', analyst: 'Ana' }));
  assert.equal(clean.partial, false); assert.deepEqual(clean.factors.map(f => f.points), [30, 25, 20, 15, 7]); assert.equal(clean.score, 97); assert.equal(clean.band?.label, 'Saudável');
  const judicial = fiscalHealth(build([row(1, '5000001-11.2026'), row(2, '5000002-11.2026'), row(3)]));
  assert.equal(judicial.factors[2].points, 0);
});
test('leitura manual da Receita: discriminada, global e só existência', () => {
  const items = build([row(1)], { hasDebts: true, reference: 'Relatório de situação fiscal 01/10/2026', analyst: 'Ana Fabian', items: [{ description: 'IRPJ', period: '03/2026', total: 150000 }, { description: 'CSLL', period: '03/2026', total: 50000 }] });
  assert.equal(items.sources.find(s => s.id === 'rfb')?.status, 'declarado'); assert.deepEqual(summarize(items), { rfb: 200000, pgfn: 100000, total: 300000, count: 1 });
  assert.equal(items.debts.filter(d => d.origin === 'RFB').length, 2); assert.equal(items.rfbDeclaration?.count, 2); assert.equal(items.rfbDeclaration?.analyst, 'Ana Fabian');
  assert.ok(validateCanonicalReport(items)); assert.match(items.summary, /leitura do analista/); assert.ok(items.pending.some(p => /Confirmar a leitura manual/.test(p)));
  const global = build([row(1)], { hasDebts: true, reference: 'Extrato do cliente', analyst: 'Ana', totalCents: 1089400 });
  assert.equal(global.debts.find(d => d.origin === 'RFB')?.id, 'RFB-LEITURA-TOTAL'); assert.equal(summarize(global).rfb, 1089400);
  const onlyFlag = build([row(1)], { hasDebts: true, reference: 'Consulta visual no e-CAC do cliente', analyst: 'Ana', count: 4 });
  assert.equal(onlyFlag.sources.find(s => s.id === 'rfb')?.status, 'pendente'); assert.equal(summarize(onlyFlag).rfb, null); assert.equal(onlyFlag.debts.filter(d => d.origin === 'RFB').length, 0);
  const h = fiscalHealth(onlyFlag); assert.equal(h.factors[1].points, 8); assert.equal(h.partial, false); assert.match(h.factors[1].reading, /4 débitos/);
  const opinion = buildOpinion(onlyFlag); const kpis = opinion.pages[0].blocks.find(b => b.type === 'kpis');
  assert.ok(kpis && kpis.type === 'kpis' && kpis.items[2].value === 'Há débitos'); assert.ok(opinion.pages[2].blocks.some(b => b.type === 'callout' && /Ana informou a existência de débitos/.test(b.text)));
  assert.equal(opinion.pages.length >= 11, true);
});
test('topo do parecer: sem cenário mostra passivo e índice; com cenário mantém o quadro de transação', () => {
  const report = build([row(1)], { hasDebts: true, reference: 'Relatório', analyst: 'Ana', totalCents: 500000 });
  const kpis = buildOpinion(report).pages[0].blocks.find(b => b.type === 'kpis');
  assert.ok(kpis && kpis.type === 'kpis'); assert.deepEqual(kpis.items.map(i => i.label), ['PASSIVO FEDERAL · RFB + PGFN', 'DÍVIDA ATIVA · PGFN', 'RECEITA FEDERAL', 'SAÚDE FISCAL']);
  assert.equal(kpis.items[0].value.replace(/\s/g, ' '), 'R$ 6.000,00'); assert.match(kpis.items[3].value, /^\d+\/100$/);
  const pdf = Buffer.from(generateDiagnosticPdf(report, logo)); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});
test('complemento dentro da janela gera nova versão sem nova consulta PGFN e com anexos do mesmo CNPJ', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => { calls.push(url); if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 }); if (url.includes('/devedor/')) return new Response(JSON.stringify([row(1)]), { status: 200 }); return new Response('{}', { status: 404 }); }) as unknown as typeof fetch;
  const env = { NODE_ENV: 'test', SERPRO_DIVIDA_CONSUMER_KEY: 'k', SERPRO_DIVIDA_CONSUMER_SECRET: 's' } as NodeJS.ProcessEnv;
  const first = await runPreliminaryDiagnostic(CNPJ, 'u1', { env, fetchImpl });
  const annex = await archiveDocument({ externalId: 'web-anexo-1', cnpj: CNPJ, company: 'X', name: 'situacao-fiscal.pdf', kind: 'documento', createdAt: '2026-10-01T10:00:00.000Z', docType: 'situacao_fiscal' }, Buffer.from('%PDF-1.4 anexo'));
  const other = await archiveDocument({ externalId: 'web-anexo-2', cnpj: '51646813000194', company: 'Y', name: 'outra.pdf', kind: 'documento', createdAt: '2026-10-01T10:00:00.000Z' }, Buffer.from('%PDF-1.4 outra'));
  await assert.rejects(runPreliminaryDiagnostic(CNPJ, 'u1', { env, fetchImpl, annexIds: [other] }), /ANNEX_NOT_ALLOWED/);
  await assert.rejects(runPreliminaryDiagnostic(CNPJ, 'u1', { env, fetchImpl, annexIds: [first.id] }), /ANNEX_NOT_ALLOWED/);
  const second = await runPreliminaryDiagnostic(CNPJ, 'u1', { env, fetchImpl, now: () => new Date(Date.now() + 1000), rfbManual: { hasDebts: true, reference: 'Relatório do cliente', analyst: 'Ana', totalCents: 250000 }, annexIds: [annex] });
  assert.equal(second.reused, false); assert.equal(second.pgfnReused, true); assert.equal(second.version, 2); assert.equal(second.rfbPending, false);
  assert.equal(calls.filter(u => u.includes('/devedor/')).length, 1);
  const saved = await savedReport(second.id); assert.equal(saved?.annexes?.[0].type, 'Relatório de situação fiscal (RFB)'); assert.equal(summarize(saved!).rfb, 250000);
  const third = await runPreliminaryDiagnostic(CNPJ, 'u1', { env, fetchImpl, now: () => new Date(Date.now() + 2000) });
  assert.equal(third.reused, true); assert.equal(third.id, second.id);
});
test('parecer com anexos: PDFs entram inteiros, imagens viram página e excesso é listado', async () => {
  const one = await PDFDocument.create(); one.addPage(); one.addPage(); const opinion = await one.save();
  const annex = await PDFDocument.create(); annex.addPage(); const annexBytes = Buffer.from(await annex.save());
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const merged = await mergeOpinionWithAnnexes(opinion, [{ name: 'a.pdf', type: 'Contrato social', content: annexBytes, mime: 'application/pdf' }, { name: 'b.png', type: 'Cartão CNPJ', content: png, mime: 'image/png' }, { name: 'c.pdf', type: 'Outro', content: Buffer.from('%PDF-quebrado'), mime: 'application/pdf' }]);
  assert.deepEqual(merged.included, ['a.pdf', 'b.png']); assert.equal(merged.skipped[0].name, 'c.pdf');
  assert.equal((await PDFDocument.load(merged.pdf)).getPageCount(), 2 + 1 + 1 + 1);
  const capped = await mergeOpinionWithAnnexes(opinion, [{ name: 'grande.pdf', type: 'Outro', content: annexBytes, mime: 'application/pdf' }], opinion.length + 10);
  assert.equal(capped.skipped[0].reason, 'excede o tamanho do arquivo único');
});
test('inscrições negociadas no SISPAR entram no passivo, separadas de "em cobrança" (caso Honorio Dantas)', () => {
  const negotiated = [
    { ...row(1), situacaoDescricao: 'ATIVA AJUIZADA NEGOCIADA NO SISPAR', valorTotalConsolidadoMoeda: '187.337,49' },
    { ...row(2), situacaoDescricao: 'ATIVA NAO AJUIZAVEL NEGOCIADA NO SISPAR', valorTotalConsolidadoMoeda: '350,20' },
    { ...row(3), situacaoDescricao: 'EXTINTA POR PAGAMENTO', valorTotalConsolidadoMoeda: '0,00' },
  ];
  const report = build(negotiated);
  assert.equal(summarize(report).pgfn, 18768769); assert.equal(report.debts.length, 2);
  assert.equal(report.debts[0].judicialProcess, 'Ajuizada (número do juízo não informado na fonte)'); assert.equal(report.debts[1].judicialProcess, null);
  assert.match(report.summary, /2 ativas somando R\$\s187\.687,69 — 2 negociada \/ parcelada/);
  assert.ok(report.supplements?.some(s => s.title === 'PGFN - inscrições ativas por situação' && s.rows[0][0] === 'Negociada / parcelada'));
  assert.ok(report.pending.some(p => /SISPAR/.test(p)));
  const h = fiscalHealth(report); assert.equal(h.factors[0].points, 15); assert.equal(h.factors[2].points, 6); assert.match(h.factors[0].reading, /0 em cobrança, 2 negociadas/);
  const kpis = buildOpinion(report).pages[0].blocks.find(b => b.type === 'kpis');
  assert.ok(kpis && kpis.type === 'kpis' && /todas negociadas\/suspensas/.test(kpis.items[1].detail ?? '') && kpis.items[1].value.replace(/\s/g, ' ') === 'R$ 187.687,69');
});
test('formulário: valores em reais viram centavos e leitura incompleta é barrada', () => {
  assert.equal(brlCents('1.089.400,85'), 108940085); assert.equal(brlCents('R$ 12,5'), 1250); assert.equal(brlCents('abc'), null); assert.equal(brlCents('0'), null);
  const c = emptyComplement(); c.rfb.enabled = true; assert.match(complementPayload(c).error ?? '', /de onde veio a leitura/);
  c.rfb.reference = 'Relatório do cliente'; c.rfb.lines = [{ description: 'IRPJ', period: '03/2026', value: 'x' }]; assert.match(complementPayload(c).error ?? '', /descrição e valor/);
  c.rfb.lines = [{ description: 'IRPJ', period: '03/2026', value: '1.500,00' }]; assert.deepEqual(complementPayload(c).body.rfbManual, { hasDebts: true, reference: 'Relatório do cliente', items: [{ description: 'IRPJ', period: '03/2026', total: 150000 }] });
  c.rfb.hasDebts = false; assert.deepEqual(complementPayload(c).body.rfbManual, { hasDebts: false, reference: 'Relatório do cliente' });
});
test('reemissão de parecer antigo usa a evidência PGFN guardada, sem nova consulta, e gera a versão seguinte', async () => {
  const CNPJ2 = '01573657000100', calls: string[] = [];
  const negotiated = [{ ...row(1), cpfCnpj: CNPJ2, situacaoDescricao: 'ATIVA AJUIZADA NEGOCIADA NO SISPAR', valorTotalConsolidadoMoeda: '187.337,49' }];
  const fetchImpl = (async (url: string) => { calls.push(url); if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 }); if (url.includes('/devedor/')) return new Response(JSON.stringify(negotiated), { status: 200 }); return new Response('{}', { status: 404 }); }) as unknown as typeof fetch;
  const env = { NODE_ENV: 'test', SERPRO_DIVIDA_CONSUMER_KEY: 'k', SERPRO_DIVIDA_CONSUMER_SECRET: 's' } as NodeJS.ProcessEnv;
  const first = await runPreliminaryDiagnostic(CNPJ2, 'u1', { env, fetchImpl });
  const again = await reissuePreliminary(first.id, 'u1', { env, fetchImpl, now: () => new Date(Date.now() + 5000) });
  assert.equal(again.version, 2); assert.equal(again.pgfnReused, true); assert.notEqual(again.id, first.id);
  assert.equal(calls.filter(u => u.includes('/devedor/')).length, 1);
  const saved = await savedReport(again.id); assert.equal(summarize(saved!).pgfn, 18733749); assert.equal(saved?.id, (await savedReport(first.id))?.id);
  await assert.rejects(reissuePreliminary('doc_inexistente', 'u1', { env, fetchImpl }), /REPORT_NOT_FOUND/);
});

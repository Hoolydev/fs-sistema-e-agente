import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { consultDividaAtiva, PgfnError, type PgfnEvidence } from '../lib/diagnostico/pgfn';
import { consultCadastro } from '../lib/diagnostico/cadastro';
import { preliminaryReport, procuracaoInstruction } from '../lib/diagnostico/preliminar';
import { summarize } from '../lib/diagnostico/model';
import { generateDiagnosticPdf } from '../lib/diagnostico/pdf';
import { validateCanonicalReport, savedReport } from '../lib/diagnostico/store';
import { runPreliminaryDiagnostic } from '../lib/diagnostico/consulta';
import { query } from '../lib/comercial/store';
Object.assign(process.env, { NODE_ENV: 'test' }); delete process.env.DATABASE_URL; delete process.env.FS_CRM_DATABASE_URL; process.env.FS_CRM_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'fs-preliminar-test-'));

const CNPJ = '04907399000140';
const rows = [
  { numeroInscricao: '80 1 26 000001-10', numeroProcesso: '10000.000001/2026-11', situacaoDescricao: 'ATIVA EM COBRANCA', valorTotalConsolidadoMoeda: '1.234,56', cpfCnpj: '04.907.399/0001-40', nomeDevedor: 'PROSURG PRODUTOS MEDICOS LTDA.', dataInscricao: '2026-01-10' },
  { numeroInscricao: '80 1 26 000002-00', numeroProcesso: '10000.000002/2026-22', situacaoDescricao: 'ATIVA AJUIZADA', valorTotalConsolidadoMoeda: '500,00', cpfCnpj: '04907399000140', numeroJuizo: '5000001-11.2026.4.04.7000', dataInscricao: '2025-05-05' },
  { numeroInscricao: '80 1 24 000003-90', numeroProcesso: '0', situacaoDescricao: 'EXTINTA POR PAGAMENTO DEVOLVIDA OU ARQUIVADA', valorTotalConsolidadoMoeda: '0,00', cpfCnpj: '04907399000140', dataInscricao: '2024-02-02' },
];
const evidence = (outcome: PgfnEvidence['outcome'], list = rows): PgfnEvidence => { const raw = Buffer.from(JSON.stringify(outcome === 'inscricoes' ? list : [{ message: 'CNPJ não encontrado.' }])); return { outcome, rows: outcome === 'inscricoes' ? list as PgfnEvidence['rows'] : [], raw, sha256: 'a'.repeat(64), httpStatus: outcome === 'inscricoes' ? 200 : 404, collectedAt: '2026-09-17T18:00:00.000Z' }; };
const cadastro = { name: 'PROSURG PRODUTOS MEDICOS LTDA.', status: 'ATIVA', statusDate: null, size: 'DEMAIS', simples: null, mei: null, city: 'CURITIBA', state: 'PR', activity: 'Comércio atacadista de materiais médicos', opened: '2002-02-08', legalNature: 'Sociedade Empresária Limitada', provider: 'Dados abertos CNPJ/RFB · brasilapi.com.br', collectedAt: '2026-09-17T18:00:00.000Z' };
const logo = readFileSync('public/brand/fs-horizontal.png');
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeFetch(pgfnStatus: number, pgfnBody: unknown, cadastroStatus = 200) {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(url);
    if (url.endsWith('/token')) return response(200, { access_token: 'tok', expires_in: 3600 });
    if (url.includes('/devedor/')) return response(pgfnStatus, pgfnBody);
    if (url.includes('minhareceita')) return response(200, { cnpj: CNPJ, razao_social: 'FALLBACK LTDA', descricao_situacao_cadastral: 'ATIVA', municipio: 'CURITIBA', uf: 'PR' });
    if (url.includes('brasilapi')) return response(cadastroStatus, { cnpj: CNPJ, razao_social: cadastro.name, descricao_situacao_cadastral: 'ATIVA', porte: 'DEMAIS', municipio: 'CURITIBA', uf: 'PR', cnae_fiscal_descricao: cadastro.activity, natureza_juridica: cadastro.legalNature, data_inicio_atividade: '2002-02-08' });
    throw new Error(`unexpected ${url}`);
  };
  return Object.assign(impl as unknown as typeof fetch, { calls });
}
const env = { NODE_ENV: 'test', SERPRO_DIVIDA_CONSUMER_KEY: 'k', SERPRO_DIVIDA_CONSUMER_SECRET: 's' } as NodeJS.ProcessEnv, empty = { NODE_ENV: 'test' } as NodeJS.ProcessEnv;

test('parecer preliminar soma só inscrições ativas, separa as demais e mantém RFB pendente', () => {
  const report = preliminaryReport({ cnpj: CNPJ, cadastro, pgfn: evidence('inscricoes'), reportId: 'FS-PRE-1', version: 1 });
  assert.equal(report.mode, 'real'); assert.equal(report.company.name, cadastro.name);
  assert.deepEqual(report.debts.map(d => d.id), ['80 1 26 000001-10']);
  assert.equal(report.sources.find(s => s.id === 'rfb')?.status, 'pendente'); assert.equal(report.sources.find(s => s.id === 'pgfn')?.status, 'coletado');
  assert.ok(report.pending[0].includes('47.733.961/0001-79'));
  assert.equal(report.pending[0], procuracaoInstruction());
  const totals = summarize(report); assert.equal(totals.pgfn, 123456); assert.equal(totals.rfb, null); assert.equal(totals.total, null);
  assert.ok(report.supplements?.some(s => s.title.startsWith('PGFN - inscrições em outras') && s.rows[0][1] === 'ATIVA AJUIZADA' && s.rows[0][4] === 'Sim'));
  assert.ok(report.supplements?.some(s => s.title === 'PGFN - inscrições extintas'));
  assert.ok(report.supplements?.some(s => s.title === 'Cadastro público do CNPJ'));
  assert.ok(report.opinion?.judicialNote.startsWith('1 inscrições'));
  assert.deepEqual(validateCanonicalReport(report), report);
  assert.ok(Buffer.from(generateDiagnosticPdf(report, logo)).subarray(0, 5).toString() === '%PDF-');
});
test('sem inscrições PGFN vira evidência arquivável, não erro nem débito zero implícito', () => {
  const report = preliminaryReport({ cnpj: CNPJ, cadastro: null, pgfn: evidence('sem_inscricoes'), reportId: 'FS-PRE-2', version: 1, procuradorCnpj: '11222333000181' });
  assert.equal(report.debts.length, 0); assert.equal(report.company.name, 'Empresa 04.907.399/0001-40');
  assert.ok(report.summary.includes('não localizou o CNPJ')); assert.ok(report.pending.some(p => p.includes('Regularize')));
  assert.ok(report.pending[0].includes('11.222.333/0001-81'));
  assert.equal(report.sources.find(s => s.id === 'cadastro')?.status, 'pendente');
  assert.deepEqual(validateCanonicalReport(report), report);
});
test('construtor recusa contribuinte divergente e extinta com saldo', () => {
  assert.throws(() => preliminaryReport({ cnpj: CNPJ, cadastro: null, pgfn: evidence('inscricoes', [{ ...rows[0], cpfCnpj: '11222333000181' }]), reportId: 'x', version: 1 }), /TAXPAYER_MISMATCH/);
  assert.throws(() => preliminaryReport({ cnpj: CNPJ, cadastro: null, pgfn: evidence('inscricoes', [{ ...rows[2], valorTotalConsolidadoMoeda: '10,00' }]), reportId: 'x', version: 1 }), /EXTINCT_WITH_BALANCE/);
});
test('cliente PGFN distingue 404 "não encontrado", erros de acesso e credenciais ausentes', async () => {
  await assert.rejects(consultDividaAtiva(CNPJ, empty, fakeFetch(200, rows)), (e: PgfnError) => e.code === 'credentials_missing');
  const found = await consultDividaAtiva(CNPJ, env, fakeFetch(200, rows), 'run-1');
  assert.equal(found.outcome, 'inscricoes'); assert.equal(found.rows.length, 3); assert.equal(found.sha256.length, 64);
  const none = await consultDividaAtiva(CNPJ, env, fakeFetch(404, [{ message: 'CNPJ não encontrado.' }]));
  assert.equal(none.outcome, 'sem_inscricoes'); assert.equal(none.httpStatus, 404);
  await assert.rejects(consultDividaAtiva(CNPJ, env, fakeFetch(404, { error: 'route' })), (e: PgfnError) => e.code === 'unexpected_status');
  await assert.rejects(consultDividaAtiva(CNPJ, env, fakeFetch(403, [])), (e: PgfnError) => e.code === 'auth_failed');
  await assert.rejects(consultDividaAtiva(CNPJ, env, fakeFetch(200, [{ ...rows[0], cpfCnpj: '11222333000181' }])), (e: PgfnError) => e.code === 'taxpayer_mismatch');
  await assert.rejects(consultDividaAtiva('123', env, fakeFetch(200, rows)), (e: PgfnError) => e.code === 'invalid_cnpj');
  assert.equal((await consultCadastro(CNPJ, empty, fakeFetch(200, [], 403)))?.name, 'FALLBACK LTDA');
  assert.equal(await consultCadastro(CNPJ, { ...empty, FS_CADASTRO_PROVIDER_URL: 'https://brasilapi.com.br/api/cnpj/v1' }, fakeFetch(200, [], 500)), null);
  assert.equal((await consultCadastro(CNPJ, empty, fakeFetch(200, [])))?.city, 'CURITIBA');
});
test('fluxo do botão arquiva parecer + evidência e reutiliza dentro da janela sem nova consulta', async () => {
  const fetchImpl = fakeFetch(200, rows);
  const first = await runPreliminaryDiagnostic('04.907.399/0001-40', 'user-1', { env, fetchImpl });
  assert.equal(first.reused, false); assert.equal(first.version, 1); assert.match(first.id, /^doc_/); assert.equal(first.reportUrl, `/diagnostico/${first.id}`);
  assert.equal(fetchImpl.calls.filter(u => u.includes('/devedor/')).length, 1);
  const saved = await savedReport(first.id); assert.equal(saved?.company.cnpj, CNPJ); assert.equal(saved?.sources.find(s => s.id === 'rfb')?.status, 'pendente');
  const [row] = await query('SELECT source_id, http_status, sha256, content FROM fs_diagnostic_evidence WHERE document_id=$1', [first.id.slice(4)]);
  assert.equal(row.source_id, 'pgfn'); assert.equal(Number(row.http_status), 200); assert.equal(row.sha256, saved?.sources.find(s => s.id === 'pgfn')?.note.match(/SHA-256: ([0-9a-f]{64})/)?.[1]);
  assert.deepEqual(JSON.parse(Buffer.from(row.content as Uint8Array).toString('utf8')), rows);
  const second = await runPreliminaryDiagnostic(CNPJ, 'user-2', { env, fetchImpl });
  assert.equal(second.reused, true); assert.equal(second.id, first.id);
  assert.equal(fetchImpl.calls.filter(u => u.includes('/devedor/')).length, 1);
  const third = await runPreliminaryDiagnostic(CNPJ, 'user-1', { env: { ...env, FS_DIAGNOSTIC_REUSE_HOURS: '0' }, fetchImpl, now: () => new Date(Date.now() + 1000) });
  assert.equal(third.reused, false); assert.equal(third.version, 2); assert.notEqual(third.id, first.id);
  assert.equal(fetchImpl.calls.filter(u => u.includes('/devedor/')).length, 2);
  const forced = await runPreliminaryDiagnostic(CNPJ, 'user-1', { env, fetchImpl, force: true, now: () => new Date(Date.now() + 2000) });
  assert.equal(forced.reused, false); assert.equal(forced.version, 3);
  assert.equal(fetchImpl.calls.filter(u => u.includes('/devedor/')).length, 3);
  const [audit] = await query("SELECT COUNT(*) AS n FROM fs_document_audit WHERE action IN ('app-diagnostic-preliminary','app-diagnostic-reused')");
  assert.equal(Number(audit.n), 4);
});

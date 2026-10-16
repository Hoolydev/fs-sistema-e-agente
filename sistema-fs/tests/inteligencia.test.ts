import test from 'node:test';
import assert from 'node:assert/strict';
import { inExecution, intelligence, natureOf, stageOf } from '../lib/diagnostico/inteligencia';
import { buildOpinion } from '../lib/diagnostico/opinion';
import { validateReport, type Debt } from '../lib/diagnostico/model';

const debt = (d: Partial<Debt> & Pick<Debt, 'id' | 'origin' | 'tax' | 'total'>): Debt => ({ period: 'Não informado', status: 'ATIVA EM COBRANCA', administrativeProcess: null, judicialProcess: null, registeredAt: null, principal: null, fine: null, interest: null, charges: null, sourceId: d.origin.toLowerCase(), ...d });
const report = (debts: Debt[], certificateNote = 'Sem certidão.') => validateReport({
  id: 'T-1', version: 1, mode: 'real', company: { name: 'EMPRESA TESTE', cnpj: '11222333000181', regime: 'A confirmar' }, generatedAt: '2026-10-15T12:00:00.000Z',
  scope: 'teste', summary: 'teste', debts, sources: [{ id: 'rfb', title: 'SITFIS', provider: 'RFB', collectedAt: '2026-10-15T12:00:00.000Z', status: 'coletado', note: 'x' }, { id: 'pgfn', title: 'PGFN', provider: 'PGFN', collectedAt: '2026-10-15T12:00:00.000Z', status: 'coletado', note: 'x' }],
  capag: { rating: null, amount: null, note: 'x' }, sections: [], pending: ['x'], recommendations: ['x'], conclusion: 'x',
  supplements: [{ title: 'SITFIS - parcelamentos, processos, omissões e demais registros', note: 'x', headers: ['Seção', 'Registro'], rows: [['Pendência - Inscrição (Sistema DIVIDA)', 'Inscrição: 16.204.879-3 Situação: 000535 - AJUIZAMENTO / DISTRIBUICAO · Inscrição: 16.993.038-6 Situação: 000520 - INSCRICAO DE CREDITO EM DIVIDA ATIVA'], ['Pendência - Processo Fiscal (SIEF)', '10875.913.567/2025-79 DEVEDOR SETOR']] }],
  opinion: { scenario: null, capagDebtBasis: null, capagBasisNote: 'x', annualRevenue: null, revenuePeriod: 'x', deadline: null, releaseDate: null, windowNote: 'x', rescissionNote: 'x', judicialNote: 'x', certificateNote, capagReview: 'x', legalBasis: [], actions: [], caveats: [], conclusion: 'x' },
});

test('natureza pelo código de receita: retidos e descontados separados, terceiros não são previdenciária', () => {
  assert.equal(natureOf('4133-CONTR. SEGURADOS').nature, 'descontados');
  assert.equal(natureOf('1082-01 - CP-SEGUR.').nature, 'descontados');
  assert.equal(natureOf('4156-CONTR. EMPREGADOR').nature, 'previdenciaria');
  assert.equal(natureOf('1170-01 - CP-TERCEIROS').nature, 'terceiros');
  assert.equal(natureOf('1772-RET CONT PG PJ D PRI').nature, 'retidos');
  assert.deepEqual(natureOf('3560-IRPJ FONTE'), { nature: 'retidos', confirm: 'sigla "IRPJ FONTE" ambígua' });
  assert.equal(natureOf('5952-07 - CSRF').nature, 'retidos');
  assert.equal(natureOf('2203-01 - MAED EFD-CONTR').nature, 'multa');
  assert.equal(natureOf('9999-CONTRIBUICAO SENAI').nature, 'terceiros');
  assert.equal(natureOf('9998-ALGO NOVO').nature, 'outros');
});

test('estágio da cobrança: "a ser ajuizada" não é execução, mesmo em payload antigo com referência judicial', () => {
  assert.equal(stageOf('ATIVA A SER AJUIZADA'), 'a_ser_ajuizada');
  assert.equal(stageOf('ATIVA AJUIZADA - GARANTIA - DEPOSITO'), 'ajuizada_garantia');
  assert.equal(stageOf('ATIVA AJUIZADA NEGOCIADA NO SISPAR'), 'negociada');
  const old = debt({ id: 'a', origin: 'PGFN', tax: '3551-IRPJ', total: 100, status: 'ATIVA A SER AJUIZADA', judicialProcess: 'Ajuizada (número do juízo não informado na fonte)' });
  assert.equal(inExecution(old), false);
  assert.equal(inExecution({ ...old, status: 'ATIVA AJUIZADA NEGOCIADA NO SISPAR', judicialProcess: null }), true);
});

test('parcelamento ordinário exclui retidos e descontados; leituras de idade, competência, certidão e DIVIDA', () => {
  const r = report([
    debt({ id: '80 2 20 000001-01', origin: 'PGFN', tax: '3551-IRPJ', total: 600_000, status: 'ATIVA AJUIZADA', registeredAt: '18/05/2020', administrativeProcess: '10136 540252/2020-47' }),
    debt({ id: '80 2 24 000002-02', origin: 'PGFN', tax: '3560-IRPJ FONTE', total: 50_000, status: 'ATIVA A SER AJUIZADA', registeredAt: '05/07/2024', administrativeProcess: '10875 403461/2019-13' }),
    debt({ id: '80 4 24 000003-03', origin: 'PGFN', tax: '4133-CONTR. SEGURADOS', total: 30_000, registeredAt: '05/07/2024', administrativeProcess: '10875 403461/2023-13' }),
    debt({ id: 'RFB-DEV-001', origin: 'RFB', tax: '1138-01 - CP-PATRONAL', period: '01/2026', status: 'DEVEDOR · vencimento 20/02/2026', principal: 10_000, total: 12_000 }),
    debt({ id: 'RFB-DEV-002', origin: 'RFB', tax: '0561-07 - IRRF', period: '02/2026', status: 'DEVEDOR · vencimento 20/03/2026', principal: 20_000, total: 24_000 }),
    debt({ id: 'RFB-DEV-003', origin: 'RFB', tax: '2203-01 - MAED EFD-CONTR', period: '16/04/2026', status: 'DEVEDOR · vencimento 21/05/2026', principal: 500, total: 500 }),
  ], 'O SITFIS registra certidão: X Emissão: 19/04/2023 Data de Validade: 16/10/2023.');
  const ix = intelligence(r);
  assert.deepEqual([ix.ordinary.pgfn.eligible, ix.ordinary.pgfn.excluded], [600_000, 80_000]);
  assert.deepEqual([ix.ordinary.rfb.eligible, ix.ordinary.rfb.excluded], [12_500, 24_000]);
  assert.deepEqual(ix.ordinary.pgfn.plan, { total: 600_000, count: 60, regular: 10_000, last: 10_000 });
  assert.deepEqual([ix.execution.count, ix.filing.count, ix.plainCollection.count], [1, 1, 1]);
  assert.deepEqual(ix.years.map(y => [y.year, y.count, y.execution]), [['2020', 1, 1], ['2024', 2, 0]]);
  // Multa acessória fica fora da série de competências e da média mensal.
  assert.deepEqual(ix.competences.map(c => c.period), ['01/2026', '02/2026']);
  assert.deepEqual(ix.monthlyAverage, { year: '2026', months: 2, principal: 15_000, first: '01/2026', last: '02/2026' });
  assert.equal(ix.oldestDue?.toISOString().slice(0, 10), '2026-02-20');
  assert.deepEqual(ix.triage.map(t => t.debt.id), ['80 2 20 000001-01', '80 2 24 000002-02']);
  assert.equal(ix.certificateExpired, true);
  assert.deepEqual(ix.dividaBySituation, [['em ajuizamento/distribuição', 1], ['inscritas em dívida ativa', 1]]);
  assert.deepEqual(ix.fiscalProcesses, ['10875.913.567/2025-79']);
  const text = JSON.stringify(buildOpinion(r).pages);
  for (const piece of ['O que é urgente', '9.3. Referência: parcelamento ordinário', '3.3. Situação das inscrições na PGFN', '11.1. Triagem de prazos', 'Certidão vencida', 'Pontos de atenção']) assert.ok(text.includes(piece), piece);
  // Sem cenário, a página de desembolso vazia não existe; as 17 seções continuam.
  assert.equal(buildOpinion(r).pages.some(p => p.title === 'DESEMBOLSO E PONTOS DE ATENÇÃO'), false);
  for (let n = 1; n <= 17; n++) assert.ok(text.includes(`"${n}. `), `seção ${n}`);
});

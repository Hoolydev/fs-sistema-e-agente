import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strategicModel, transactionCeiling } from '../lib/diagnostico/estrategico';
import { generateStrategicPdf, generateSummaryPdf } from '../lib/diagnostico/pdf-estrategico';
import { validateReport, type Debt } from '../lib/diagnostico/model';

const at = '2026-10-21T12:00:00.000Z';
const debt = (d: Partial<Debt> & Pick<Debt, 'id' | 'origin' | 'tax' | 'total'>): Debt => ({ period: 'Não informado', status: 'ATIVA EM COBRANCA', administrativeProcess: null, judicialProcess: null, registeredAt: null, principal: null, fine: null, interest: null, charges: null, sourceId: d.origin.toLowerCase(), ...d });
const report = (debts: Debt[], extra: Record<string, unknown> = {}) => validateReport({
  id: 'T-VOX', version: 1, mode: 'real', company: { name: 'EMPRESA TESTE LTDA', cnpj: '11222333000181', regime: 'A confirmar' }, generatedAt: at, scope: 'x', summary: 'x', debts,
  sources: [{ id: 'rfb', title: 'SITFIS', provider: 'RFB', collectedAt: at, status: 'coletado', note: 'x' }, { id: 'pgfn', title: 'PGFN', provider: 'PGFN', collectedAt: at, status: 'coletado', note: 'x' }],
  capag: { rating: null, amount: null, note: 'x' }, sections: [], pending: ['x'], recommendations: ['x'], conclusion: 'x',
  opinion: { scenario: null, capagDebtBasis: null, capagBasisNote: 'x', annualRevenue: null, revenuePeriod: 'x', deadline: null, releaseDate: null, windowNote: 'x', rescissionNote: 'x', judicialNote: 'x', certificateNote: 'O SITFIS registra certidão positiva com efeitos de negativa: 4431.4D62.C27E.42AE Emissão: 01/06/2026 Data de Validade: 28/11/2026.', capagReview: 'x', legalBasis: [], actions: [], caveats: [], conclusion: 'x' },
  ...extra,
});
const cdas = [
  debt({ id: '32 5 26 004937-35', origin: 'PGFN', tax: '3623-MULTA CLT', total: 485_001_976, principal: 325_371_477, fine: 98_000_000, interest: 18_000_000, charges: 43_630_499, registeredAt: '20/07/2026' }),
  debt({ id: '32 5 26 004942-00', origin: 'PGFN', tax: '3623-MULTA CLT', total: 310_180, principal: 208_090, fine: 60_000, interest: 10_000, charges: 32_090, registeredAt: '20/07/2026' }),
];
const rfb = [
  debt({ id: 'RFB-DEV-001', origin: 'RFB', tax: '5856-01 - COFINS', period: '04/2026', status: 'DEVEDOR · vencimento 25/05/2026', principal: 188_726_969, fine: 37_745_393, interest: 10_398_855, total: 236_871_217 }),
  debt({ id: 'RFB-DEV-002', origin: 'RFB', tax: '0561-07 - IRRF', period: '06/2026', status: 'DEVEDOR · vencimento 20/07/2026', principal: 472_358, fine: 94_471, interest: 14_973, total: 581_802 }),
];

test('transação pelo teto legal só com CAPAG C/D e composição; desconto nunca alcança o principal', () => {
  assert.equal(transactionCeiling(report(cdas)).available, false);
  const tx = transactionCeiling(report(cdas, { capag: { rating: 'C', amount: 782_697_316, note: 'x' } }));
  assert.ok(tx.available);
  if (!tx.available) return;
  // Acessórios (~33%) abaixo de 65%: o desconto zera multa, juros e encargo e o valor final é o principal.
  assert.deepEqual(tx.rows.map(r => r.final), [325_371_477, 208_090]);
  assert.equal(tx.discount, 485_001_976 + 310_180 - 325_371_477 - 208_090);
  assert.equal(tx.entry, Math.round((485_001_976 + 310_180) * 0.06));
  const b = transactionCeiling(report(cdas, { capag: { rating: 'B', amount: 1, note: 'x' } }));
  assert.ok(b.available && b.discount === 0);
});

test('resumo e diagnóstico: frentes, desembolso, certidão e sem encontro de contas automático', () => {
  const m = strategicModel(report([...cdas, ...rfb], { capag: { rating: 'C', amount: 782_697_316, note: 'x' } }));
  assert.deepEqual(m.fronts.map(f => f.name), ['Receita Federal', 'PGFN']);
  assert.match(m.fronts[0]!.solution, /Parcelamento ordinário em até 60 parcelas; retidos e descontados \(R\$\s5\.818,02\)/);
  assert.equal(m.summaryKpis[2]!.value, 'Vence 28/11/2026');
  assert.match(m.summaryKpis[4]!.value, /^até R\$/);
  assert.notEqual(m.summaryKpis[3]!.value, 'A apurar');
  assert.ok(m.mapGroups.find(g => g.title.startsWith('A.'))!.rows.every(r => r.certidao === 'Impede'));
  const all = JSON.stringify(m);
  assert.equal(/encontro de contas|deságio|desagio/i.test(all), false);
  // Sem CAPAG: nada de desconto presumido, desembolso a apurar.
  const pending = strategicModel(report([...cdas, ...rfb]));
  assert.equal(pending.summaryKpis[3]!.value, 'A apurar'); assert.equal(pending.summaryKpis[4]!.value, 'A apurar');
  const logo = readFileSync('public/brand/fs-horizontal.png');
  for (const pdf of [generateStrategicPdf(report([...cdas, ...rfb]), logo), generateSummaryPdf(report([...cdas, ...rfb]), logo)]) assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), '%PDF-');
});

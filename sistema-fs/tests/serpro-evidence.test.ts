import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brlToCents, reportFromSerpro } from '../lib/diagnostico/serpro-evidence';
import { summarize } from '../lib/diagnostico/model';
import { opinionMetrics, buildOpinion } from '../lib/diagnostico/opinion';
const cnpj='12345678000195';
const text=`CNPJ: 12.345.678 - EMPRESA SINTÉTICA
Dados Cadastrais da Matriz __________
CNPJ: 12.345.678/0001-95
Pendência - Débito (SIEF) __________
Receita PA/Exerc. Dt. Vcto
2089-01 - IRPJ 1º
TRIM/2026 30/04/2026 150,00 100,00 20,00 5,00 125,00 DEVEDOR
Débito com Exigibilidade Suspensa (SIEF) __________
Receita PA/Exerc. Dt. Vcto
0561-07 - IRRF 08/2026 18/09/2026 60,00 50,00 A ANALISAR-A VENCER
Diagnóstico Fiscal na Procuradoria-Geral
Pendência - Inscrição (SIDA) __________
20.2.26.000001-00 3551-IRPJ 20/07/2026 11111.111.111/2026-11 DEVEDOR PRINCIPAL
Situação: ATIVA EM COBRANCA`;
const active={cpfCnpj:cnpj,numeroInscricao:'2022600000100',valorTotalConsolidadoMoeda:'1.250,00',situacaoDescricao:'ATIVA EM COBRANCA',numeroProcesso:'11111111111202611',dataInscricao:'20/07/2026'};
const input={cnpj,rfbText:text,pgfn:[active,{...active,numeroInscricao:'2022600000200',valorTotalConsolidadoMoeda:'0,00',situacaoDescricao:'EXTINTA POR PAGAMENTO DEVOLVIDA OU ARQUIVADA'}],collectedAt:'2026-09-16T22:12:36.000Z',rfbHash:'synthetic-rfb',pgfnHash:'synthetic-pgfn',reportId:'TEST-001',version:1};
test('concilia centavos, não soma extintas/a vencer e não inventa composição ou desconto',()=>{
 const report=reportFromSerpro(input), m=opinionMetrics(report);
 assert.deepEqual(summarize(report),{rfb:12500,pgfn:125000,total:137500,count:1});
 assert.equal(report.debts[0].principal,10000);assert.equal(report.debts[0].charges,null);
 assert.equal(report.debts[1].tax,'3551-IRPJ'); assert.equal(m.discount,null);assert.equal(m.final,null);assert.equal(m.entry,null);
 assert.deepEqual(m.composition,[null,null,null,null]);assert.equal(report.supplements?.[1].rows[0][3],'R$ 50,00');
 const pages=buildOpinion(report).pages;assert.equal(pages.length,14);assert.ok(pages.some(p=>p.blocks.some(b=>b.type==='heading'&&b.text==='17. Conclusão')));
});
test('recusa divergência de CNPJ, valor, situação e inscrição',()=>{
 assert.throws(()=>reportFromSerpro({...input,cnpj:'47733961000179'}),/TAXPAYER/);
 assert.throws(()=>reportFromSerpro({...input,pgfn:[{...active,cpfCnpj:'47733961000179'}]}),/TAXPAYER/);
 assert.throws(()=>reportFromSerpro({...input,pgfn:[active,active]}),/DUPLICATE/);
 assert.throws(()=>reportFromSerpro({...input,rfbText:text.replace('125,00','126,00')}),/COMPONENT/);
 assert.throws(()=>reportFromSerpro({...input,rfbText:text.replace('DEVEDOR\nDébito','DEVEDOR\nLINHA NÃO INTERPRETADA\nDébito')}),/UNPARSED/);
 assert.throws(()=>reportFromSerpro({...input,pgfn:[{...active,situacaoDescricao:'EXTINTA'}]}),/EXTINCT/);
 assert.throws(()=>reportFromSerpro({...input,pgfn:[{...active,situacaoDescricao:'DESCONHECIDA'}]}),/STATUS/);
 assert.throws(()=>reportFromSerpro({...input,pgfn:[{...active,numeroInscricao:'2022600000300'}]}),/RECONCILIATION/);
});
test('conversão monetária é estrita e exata',()=>{
 assert.equal(brlToCents('1.234.567,89'),123456789);assert.equal(brlToCents('0,00'),0);
 for(const value of ['', '123.45', '-1,00', 'Não informado'])assert.throws(()=>brlToCents(value));
});

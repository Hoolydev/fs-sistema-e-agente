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
__________ Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional __________
Pendência - Inscrição (SIDA) __________
20.2.26.000001-00 3551-IRPJ 20/07/2026 11111.111.111/2026-11 DEVEDOR PRINCIPAL
Situação: ATIVA EM COBRANCA
__________
Final do Relatório`;
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
// Layout sem débito em cobrança na Receita: só omissão, parcelamentos e inscrições negociadas (observado em 06/10/2026).
const negotiated=`CNPJ: 12.345.678 - EMPRESA SINTÉTICA
Dados Cadastrais da Matriz __________
CNPJ: 12.345.678/0001-95
Certidão Emitida __________
Certidão Positiva com Efeitos de Negativa: AAAA.BBBB.CCCC.DDDD Emissão: 01/06/2026 Data de Validade: 01/12/2026
__________ Diagnóstico Fiscal na Receita Federal __________
Pendência - Omissão de DCTFWeb* __________
(Período de Apuração) 2026 - JUN
*Ausência de entrega de DCTFWeb original ou de retificadora em andamento
Processo de Arrolamento de Bens (SIEF) __________
Processo Localização
10000.000.000/2025-00 DELEGACIA SINTÉTICA
Parcelamento com Exigibilidade Suspensa (SIEFPAR) __________
Parcelamento: 0211.00012.0000000000.22-02 Valor Suspenso: 1.000,00
Parcelamento Simplificado
Parcelamento: 0278.00012.0000000000.24-90 Valor Suspenso: 2.500,50
Débito com Exigibilidade Suspensa (SICOB) __________
Parcelamento: 11.111.111-1 Situação: 000001 - ATIVO/EM DIA
__________ Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional __________
Inscrição com Exigibilidade Suspensa (SIDA) __________
Inscrição Receita Inscrito em Ajuizado em Processo Tipo de Devedor
20.2.26.000001-00 4133-CONTR.
SEGURADOS 20/07/2026 11111.111.111/2026-11 DEVEDOR PRINCIPAL
Situação: ATIVA AJUIZADA NEGOCIADA NO SISPAR
Página: 1 /2
-- 1 of 2 --
CNPJ: 12.345.678 - EMPRESA SINTÉTICA
20.2.26.000002-91 0810-PIS 20/07/2026 11111.111.111/2026-11 DEVEDOR PRINCIPAL
Situação: ATIVA AJUIZADA NEGOCIADA NO SISPAR
Parcelamento com Exigibilidade Suspensa (SISPAR) __________
Conta
000000001 PROGRAMA SINTÉTICO
Modalidade: DEMAIS DEBITOS
__________
Final do Relatório`;
test('aceita SITFIS sem débito em cobrança na Receita e separa parcelamentos e omissões',()=>{
 const pgfn=['2022600000100','2022600000291'].map((n,i)=>({...active,numeroInscricao:n,valorTotalConsolidadoMoeda:i?'500,00':'1.250,00',situacaoDescricao:'ATIVA AJUIZADA NEGOCIADA NO SISPAR'}));
 const report=reportFromSerpro({...input,rfbText:negotiated,pgfn});
 assert.deepEqual(summarize(report),{rfb:0,pgfn:175000,total:175000,count:2});
 assert.equal(report.debts[0].tax,'4133-CONTR. SEGURADOS');
 assert.match(report.summary,/nenhum débito em cobrança na Receita Federal/);assert.match(report.summary,/R\$\s3\.500,50/);assert.match(report.summary,/DCTFWeb|2026 - JUN/);
 const extra=report.supplements?.find(s=>s.title.startsWith('SITFIS'));
 assert.equal(extra?.rows.length,5);assert.ok(!report.supplements?.some(s=>s.title.startsWith('Receita Federal - composição')));
 assert.ok(buildOpinion(report).pages.some(p=>p.blocks.some(b=>b.type==='heading'&&b.text==='17. Conclusão')));
});
test('seção desconhecida ou relatório incompleto interrompem a emissão',()=>{
 assert.throws(()=>reportFromSerpro({...input,rfbText:text.replace('Débito com Exigibilidade Suspensa (SIEF)','Pendência - Parcelamento (SIEFPAR)')}),/SECTION_UNSUPPORTED/);
 assert.throws(()=>reportFromSerpro({...input,rfbText:text.replace('Final do Relatório','')}),/INCOMPLETE/);
 assert.throws(()=>reportFromSerpro({...input,rfbText:negotiated.replace('0810-PIS 20/07/2026','0810-PIS')}),/SIDA_UNPARSED/);
});

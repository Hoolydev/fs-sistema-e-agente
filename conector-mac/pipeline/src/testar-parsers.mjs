/**
 * Teste dos parsers contra os documentos reais que ja temos em out/.
 * Uso: npm test
 *
 * Nao e suite de unidade formal: e a conferencia de que a leitura dos numeros
 * bate com o que esta escrito no PDF oficial. Roda em segundos e e a rede de
 * seguranca antes de qualquer diagnostico sair daqui.
 */
import { extrairTextoPdf } from './lib/dossie.mjs'
import {
  relatorioSituacaoFiscal,
  cadastro,
  certidao,
  pendenciasSief,
  resumoSief,
  contasSispar,
  totaisDividaAtiva,
  valor,
  data,
} from './lib/parsers.mjs'

let falhas = 0
const ok = (cond, msg, extra = '') => {
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${msg}${extra ? ` (${extra})` : ''}`)
  if (!cond) falhas++
}

const brl = (n) => (n == null ? 'null' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))

console.log('\nvalor() e data()')
ok(valor('1.234,56') === 1234.56, 'valor com milhar')
ok(valor('R$ 780.074,23') === 780074.23, 'valor com prefixo')
ok(valor('32,65') === 32.65, 'valor sem milhar')
ok(data('23/06/2024')?.getUTCFullYear() === 2024, 'data pt-BR')
ok(data('sem data') === null, 'data ausente')

console.log('\nSituacao fiscal da GABB')
const sf = await extrairTextoPdf(
  'out/11222333000181/2026-08-03/Situacao Fiscal EMPRESA DEMONSTRATIVA LTDA 03-08-2026.pdf'
)
const cad = cadastro(sf.texto)
ok(cad.cnpj === '04.403.688/0001-01', 'CNPJ', cad.cnpj)
ok(/GABB/.test(cad.razao ?? ''), 'razao social', cad.razao)
ok(cad.uf === 'RS', 'UF', cad.uf)
ok(cad.situacao === 'ATIVA', 'situacao cadastral', cad.situacao)
ok(cad.abertura === '16/04/2001', 'data de abertura', cad.abertura)

const cert = certidao(sf.texto, new Date(Date.UTC(2026, 7, 6, 12)))
ok(cert.numero === 'A2C9.8D92.6A22.4D94', 'numero da certidao', cert.numero)
ok(cert.validade === '23/06/2024', 'validade', cert.validade)
ok(cert.situacao === 'vencida', 'certidao vencida')
ok(cert.diasSemCertidao === 774, 'dias sem certidao', String(cert.diasSemCertidao))

const rel = relatorioSituacaoFiscal(sf.texto, new Date(Date.UTC(2026, 7, 6, 12)))
const sief = rel.sief.exigivel
const resumo = rel.sief.resumo
ok(sief.length === 47, 'debitos SIEF exigiveis lidos', String(sief.length))
ok(
  sief.some((d) => d.codigo === '3373-01' && d.periodo === '4º TRIM/2025' && d.saldoConsolidado === 39823.42),
  'IRPJ trimestral, que vinha partido em duas linhas'
)
ok(rel.sief.suspenso.length === 6, 'debitos SIEF suspensos', String(rel.sief.suspenso.length))
ok(rel.sida.pendentes.length > 0, 'inscricoes SIDA pendentes', String(rel.sida.pendentes.length))
ok(rel.sida.suspensas.length > 0, 'inscricoes SIDA suspensas', String(rel.sida.suspensas.length))
ok(
  rel.sida.pendentes[0].inscricao === '00.3.26.000963-09',
  'primeira inscricao',
  rel.sida.pendentes[0].inscricao
)
ok(/ATIVA/.test(rel.sida.pendentes[0].situacao ?? ''), 'situacao da inscricao', rel.sida.pendentes[0].situacao)
ok(rel.sispar.pendentes.length === 3, 'contas SISPAR pendentes', String(rel.sispar.pendentes.length))
ok(rel.sispar.suspensos.length === 2, 'contas SISPAR suspensas', String(rel.sispar.suspensos.length))
ok(
  /PARCELAMENTO SEM GARANTIA/i.test(rel.sispar.pendentes[2].modalidade ?? ''),
  'modalidade da conta lida da linha seguinte'
)
ok(rel.siefpar.pendentes.length === 4, 'parcelamentos SIEFPAR em atraso', String(rel.siefpar.pendentes.length))
ok(rel.siefpar.pendentes[0].valorEmAtraso === 52277.48, 'valor em atraso', brl(rel.siefpar.pendentes[0].valorEmAtraso))
ok(rel.siefpar.suspensos.length === 3, 'parcelamentos SIEFPAR suspensos', String(rel.siefpar.suspensos.length))
ok(rel.secoes.length >= 10, 'secoes identificadas', String(rel.secoes.length))
ok(sief[0].codigo === '1708-06' && sief[0].tributo === 'IRRF', 'primeiro debito', `${sief[0].codigo} ${sief[0].tributo}`)
ok(sief[0].saldoConsolidado === 38.0, 'saldo do primeiro debito', brl(sief[0].saldoConsolidado))
ok(
  sief.some((d) => d.codigo === '5123-01' && d.vencimento === '24/04/2026' && d.saldoConsolidado === 98518.8),
  'IPI de 03/2026 com saldo de 98.518,80'
)
ok(
  sief.every((d) => d.saldoConsolidado >= d.saldoDevedor),
  'consolidado nunca menor que o principal'
)
ok(resumo.consolidado > 0, 'total consolidado do SIEF', brl(resumo.consolidado))
ok(
  Math.abs(resumo.principal + resumo.multa + resumo.juros - resumo.consolidado) < 1,
  'principal + multa + juros fecha com o consolidado',
  `${brl(resumo.principal + resumo.multa + resumo.juros)} vs ${brl(resumo.consolidado)}`
)
console.log(`       maiores tributos: ${resumo.porTributo.slice(0, 3).map((t) => `${t.tributo} ${brl(t.total)}`).join(', ')}`)
console.log(`       acessorios: ${(resumo.percentualAcessorios * 100).toFixed(1)}% do saldo`)

console.log('\nRelatorio consolidado da divida (documento de referencia)')
const dv = await extrairTextoPdf('out/referencia/Regularize_Relatorio_Divida_Ativa_31072026-1455.pdf')
const div = totaisDividaAtiva(dv.texto)
ok(div.quantidade === 3, 'quantidade de inscricoes', String(div.quantidade))
ok(div.valorTotal === 780074.23, 'valor total da divida', brl(div.valorTotal))
ok(div.vazio === false, 'relatorio nao vazio')
ok(div.naturezas.some((n) => /Simples Nacional/i.test(n.natureza)), 'natureza identificada', JSON.stringify(div.naturezas))

console.log('\nRelatorio vazio e detectado')
const vazio = totaisDividaAtiva('Relatorio Consolidado da Divida\nNaturezas selecionadas:\nSituacoes selecionadas:')
ok(vazio.vazio === true, 'relatorio sem inscricoes marcado como vazio')

console.log('\nContas SISPAR')
// O titulo vem sempre seguido da regua de underscores no PDF real, e e por ela
// que as secoes sao fatiadas.
const contas = contasSispar(
  [
    'Parcelamento com Exigibilidade Suspensa (SISPAR) ______________________________',
    '010099052 TRANSACAO POR ADESAO EDITAL PGDAU 01/2024',
    'Modalidade: MICROEMPRESA E PEQUENO PORTE ATE 145 MESES',
    '011391476 PARCELAMENTO CONVENCIONAL',
    'Modalidade: PARCELAMENTO SEM GARANTIA SIMPLES NACIONAL',
  ].join('\n')
)
ok(contas.length === 2, 'duas contas lidas', String(contas.length))
ok(contas[0].conta === '010099052', 'numero da conta', contas[0].conta)

console.log('\nConferencia de valores do diagnostico')
const { conferirValores } = await import('./lib/conferencia.mjs')

const fonte = { a: 100.0, b: 250.5, lista: [{ v: 49.5 }] }

const semLastro = conferirValores({ texto: 'total de R$ 999,99' }, fonte)
ok(semLastro.suspeitos.length === 1, 'valor inventado e sinalizado')

const direto = conferirValores({ texto: 'saldo de R$ 250,50' }, fonte)
ok(direto.suspeitos.length === 0, 'valor que esta na fonte passa')

const somado = conferirValores(
  {
    texto: 'o passivo alcanca R$ 400,00',
    derivacoes: [{ valor: 400.0, conta: 'soma das tres rubricas', parcelas: [100.0, 250.5, 49.5] }],
  },
  fonte
)
ok(somado.suspeitos.length === 0 && somado.derivacoesOk === 1, 'soma declarada e conferida')

const somaErrada = conferirValores(
  {
    texto: 'o passivo alcanca R$ 500,00',
    derivacoes: [{ valor: 500.0, conta: 'soma torta', parcelas: [100.0, 250.5] }],
  },
  fonte
)
ok(somaErrada.suspeitos.length === 1, 'soma que nao fecha continua sinalizada')
ok(/parcelas somam/.test(somaErrada.suspeitos[0].motivo), 'motivo diz quanto as parcelas somam', somaErrada.suspeitos[0].motivo)

const parcelaInventada = conferirValores(
  {
    texto: 'total de R$ 1.100,00',
    derivacoes: [{ valor: 1100.0, conta: 'soma com parcela fantasma', parcelas: [100.0, 1000.0] }],
  },
  fonte
)
ok(parcelaInventada.suspeitos.length === 1, 'parcela que nao existe na fonte invalida a conta')

const cascata = conferirValores(
  {
    texto: 'subtotal de R$ 350,50 e total de R$ 400,00',
    derivacoes: [
      { valor: 350.5, conta: 'subtotal', parcelas: [100.0, 250.5] },
      { valor: 400.0, conta: 'total, somando o subtotal', parcelas: [350.5, 49.5] },
    ],
  },
  fonte
)
ok(cascata.suspeitos.length === 0 && cascata.derivacoesOk === 2, 'soma de subtotal, em cascata, e aceita')

const porcentagem = conferirValores(
  {
    texto: 'o encargo e de R$ 20,10',
    derivacoes: [{ valor: 20.1, conta: 'encargo de 20%', percentualDe: 100.5, percentual: 20 }],
  },
  { base: 100.5 }
)
ok(porcentagem.suspeitos.length === 0, 'percentual sobre valor da fonte e aceito')

const porcentagemSemBase = conferirValores(
  {
    texto: 'o encargo e de R$ 20,10',
    derivacoes: [{ valor: 20.1, conta: 'encargo de 20%', percentualDe: 100.5, percentual: 20 }],
  },
  { outra: 7 }
)
ok(porcentagemSemBase.suspeitos.length === 1, 'percentual sobre base inventada e recusado')

console.log(`\n${falhas ? `${falhas} FALHA(S)` : 'todos os testes passaram'}\n`)
process.exit(falhas ? 1 : 0)

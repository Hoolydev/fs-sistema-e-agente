/**
 * Etapa 2 do fluxo: transforma a pasta de PDFs coletados num dossie que o
 * agente consegue ler, e ja extrai o que da pra extrair por regra fixa.
 *
 * Uso: npm run analisar -- --cnpj 11222333000181
 *      npm run analisar -- --pasta out/11222333000181/2026-08-06
 *
 * Sai em <pasta>/dossie/:
 *   dossie.md   texto de todas as fontes, com cabecalho de proveniencia
 *   dados.json  campos estruturados (cadastro, certidao, contas SISPAR, prazos)
 *
 * O que e regra fixa fica aqui, em codigo testavel. O que exige leitura
 * juridica fica com o agente. Numero nao se pede pra modelo adivinhar.
 */
import fs from 'node:fs'
import path from 'node:path'
import { log } from './lib/browser.mjs'
import { extrairTextoPdf, lerPasta, pareceTelaDeErro, lerCsv, csvsDaPasta } from './lib/dossie.mjs'
import {
  relatorioSituacaoFiscal,
  totaisDividaAtiva,
  prazosAbertos,
  prazosDoCsv,
  capacidadePagamento,
  extracaoDeclarada,
} from './lib/parsers.mjs'

/** Nome legivel da fonte, a partir do nome do arquivo da coleta. */
function fonteDoArquivo(nome = '') {
  if (/Situacao Fiscal/i.test(nome)) return 'Receita Federal e PGFN, relatório de situação fiscal'
  if (/Divida Ativa/i.test(nome)) return 'PGFN, portal Regularize'
  if (/CAPAG|Capacidade/i.test(nome)) return 'PGFN, SISPAR, capacidade de pagamento'
  if (/SISPAR/i.test(nome)) return 'PGFN, SISPAR'
  if (/Processos/i.test(nome)) return 'Receita Federal, e-Processo, processos digitais'
  if (/Intimacoes/i.test(nome)) return 'Receita Federal, e-Processo, comunicados e intimações'
  return 'Fonte oficial federal'
}

const args = process.argv.slice(2)
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)

function resolverPasta() {
  const explicita = arg('--pasta')
  if (explicita) return path.resolve(explicita)

  const cnpj = (arg('--cnpj') ?? '').replace(/\D/g, '')
  if (!cnpj) throw new Error('Informe --cnpj ou --pasta')
  const base = path.join(process.cwd(), 'out', cnpj)
  if (!fs.existsSync(base)) throw new Error(`Sem coleta para o CNPJ ${cnpj}`)
  const dias = fs.readdirSync(base).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  if (!dias.length) throw new Error(`Sem coleta datada em ${base}`)
  return path.join(base, dias[dias.length - 1])
}

const pasta = resolverPasta()
log(`Analisando ${pasta}`)

const { arquivos, proveniencia } = lerPasta(pasta)
if (!arquivos.length) throw new Error('Nenhum PDF na pasta')

const fontes = []
const invalidas = []
for (const arquivo of arquivos) {
  const texto = await extrairTextoPdf(arquivo)
  const nome = path.basename(arquivo)

  // Tela de erro nao e fonte. Se entrar no dossie, o agente a trata como
  // documento e o diagnostico nasce apoiado em nada.
  if (pareceTelaDeErro(texto.texto) || texto.texto.trim().length < 400) {
    const motivo = pareceTelaDeErro(texto.texto) ? 'tela de erro do portal' : 'praticamente vazio'
    invalidas.push({ arquivo: nome, motivo })
    log(`  ${nome}: DESCARTADO, ${motivo}`)
    continue
  }

  fontes.push({ arquivo: nome, paginas: texto.paginas, texto: texto.texto })
  log(`  ${nome}: ${texto.paginas} pagina(s), ${texto.texto.length} caracteres`)
}

const situacao = fontes.find((f) => /Situacao Fiscal/i.test(f.arquivo))?.texto ?? ''
const divida = fontes.find((f) => /Divida Ativa/i.test(f.arquivo))?.texto ?? ''
const capag = fontes.find((f) => /CAPAG|Capacidade/i.test(f.arquivo))?.texto ?? ''
const intimacoes = fontes.find((f) => /Intimacoes/i.test(f.arquivo))?.texto ?? ''

const relatorio = relatorioSituacaoFiscal(situacao)

// Os CSVs da exportacao nativa do e-Processo sao a fonte boa dos prazos e da
// relacao de processos: trazem a base completa, sem paginacao nem truncamento.
const tabelas = {}
for (const arquivo of csvsDaPasta(pasta)) {
  const nome = path.basename(arquivo)
  const { colunas, registros } = lerCsv(arquivo)
  const chave = /Intimacoes/i.test(nome) ? 'intimacoes' : /Processos/i.test(nome) ? 'processos' : nome
  tabelas[chave] = registros
  log(`  ${nome}: ${registros.length} registro(s), ${colunas.length} coluna(s)`)
}

const dados = {
  cnpj: proveniencia?.cnpj ?? null,
  razao: proveniencia?.razao ?? null,
  dataBase: proveniencia?.iniciadoEm ?? null,
  cadastro: relatorio.cadastro,
  certidao: relatorio.certidao,
  sief: relatorio.sief,
  sida: relatorio.sida,
  sispar: relatorio.sispar,
  siefpar: relatorio.siefpar,
  dividaAtiva: totaisDividaAtiva(divida),
  capacidadePagamento: capacidadePagamento(capag),
  processos: tabelas.processos ?? [],
  // Prefere o CSV. So cai no PDF, que vem paginado e truncado, se a exportacao
  // nativa nao tiver saido nesta coleta.
  prazos: tabelas.intimacoes ? prazosDoCsv(tabelas.intimacoes) : prazosAbertos(intimacoes),
  origemDosPrazos: tabelas.intimacoes ? 'CSV do e-Processo' : 'PDF da tela, possivelmente parcial',
  // O rodape de fontes do diagnostico sai daqui. Quando a coleta gravou
  // proveniencia, usamos o registro dela. Quando nao gravou, o horario vem do
  // cabecalho do proprio documento oficial, que e fonte ate melhor.
  fontes: (proveniencia?.fontes ?? []).length
    ? proveniencia.fontes.map((f) => ({
        fonte: f.fonte,
        detalhe: f.detalhe,
        arquivo: f.arquivo,
        hora: f.hora,
        origem: 'registro da coleta',
      }))
    : fontes
        .map((f) => {
          const extracao = extracaoDeclarada(f.texto)
          return {
            fonte: fonteDoArquivo(f.arquivo),
            detalhe: extracao ? `emitido em ${extracao.completo}` : 'sem horário declarado no documento',
            arquivo: f.arquivo,
            hora: extracao?.hora ?? null,
            origem: 'cabeçalho do documento',
          }
        }),
  // O que nao foi possivel apurar nesta coleta vira pendencia declarada no
  // diagnostico, no lugar de virar estimativa silenciosa.
  lacunas: [
    ...invalidas.map((i) => `${i.arquivo}: ${i.motivo}`),
    ...(totaisDividaAtiva(divida).vazio
      ? ['Relatorio consolidado da divida ativa nao disponivel nesta coleta']
      : []),
  ],
}

const dir = path.join(pasta, 'dossie')
fs.mkdirSync(dir, { recursive: true })

fs.writeFileSync(path.join(dir, 'dados.json'), JSON.stringify(dados, null, 2))

const cabecalho = [
  `# Dossie fiscal federal`,
  ``,
  `Contribuinte: ${dados.razao ?? 'nao identificado'}`,
  `CNPJ: ${dados.cnpj ?? 'nao identificado'}`,
  `Pasta de coleta: ${path.basename(pasta)}`,
  ``,
  `## Fontes desta coleta`,
  ``,
  ...(dados.fontes.length
    ? dados.fontes.map((f) => `- ${f.fonte}, ${f.detalhe}, extraido as ${f.hora} (${f.arquivo})`)
    : ['- proveniencia nao registrada nesta coleta']),
  ``,
  `## Campos ja extraidos por regra`,
  ``,
  '```json',
  JSON.stringify(
    {
      cadastro: dados.cadastro,
      certidao: dados.certidao,
      siefExigivel: dados.sief.resumo,
      siefSuspenso: dados.sief.suspenso.length,
      inscricoesSida: { pendentes: dados.sida.pendentes.length, suspensas: dados.sida.suspensas.length },
      contasSispar: { pendentes: dados.sispar.pendentes.length, suspensas: dados.sispar.suspensos.length },
      siefpar: { emAtraso: dados.siefpar.pendentes.length, suspensos: dados.siefpar.suspensos.length },
      dividaAtiva: dados.dividaAtiva,
      prazos: dados.prazos.length,
    },
    null,
    2
  ),
  '```',
  ``,
  ...(dados.lacunas.length
    ? ['## Lacunas desta coleta, a declarar como apuracao pendente', '', ...dados.lacunas.map((l) => `- ${l}`), '']
    : []),
].join('\n')

const corpo = fontes
  .map((f) => `\n\n---\n\n## Fonte: ${f.arquivo} (${f.paginas} pagina(s))\n\n${f.texto.trim()}`)
  .join('')

fs.writeFileSync(path.join(dir, 'dossie.md'), cabecalho + corpo)

const brl = (n) => (n == null ? 'nao apurado' : `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)

console.log('\n=== Dossie ===')
console.log(`  fontes validas:      ${fontes.length}${invalidas.length ? `, ${invalidas.length} descartada(s)` : ''}`)
console.log(`  debitos SIEF:        ${dados.sief.exigivel.length} exigivel(is), ${brl(dados.sief.resumo.consolidado)}`)
console.log(`  inscricoes divida:   ${dados.sida.pendentes.length} pendente(s), ${dados.sida.suspensas.length} suspensa(s)`)
console.log(`  contas SISPAR:       ${dados.sispar.pendentes.length} pendente(s), ${dados.sispar.suspensos.length} suspensa(s)`)
console.log(`  parcelamentos:       ${dados.siefpar.pendentes.length} em atraso`)
console.log(`  prazos em aberto:    ${dados.prazos.length}`)
console.log(`  certidao:            ${dados.certidao.situacao ?? 'nao identificada'}${dados.certidao.diasSemCertidao ? `, ha ${dados.certidao.diasSemCertidao} dias` : ''}`)
if (dados.lacunas.length) {
  console.log(`\n  lacunas declaradas:`)
  for (const l of dados.lacunas) console.log(`    ${l}`)
}
console.log(`\n  ${path.join(dir, 'dossie.md')}`)
console.log(`  ${path.join(dir, 'dados.json')}`)

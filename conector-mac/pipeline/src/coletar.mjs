/**
 * Orquestrador da coleta. SOMENTE LEITURA.
 *
 * Requer o `npm run sessao` rodando e autenticado noutra aba do terminal.
 * Uso: npm run coletar
 *      npm run coletar -- --so situacao-fiscal
 */
import fs from 'node:fs'
import path from 'node:path'
import { conectar, sessaoViva, log } from './lib/browser.mjs'
import { pastaSaida, Proveniencia } from './lib/coleta.mjs'
import { extrairSituacaoFiscal } from './extratores/situacao-fiscal.mjs'
import { extrairProcessos } from './extratores/processos.mjs'
import { extrairPgfn, janelaRegularize } from './extratores/pgfn.mjs'
import { extrairSispar } from './extratores/sispar.mjs'

const args = process.argv.slice(2)
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)
const so = arg('--so')
// Prefixo do certificado no vault: FS (Parque) ou GABB. Tambem aceita
// --cnpj/--razao direto, pra rodar em qualquer CNPJ que o perfil alcance.
const cliente = (arg('--cliente') ?? 'FS').toUpperCase()

/**
 * Marca arquivos vazios ou truncados.
 *
 * O piso e baixo de proposito. Tamanho nao distingue documento bom de tela de
 * erro: o PDF de erro da CAPAG tinha 75 KB e a exportacao nativa e legitima dos
 * processos tem 15 KB. Quem julga conteudo e o conferirPagina(), em tela, antes
 * de gravar. Aqui so pegamos arquivo que nao chegou a se formar.
 */
const PISO_KB = { '.pdf': 3, '.csv': 0.2 }

function auditar(resultados) {
  const suspeitos = []
  for (const r of resultados) {
    for (const arquivo of r.arquivos ?? []) {
      if (!fs.existsSync(arquivo)) {
        suspeitos.push({ arquivo: path.basename(arquivo), motivo: 'arquivo nao encontrado' })
        continue
      }
      const kb = fs.statSync(arquivo).size / 1024
      const piso = PISO_KB[path.extname(arquivo).toLowerCase()] ?? 1
      if (kb < piso) {
        suspeitos.push({
          arquivo: path.basename(arquivo),
          motivo: `apenas ${kb < 1 ? `${Math.round(kb * 1024)} bytes` : `${Math.round(kb)} KB`}`,
        })
      }
    }
  }
  return { suspeitos }
}

const { ctx, env } = await conectar()
const page = ctx.pages()[0] ?? (await ctx.newPage())

if (!(await sessaoViva(page))) {
  log('Sessao caiu. Refaca o login na janela do `npm run sessao`.')
  process.exit(2)
}

const cnpj = arg('--cnpj') ?? env[`${cliente}_CERT_CNPJ`]
const razao = arg('--razao') ?? env[`${cliente}_CERT_RAZAO`]
if (!cnpj || !razao) {
  log(`Cliente "${cliente}" nao encontrado no vault. Use --cliente FS|GABB ou --cnpj/--razao.`)
  process.exit(1)
}
const dir = pastaSaida(path.join(process.cwd(), 'out'), cnpj)
const prov = new Proveniencia(cnpj, razao)

log(`Coletando ${razao} (${cnpj})`)
log(`Saida: ${dir}`)

const etapas = [
  { nome: 'situacao-fiscal', fn: extrairSituacaoFiscal },
  { nome: 'processos', fn: extrairProcessos },
  { nome: 'pgfn', fn: extrairPgfn },
  { nome: 'sispar', fn: extrairSispar },
]

const janela = janelaRegularize()
if (!janela.dentro) log(`Aviso: ${janela.motivo}. As etapas pgfn e sispar vao falhar.`)

const resultados = []
for (const etapa of etapas) {
  if (so && so !== etapa.nome) continue
  try {
    const saida = await etapa.fn(ctx, { dir, razao, cnpj, prov })
    const arquivos = Array.isArray(saida) ? saida : (saida?.arquivos ?? [])
    resultados.push({ etapa: etapa.nome, ok: true, arquivos })
  } catch (e) {
    log(`FALHA em ${etapa.nome}: ${e.message}`)
    resultados.push({ etapa: etapa.nome, ok: false, erro: e.message })
  }
}

prov.salvar(dir)

// Auditoria dos arquivos gerados. Um PDF de 1 pagina com tela de erro tem
// tamanho de PDF valido, entao o que se checa aqui e existencia e volume
// minimo; o conteudo ja foi conferido em tela por conferirPagina().
const auditoria = auditar(resultados)

console.log('\n=== Resultado ===')
for (const r of resultados) {
  const marca = r.ok ? 'ok  ' : 'FALHA'
  const detalhe = r.ok ? `${r.arquivos.length} arquivo(s)` : r.erro
  console.log(`  ${marca} ${r.etapa.padEnd(16)} ${detalhe}`)
}
if (auditoria.suspeitos.length) {
  console.log('\n=== Arquivos suspeitos ===')
  for (const s of auditoria.suspeitos) console.log(`  ${s.arquivo}: ${s.motivo}`)
}
console.log(`\nSaida: ${dir}`)

const falhas = resultados.filter((r) => !r.ok)
if (falhas.length || auditoria.suspeitos.length) {
  log(`Coleta incompleta: ${falhas.length} etapa(s) com falha, ${auditoria.suspeitos.length} arquivo(s) suspeito(s).`)
  process.exit(3)
}
process.exit(0)

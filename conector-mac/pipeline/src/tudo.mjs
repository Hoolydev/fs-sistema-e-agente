/**
 * Fluxo completo num comando: coleta, analise e diagnostico.
 *
 * Uso: npm run tudo -- --cliente GABB
 *      npm run tudo -- --cnpj 11222333000181 --razao "EMPRESA LTDA"
 *
 * Pre-requisito: `npm run sessao` rodando e autenticado noutra aba.
 * O login continua sendo humano porque o e-CAC exige captcha antes do gov.br,
 * e resolver captcha nao e coisa que esta automacao faz.
 *
 * Cada etapa so comeca se a anterior deixou material utilizavel, e o processo
 * termina com codigo de saida diferente de zero quando algo ficou pela metade.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { log } from './lib/browser.mjs'

const args = process.argv.slice(2)
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)
const cliente = (arg('--cliente') ?? 'GABB').toUpperCase()
const cnpjArg = arg('--cnpj')

function rodar(script, extras = []) {
  return new Promise((resolve) => {
    const p = spawn('node', [path.join('src', script), ...extras], { stdio: 'inherit' })
    p.on('close', (codigo) => resolve(codigo ?? 1))
  })
}

function pastaMaisRecente(cnpj) {
  const base = path.join(process.cwd(), 'out', String(cnpj).replace(/\D/g, ''))
  if (!fs.existsSync(base)) return null
  const dias = fs.readdirSync(base).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  return dias.length ? path.join(base, dias[dias.length - 1]) : null
}

console.log('\n--- 1 de 3: coleta ---\n')
const argsColeta = cnpjArg ? ['--cnpj', cnpjArg, '--razao', arg('--razao') ?? ''] : ['--cliente', cliente]
const codigoColeta = await rodar('coletar.mjs', argsColeta)
if (codigoColeta !== 0) {
  log('A coleta terminou incompleta. Seguindo com o que foi extraido.')
}

const env = JSON.parse(
  JSON.stringify({ cnpj: cnpjArg ?? null })
)
const cnpj =
  env.cnpj ??
  (await import('./lib/browser.mjs')).loadEnv()[`${cliente}_CERT_CNPJ`]
const pasta = pastaMaisRecente(cnpj)
if (!pasta) {
  log('Nenhuma pasta de coleta encontrada. Nada a analisar.')
  process.exit(1)
}

console.log('\n--- 2 de 3: analise ---\n')
const codigoAnalise = await rodar('analisar.mjs', ['--pasta', pasta])
if (codigoAnalise !== 0) {
  log('A analise falhou. O diagnostico nao roda sem dossie.')
  process.exit(codigoAnalise)
}

console.log('\n--- 3 de 3: diagnostico ---\n')
const codigoDiagnostico = await rodar('diagnosticar.mjs', ['--pasta', pasta])

console.log('\n--- resumo ---')
console.log(`  coleta:      ${codigoColeta === 0 ? 'completa' : 'incompleta'}`)
console.log(`  analise:     ok`)
console.log(`  diagnostico: ${codigoDiagnostico === 0 ? 'ok' : codigoDiagnostico === 4 ? 'gerado, com valores a conferir' : 'falhou'}`)
console.log(`  pasta:       ${pasta}\n`)

process.exit(codigoColeta === 0 && codigoDiagnostico === 0 ? 0 : 5)

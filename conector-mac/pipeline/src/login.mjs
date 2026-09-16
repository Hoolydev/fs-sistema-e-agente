/**
 * Abre o e-CAC e devolve o controle pro operador fazer o login com certificado.
 * Fica aguardando ate detectar sessao autenticada, e entao encerra deixando o
 * cookie gravado no perfil persistente.
 *
 * Uso: npm run login
 */
import { abrirNavegador, sessaoViva, ECAC_HOME, log } from './lib/browser.mjs'

const { ctx } = await abrirNavegador()
const page = ctx.pages()[0] ?? (await ctx.newPage())

if (await sessaoViva(page)) {
  log('Sessao ja esta viva. Nada a fazer.')
  await ctx.close()
  process.exit(0)
}

log('Abrindo o e-CAC. Faca o login com o certificado digital nesta janela.')
await page.goto(ECAC_HOME, { waitUntil: 'domcontentloaded' })

const LIMITE_MS = 10 * 60 * 1000
const inicio = Date.now()
let avisou = false

while (Date.now() - inicio < LIMITE_MS) {
  await page.waitForTimeout(3000)
  const url = page.url()
  if (/cav\.receita\.fazenda\.gov\.br\/ecac/.test(url)) {
    log('Autenticado. Sessao gravada no perfil.')
    log('Pode rodar: npm run coletar -- <CNPJ>')
    await page.waitForTimeout(1000)
    await ctx.close()
    process.exit(0)
  }
  if (!avisou && Date.now() - inicio > 60_000) {
    log('Ainda aguardando o login...')
    avisou = true
  }
}

log('Tempo esgotado sem autenticacao.')
await ctx.close()
process.exit(1)

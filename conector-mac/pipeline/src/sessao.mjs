/**
 * Mantem a sessao do e-CAC viva.
 *
 * Uso: npm run sessao                 (login automatico com o certificado GABB)
 *      npm run sessao -- --cliente FS (outro certificado do vault)
 *      npm run sessao -- --manual     (abre a tela e espera voce autenticar)
 *
 * O login por certificado sempre foi a etapa humana do processo, porque o
 * navegador abre o dialogo nativo de escolha de certificado, fora do alcance do
 * DOM. O Playwright faz esse handshake mTLS por conta propria, entao o dialogo
 * nao aparece e o login roda sozinho. O modo manual continua disponivel.
 *
 * Deixe o processo rodando: o e-CAC usa cookie de sessao e os coletores
 * conectam nesta janela por CDP. Ctrl+C derruba a sessao.
 */
import { abrirNavegador, sessaoViva, ECAC_HOME, CDP_URL, log } from './lib/browser.mjs'

const args = process.argv.slice(2)
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)
const manual = args.includes('--manual')
const cliente = (arg('--cliente') ?? 'GABB').toUpperCase()

const { ctx } = await abrirNavegador({ cliente: manual ? undefined : cliente })
const page = ctx.pages()[0] ?? (await ctx.newPage())

log(`Porta CDP: ${CDP_URL}`)

/**
 * Percorre a tela do gov.br ate o ponto em que o certificado e exigido.
 * O botao muda de rotulo entre versoes do SSO, entao tentamos varios.
 */
async function loginPorCertificado(page) {
  log(`Login automatico com o certificado ${cliente}`)
  await page.goto(ECAC_HOME, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  if (/cav\.receita\.fazenda\.gov\.br\/ecac/.test(page.url())) return true

  const rotulos = [
    'Seu certificado digital',
    'Certificado digital',
    'certificado digital',
    'Certificado Digital',
  ]
  for (const rotulo of rotulos) {
    const alvo = page.locator(`a:has-text("${rotulo}"), button:has-text("${rotulo}")`).first()
    if (!(await alvo.count())) continue
    log(`Clicando em "${rotulo}"`)
    await alvo.click({ timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(8000)
    break
  }

  // O handshake mTLS e o redirecionamento de volta levam alguns segundos.
  for (let i = 0; i < 20; i++) {
    if (/cav\.receita\.fazenda\.gov\.br\/ecac/.test(page.url())) return true
    await page.waitForTimeout(3000)
  }
  return /cav\.receita\.fazenda\.gov\.br\/ecac/.test(page.url())
}

async function loginManual(page) {
  log('Abrindo o login do e-CAC. Autentique com o certificado digital.')
  await page.goto(ECAC_HOME, { waitUntil: 'domcontentloaded' })
  const LIMITE_MS = 15 * 60 * 1000
  const inicio = Date.now()
  while (Date.now() - inicio < LIMITE_MS) {
    await page.waitForTimeout(3000)
    if (/cav\.receita\.fazenda\.gov\.br\/ecac/.test(page.url())) return true
  }
  return false
}

if (!(await sessaoViva(page))) {
  let ok = manual ? await loginManual(page) : await loginPorCertificado(page)

  // Se o automatico nao passar, nao desistimos da coleta: cai pro manual.
  if (!ok && !manual) {
    log('Login automatico nao concluiu. Assuma a janela e autentique.')
    ok = await loginManual(page)
  }
  if (!ok) {
    log(`Sem autenticacao. URL atual: ${page.url()}`)
    await ctx.close()
    process.exit(1)
  }
}

log('Sessao autenticada e disponivel para os coletores.')
log('DEIXE ESTE PROCESSO RODANDO. Ctrl+C derruba a sessao.')

// Mantem o processo vivo e faz keepalive leve pra sessao nao expirar por ociosidade
let ciclos = 0
setInterval(async () => {
  ciclos++
  try {
    const viva = await sessaoViva(page)
    if (!viva) {
      log('Sessao expirou na Receita. Refazendo o login.')
      const refeito = manual ? await loginManual(page) : await loginPorCertificado(page)
      log(refeito ? 'Sessao restabelecida.' : 'Nao consegui restabelecer a sessao.')
    } else if (ciclos % 6 === 0) {
      log('Sessao ok.')
    }
  } catch (e) {
    log('Falha no keepalive:', e.message)
  }
}, 5 * 60 * 1000)

process.on('SIGINT', async () => {
  log('Encerrando sessao.')
  await ctx.close()
  process.exit(0)
})

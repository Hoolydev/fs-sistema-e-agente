/**
 * Reconhecimento do Regularize (PGFN). SOMENTE LEITURA.
 *
 * O Regularize tem SSO proprio: mesmo autenticado no e-CAC, ele cai na home
 * deslogada e exige "Entrar como gov.br" na aba Pessoa Juridica. O SSO
 * reaproveita a sessao do certificado, sem pedir senha de novo.
 *
 * Nao clica em nada de adesao, negociacao ou emissao de guia.
 */
import fs from 'node:fs'
import path from 'node:path'
import { conectar, log } from './lib/browser.mjs'

const OUT = path.join(process.cwd(), 'docs', 'mapa')
fs.mkdirSync(OUT, { recursive: true })

const { ctx } = await conectar()
const page = await ctx.newPage()

async function retrato(nome) {
  await page.screenshot({ path: path.join(OUT, `${nome}.png`), fullPage: true })
  fs.writeFileSync(path.join(OUT, `${nome}.txt`), await page.locator('body').innerText().catch(() => ''))
}

try {
  await page.goto('https://www.regularize.pgfn.gov.br/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  // Fecha modal de aviso, se houver
  const close = page.locator('button:has-text("Close"), button.close, .modal button:has-text("×")').first()
  if (await close.count()) await close.click().catch(() => {})
  await page.waitForTimeout(1000)

  log('Selecionando aba Pessoa Juridica')
  const tabPJ = page.locator('#tabPJ-link')
  if (await tabPJ.count()) {
    await tabPJ.click()
    await page.waitForTimeout(1500)
  }

  log('Entrando com gov.br')
  // Ha um botao por aba (PF e PJ). O da aba oculta existe no DOM mas nao e
  // clicavel, entao filtramos pelo visivel.
  const entrar = page.locator('button.acessoGovBr:visible, button:has-text("Entrar como gov.br"):visible').first()
  log('botoes visiveis:', await entrar.count())
  await entrar.click({ timeout: 15_000 })
  await page.waitForTimeout(10_000)
  log('URL apos SSO:', page.url())
  log('paginas abertas:', ctx.pages().length)
  await retrato('regularize-pos-login')

  // Menu interno autenticado
  const links = await page.$$eval('a, button', (els) =>
    els
      .map((e) => ({
        tag: e.tagName.toLowerCase(),
        texto: (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
        id: e.id || '',
        href: e.getAttribute?.('href') || '',
      }))
      .filter((e) => e.texto)
  )
  fs.writeFileSync(path.join(OUT, 'regularize-links.json'), JSON.stringify(links, null, 2))

  const relevantes = links.filter((l) =>
    /consulta|d.vida|negoci|capacidade|pagamento|extrato|relat.rio|sispar|inscri/i.test(l.texto)
  )
  console.log('\n=== Links do Regularize autenticado ===')
  for (const l of relevantes) console.log(`[${l.tag}] "${l.texto}" id=${l.id} href=${l.href}`)

  console.log('\n=== Texto ===')
  console.log((await page.locator('body').innerText().catch(() => '')).slice(0, 2500))
} catch (e) {
  console.error('FALHA:', e.message)
  await retrato('regularize-falha').catch(() => {})
  console.error('URL no momento da falha:', page.url())
} finally {
  await page.close().catch(() => {})
  process.exit(0)
}

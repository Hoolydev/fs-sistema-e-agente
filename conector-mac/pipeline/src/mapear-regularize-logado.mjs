/**
 * Mapeia o Regularize AUTENTICADO, partindo do handshake do e-CAC.
 * SOMENTE LEITURA. Nao clica em adesao, negociacao ou emissao de guia.
 */
import fs from 'node:fs'
import path from 'node:path'
import { conectar, ECAC_PORTAL, log } from './lib/browser.mjs'

const OUT = path.join(process.cwd(), 'docs', 'mapa')
fs.mkdirSync(OUT, { recursive: true })

const { ctx } = await conectar()
const page = await ctx.newPage()

try {
  await page.goto(ECAC_PORTAL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.locator('a:has-text("Dívida Ativa da União")').first().click()
  await page.waitForTimeout(2000)

  const antes = ctx.pages().length
  await page.locator('a:has-text("Todos os serviços do Regularize")').first().click()
  await page.waitForTimeout(9000)

  const paginas = ctx.pages()
  const alvo = paginas.length > antes ? paginas[paginas.length - 1] : page
  await alvo.waitForLoadState('domcontentloaded').catch(() => {})
  await alvo.waitForTimeout(5000)

  log('URL apos handshake:', alvo.url())
  await alvo.screenshot({ path: path.join(OUT, 'regularize-logado.png'), fullPage: true })
  const texto = await alvo.locator('body').innerText().catch(() => '')
  fs.writeFileSync(path.join(OUT, 'regularize-logado.txt'), texto)

  const links = await alvo.$$eval('a, button', (els) =>
    els
      .map((e) => ({
        tag: e.tagName.toLowerCase(),
        texto: (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        id: e.id || '',
        href: e.getAttribute?.('href') || '',
      }))
      .filter((e) => e.texto)
  )
  fs.writeFileSync(path.join(OUT, 'regularize-logado-links.json'), JSON.stringify(links, null, 2))

  console.log('\n=== MENU DO REGULARIZE AUTENTICADO ===')
  for (const l of links) {
    if (/^(BRASIL|Simplifique|Comunica|Participe|Acesso à info|Legisla|Canais|VLibras|Ouvidoria|Política|Termos)/i.test(l.texto)) continue
    console.log(`[${l.tag}] "${l.texto}" ${l.href ? 'href=' + l.href : ''}`)
  }
  console.log('\n=== TEXTO ===')
  console.log(texto.slice(0, 3000))
} catch (e) {
  console.error('FALHA:', e.message)
} finally {
  process.exit(0)
}

/**
 * Mapeia o que aparece DEPOIS de um clique, dentro do Regularize autenticado.
 * SOMENTE LEITURA.
 *
 * Uso: node src/mapear-passos.mjs <nome> <url> "<texto do botao>"
 */
import fs from 'node:fs'
import path from 'node:path'
import { conectar, log } from './lib/browser.mjs'

const [nome, url, botao] = process.argv.slice(2)
const OUT = path.join(process.cwd(), 'docs', 'mapa')
fs.mkdirSync(OUT, { recursive: true })

const { ctx } = await conectar()
const page = await ctx.newPage()

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)

  if (botao) {
    const antes = ctx.pages().length
    log(`clicando em "${botao}"`)
    await page.locator(`button:has-text("${botao}"), a:has-text("${botao}")`).first().click({ timeout: 20_000 })
    await page.waitForTimeout(9000)
    const paginas = ctx.pages()
    if (paginas.length > antes) {
      log('abriu aba nova')
      const nova = paginas[paginas.length - 1]
      await nova.waitForLoadState('domcontentloaded').catch(() => {})
      await nova.waitForTimeout(4000)
      log('URL da aba nova:', nova.url())
      await nova.screenshot({ path: path.join(OUT, `${nome}.png`), fullPage: true })
      const t = await nova.locator('body').innerText().catch(() => '')
      fs.writeFileSync(path.join(OUT, `${nome}.txt`), t)
      console.log(t.slice(0, 2500))
      process.exit(0)
    }
  }

  log('URL:', page.url())
  await page.screenshot({ path: path.join(OUT, `${nome}.png`), fullPage: true })
  const texto = await page.locator('body').innerText().catch(() => '')
  fs.writeFileSync(path.join(OUT, `${nome}.txt`), texto)

  const clicaveis = await page.$$eval('button, a, input[type=checkbox], select', (els) =>
    els
      .map((e) => ({
        tag: e.tagName.toLowerCase(),
        tipo: e.getAttribute?.('type') || '',
        texto: (e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 70),
        id: e.id || '',
        checked: e.checked ?? null,
      }))
      .filter((e) => e.texto || e.id)
  )
  console.log('\n--- controles ---')
  for (const c of clicaveis) {
    if (/BRASIL|Simplifique|Comunica|Participe|Acesso à|Legisla|Canais|VLibras/i.test(c.texto)) continue
    console.log(JSON.stringify(c))
  }
  console.log('\n--- texto ---')
  console.log(texto.slice(0, 2000))
} catch (e) {
  console.error('FALHA:', e.message)
} finally {
  process.exit(0)
}

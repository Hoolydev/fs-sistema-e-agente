/**
 * Reconhecimento de uma rota especifica. SOMENTE LEITURA.
 * Abre a URL numa aba nova, espera renderizar e grava HTML, screenshot e a
 * lista de elementos clicaveis, pra eu escrever o extrator em cima do DOM real.
 *
 * Uso: node src/mapear-rota.mjs <nome> <url>
 */
import fs from 'node:fs'
import path from 'node:path'
import { conectar, log } from './lib/browser.mjs'

const [nome, url] = process.argv.slice(2)
if (!nome || !url) {
  console.error('Uso: node src/mapear-rota.mjs <nome> <url>')
  process.exit(1)
}

const OUT = path.join(process.cwd(), 'docs', 'mapa')
fs.mkdirSync(OUT, { recursive: true })

const { ctx } = await conectar()
const page = await ctx.newPage()

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(6000)

  fs.writeFileSync(path.join(OUT, `${nome}.html`), await page.content())
  await page.screenshot({ path: path.join(OUT, `${nome}.png`), fullPage: true })

  const clicaveis = await page.$$eval(
    'a, button, input[type=button], input[type=submit], [role=button], [onclick]',
    (els) =>
      els
        .map((e) => ({
          tag: e.tagName.toLowerCase(),
          texto: (e.innerText || e.value || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
          id: e.id || '',
          classe: (e.className || '').toString().slice(0, 90),
          href: e.getAttribute?.('href') || '',
        }))
        .filter((e) => e.texto || e.id)
  )
  fs.writeFileSync(path.join(OUT, `${nome}-clicaveis.json`), JSON.stringify(clicaveis, null, 2))

  const texto = await page.locator('body').innerText().catch(() => '')
  fs.writeFileSync(path.join(OUT, `${nome}.txt`), texto)

  const frames = page.frames().map((f) => ({ nome: f.name(), url: f.url() }))

  console.log(`\n=== ${nome} ===`)
  console.log('URL final:', page.url())
  console.log('Frames:', JSON.stringify(frames, null, 2))
  console.log('\n--- Clicaveis ---')
  for (const c of clicaveis.slice(0, 60)) {
    console.log(`[${c.tag}] "${c.texto}" id=${c.id} href=${c.href}`)
  }
  console.log('\n--- Texto (2000 chars) ---')
  console.log(texto.slice(0, 2000))
} finally {
  await page.close()
  process.exit(0)
}

/**
 * Testa acesso direto as rotas finais da PGFN a partir da sessao do e-CAC.
 * SOMENTE LEITURA.
 *
 * A home do Regularize exibe "Sistema indisponivel" fora do horario comercial,
 * mas isso pode ser so o banner da home. Aqui verificamos se as rotas internas
 * respondem mesmo assim, em vez de assumir bloqueio.
 */
import fs from 'node:fs'
import path from 'node:path'
import { conectar, log } from './lib/browser.mjs'

const OUT = path.join(process.cwd(), 'docs', 'mapa')
fs.mkdirSync(OUT, { recursive: true })

const ROTAS = [
  ['relatorio-divida', 'https://www.regularize.pgfn.gov.br/consultaDividas/relatorio'],
  ['capag', 'https://sisparnet.pgfn.fazenda.gov.br/sisparInternet/consultarCapag.jsf'],
  ['sispar-raiz', 'https://sisparnet.pgfn.fazenda.gov.br/sisparInternet/'],
]

const { ctx } = await conectar()

for (const [nome, url] of ROTAS) {
  const page = await ctx.newPage()
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(6000)
    const texto = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
    await page.screenshot({ path: path.join(OUT, `teste-${nome}.png`), fullPage: true })
    fs.writeFileSync(path.join(OUT, `teste-${nome}.txt`), texto)
    console.log(`\n=== ${nome} ===`)
    console.log('status:', resp?.status())
    console.log('url final:', page.url())
    console.log('texto:', texto.slice(0, 700))
  } catch (e) {
    console.log(`\n=== ${nome} ===`)
    console.log('ERRO:', e.message)
  } finally {
    await page.close().catch(() => {})
  }
}
process.exit(0)

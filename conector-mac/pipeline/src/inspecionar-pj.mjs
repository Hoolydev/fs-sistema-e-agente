/**
 * Inspeciona o painel Pessoa Juridica do Regularize. SOMENTE LEITURA.
 * Diferente da aba PF, a PJ nao oferece "Entrar como gov.br": exige senha
 * propria do Regularize ou acesso por certificado digital. Aqui descobrimos
 * qual e o elemento do certificado.
 */
import { conectar, log } from './lib/browser.mjs'

const { ctx } = await conectar()
const page = await ctx.newPage()

try {
  await page.goto('https://www.regularize.pgfn.gov.br/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  await page.locator('#tabPJ-link').click().catch(() => {})
  await page.waitForTimeout(2000)

  const painel = await page.evaluate(() => {
    const alvo = document.querySelector('#tabPJ') || document.body
    const out = []
    for (const el of alvo.querySelectorAll('a, button, img, input, div[onclick], [role=button]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      out.push({
        tag: el.tagName.toLowerCase(),
        texto: (el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 70),
        id: el.id || '',
        classe: (el.className || '').toString().slice(0, 100),
        href: el.getAttribute('href') || '',
        src: (el.getAttribute('src') || '').slice(-60),
        alt: el.getAttribute('alt') || '',
        title: el.getAttribute('title') || '',
      })
    }
    return out
  })

  console.log('=== Elementos visiveis no painel PJ ===')
  for (const e of painel) console.log(JSON.stringify(e))
} catch (e) {
  console.error('FALHA:', e.message)
} finally {
  await page.close().catch(() => {})
  process.exit(0)
}

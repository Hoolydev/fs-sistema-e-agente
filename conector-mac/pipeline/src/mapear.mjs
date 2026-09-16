/**
 * Mapeamento de reconhecimento do e-CAC. SOMENTE LEITURA.
 *
 * Percorre o portal autenticado e grava a arvore de menus/links, para que os
 * extratores sejam escritos em cima dos seletores reais em vez de caminhos
 * adivinhados. Nao clica em nada que protocole, envie, adira ou altere estado:
 * estamos operando com o certificado de um cliente real do Fernando.
 */
import fs from 'node:fs'
import path from 'node:path'
import { conectar, sessaoViva, ECAC_PORTAL, log } from './lib/browser.mjs'

const OUT = path.join(process.cwd(), 'docs', 'mapa')
fs.mkdirSync(OUT, { recursive: true })

const { browser, ctx } = await conectar()
const page = ctx.pages()[0] ?? (await ctx.newPage())

if (!(await sessaoViva(page))) {
  log('Sessao caiu. Refaca o login na janela do `npm run sessao`.')
  process.exit(2)
}

// networkidle nao fecha nesse portal (long polling), sempre domcontentloaded
await page.goto(ECAC_PORTAL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)

// Arvore de links do portal, com href e texto
const links = await page.$$eval('a', (as) =>
  as
    .map((a) => ({
      texto: (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim(),
      href: a.getAttribute('href') || '',
      id: a.id || '',
      onclick: (a.getAttribute('onclick') || '').slice(0, 160),
    }))
    .filter((l) => l.texto && l.texto.length < 120)
)

fs.writeFileSync(path.join(OUT, 'portal-links.json'), JSON.stringify(links, null, 2))
fs.writeFileSync(path.join(OUT, 'portal.html'), await page.content())
await page.screenshot({ path: path.join(OUT, 'portal.png'), fullPage: true })

log(`${links.length} links capturados`)

// Quem esta autenticado e em qual perfil
const cabecalho = await page
  .locator('body')
  .innerText()
  .then((t) => t.split('\n').filter((l) => l.trim()).slice(0, 40).join('\n'))
  .catch(() => '')
fs.writeFileSync(path.join(OUT, 'portal-topo.txt'), cabecalho)

const interessantes = links.filter((l) =>
  /situa..o fiscal|pend|d.vida ativa|regulariz|processo|intima|comunicad|perfil|certid/i.test(l.texto)
)
console.log('\n=== Links relevantes ===')
for (const l of interessantes) console.log(`- ${l.texto}\n  href=${l.href}${l.onclick ? `\n  onclick=${l.onclick}` : ''}`)

console.log('\n=== Topo da pagina ===')
console.log(cabecalho)

process.exit(0)

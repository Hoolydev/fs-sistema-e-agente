/**
 * Rota PGFN a partir do e-CAC. SOMENTE LEITURA.
 *
 * Navegar direto pra URL do Regularize cai na home deslogada, e a aba PJ nao
 * oferece "Entrar como gov.br" (so CNPJ + senha propria ou cadastro). O caminho
 * do Fernando e outro: ele parte do e-CAC ja autenticado e clica no servico,
 * que e onde acontece o handshake de sessao. Este script reproduz isso.
 */
import fs from 'node:fs'
import path from 'node:path'
import { conectar, ECAC_PORTAL, log } from './lib/browser.mjs'

const OUT = path.join(process.cwd(), 'docs', 'mapa')
fs.mkdirSync(OUT, { recursive: true })

const { ctx } = await conectar()
const page = await ctx.newPage()

async function retrato(nome) {
  await page.screenshot({ path: path.join(OUT, `${nome}.png`), fullPage: true })
  fs.writeFileSync(path.join(OUT, `${nome}.txt`), await page.locator('body').innerText().catch(() => ''))
}

try {
  await page.goto(ECAC_PORTAL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  log('Abrindo grupo "Divida Ativa da Uniao"')
  await page.locator('a:has-text("Dívida Ativa da União")').first().click()
  await page.waitForTimeout(2500)

  const alvo = page.locator('a:has-text("Todos os serviços do Regularize")').first()
  log('link do Regularize encontrado:', await alvo.count())

  const antes = ctx.pages().length
  await alvo.click()
  await page.waitForTimeout(9000)

  // O servico pode abrir em aba nova
  const paginas = ctx.pages()
  log(`paginas: ${antes} -> ${paginas.length}`)
  const atual = paginas.length > antes ? paginas[paginas.length - 1] : page
  await atual.waitForLoadState('domcontentloaded').catch(() => {})
  await atual.waitForTimeout(4000)

  log('URL final:', atual.url())
  await atual.screenshot({ path: path.join(OUT, 'pgfn-via-ecac.png'), fullPage: true })
  const texto = await atual.locator('body').innerText().catch(() => '')
  fs.writeFileSync(path.join(OUT, 'pgfn-via-ecac.txt'), texto)

  const clicaveis = await atual.$$eval('a, button, input[type=button], input[type=submit]', (els) =>
    els
      .map((e) => ({
        tag: e.tagName.toLowerCase(),
        texto: (e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        id: e.id || '',
        href: e.getAttribute?.('href') || '',
      }))
      .filter((e) => e.texto)
  )
  fs.writeFileSync(path.join(OUT, 'pgfn-via-ecac-clicaveis.json'), JSON.stringify(clicaveis, null, 2))

  console.log('\n=== Clicaveis ===')
  for (const c of clicaveis.slice(0, 50)) console.log(`[${c.tag}] "${c.texto}" id=${c.id} href=${c.href}`)
  console.log('\n=== Texto ===')
  console.log(texto.slice(0, 2500))
} catch (e) {
  console.error('FALHA:', e.message)
  await retrato('pgfn-falha').catch(() => {})
  console.error('URL:', page.url())
} finally {
  process.exit(0)
}

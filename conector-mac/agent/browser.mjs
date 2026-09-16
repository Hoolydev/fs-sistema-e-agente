/**
 * Camada de navegador do conector, adaptada ao que funciona NESTE Mac.
 *
 * Diferença central para o protótipo anterior: em vez de deixar o Playwright
 * abrir o Chrome (launchPersistentContext, que deixa navigator.webdriver=true e
 * foi bloqueado pelo e-CAC como "acesso automatizado"), abrimos o Chrome real
 * como processo comum, com o perfil persistente do conector e a porta CDP, e só
 * então conectamos via connectOverCDP. Assim webdriver=false e o certificado é
 * resolvido pelo Chaveiro de login (a identidade da FS está autorizada para o
 * Chrome). O registro local relata autenticação em 14/09/2026; homologar novamente no novo Mac.
 *
 * SOMENTE LEITURA no portal: navega, troca de perfil e confere. Coleta e
 * parecer ficam nos scripts do pipeline da FS, que este módulo apenas orquestra.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import { chromium } from '../pipeline/node_modules/playwright/index.mjs'

export const ECAC_LOGIN = 'https://cav.receita.fazenda.gov.br/autenticacao/login'
export const ECAC_PORTAL = 'https://cav.receita.fazenda.gov.br/ecac/'
export const SERVICOS_SF = 'https://servicos.receitafederal.gov.br/servico/pendencias/'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export const log = (...a) => console.log(`[${new Date().toLocaleTimeString('pt-BR')}]`, ...a)

const portaAberta = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => {
      s.destroy()
      resolve(true)
    })
    s.on('error', () => resolve(false))
    s.setTimeout(1500, () => {
      s.destroy()
      resolve(false)
    })
  })

/**
 * Garante um Chrome real de pé com CDP na porta indicada, usando o perfil do
 * conector. Se já houver um, reaproveita. Devolve o contexto Playwright.
 */
export async function abrirNavegador({ profileDir, cdpPort }) {
  fs.mkdirSync(profileDir, { recursive: true })
  if (!(await portaAberta(cdpPort))) {
    log(`Abrindo Chrome real (perfil do conector, CDP ${cdpPort})`)
    const child = spawn(
      CHROME,
      [
        `--user-data-dir=${profileDir}`,
        '--profile-directory=Default',
        `--remote-debugging-port=${cdpPort}`,
        '--remote-debugging-address=127.0.0.1',
        '--no-first-run',
        '--no-default-browser-check',
        '--lang=pt-BR',
        '--window-size=1400,1000',
        'about:blank',
      ],
      { detached: true, stdio: 'ignore' },
    )
    child.unref()
    for (let i = 0; i < 40 && !(await portaAberta(cdpPort)); i++) {
      await new Promise((r) => setTimeout(r, 500))
    }
    if (!(await portaAberta(cdpPort))) throw new Error('Chrome não abriu a porta CDP')
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 15_000 })
  const ctx = browser.contexts()[0]
  if (!ctx) throw new Error('CDP conectado mas sem contexto')
  ctx.setDefaultTimeout(60_000)
  return { browser, ctx }
}

/** Página “de trabalho” do e-CAC (evita abas chrome://). */
export function paginaTrabalho(ctx) {
  return ctx.pages().find((p) => /receita|gov\.br|pgfn|estaleiro\.serpro/.test(p.url())) ?? ctx.pages()[0]
}

/** Sessão viva = portal responde sem redirecionar para o login. */
export async function sessaoViva(page) {
  await page.goto(ECAC_PORTAL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  if (/sso\.acesso\.gov\.br|autenticacao\/login/.test(page.url())) return false
  const corpo = await page.locator('body').innerText().catch(() => '')
  return /Alterar perfil de acesso|Sair com Seguran/i.test(corpo)
}

/**
 * Login por certificado. Passa pela tela do gov.br; o Chaveiro resolve a
 * seleção do certificado. Se aparecer captcha/bloqueio, NÃO insiste: devolve
 * um resultado que o chamador transforma em estado "aguardando_login".
 */
export async function tentarLogin(page, { timeoutMs = 120_000 } = {}) {
  await page.goto(ECAC_LOGIN, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  if (/\/ecac(?:\/|$)/.test(page.url())) return { ok: true }

  const corpoInicial = await page.locator('body').innerText().catch(() => '')
  if (/acesso foi bloqueado|acesso.*automatizado/i.test(corpoInicial)) {
    return { ok: false, motivo: 'bloqueio_automatizado' }
  }

  const gov = page
    .locator('input[type="image"][alt*="Gov" i], button:has-text("Entrar com"), a:has-text("Entrar com"), #login-dados-certificado')
    .first()
  if (await gov.count()) {
    await gov.click().catch(() => {})
    await page.waitForTimeout(4000)
  }
  const cert = page
    .locator('a:has-text("Seu certificado digital"), button:has-text("Seu certificado digital"), a:has-text("Certificado digital")')
    .first()
  if (await cert.count()) {
    await cert.click().catch(() => {})
  }
  const limite = Date.now() + timeoutMs
  while (Date.now() < limite) {
    await page.waitForTimeout(3000)
    const u = page.url()
    const t = await page.locator('body').innerText().catch(() => '')
    if (/acesso foi bloqueado|acesso.*automatizado/i.test(t)) return { ok: false, motivo: 'bloqueio_automatizado' }
    if (/\/ecac(?:\/|$)/.test(u) && /Alterar perfil de acesso|Sair com Seguran/i.test(t)) return { ok: true }
    if (/hcaptcha|verifique que voc|sou humano/i.test(t)) return { ok: false, motivo: 'captcha' }
  }
  return { ok: false, motivo: 'nao_concluiu' }
}

/**
 * Troca para "Procurador de pessoa jurídica - CNPJ" e confirma. Identifica o
 * campo pela ordem no DOM logo após o rótulo, e valida CNPJ + papel na tela.
 * Nunca usa procurador de pessoa física, matriz/filial, sucessora ou ente.
 */
export async function trocarPerfilProcuradorPJ(page, cnpj) {
  if (!/^\d{14}$/.test(cnpj)) throw new Error('CNPJ inválido para troca de perfil')
  await page.goto(ECAC_PORTAL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  if (!(await page.locator('input[name="NIPapel"]:visible').count())) {
    await page.locator('text=/Alterar perfil de acesso/i').first().click()
    await page.waitForTimeout(2500)
  }
  const info = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
    let achou = false
    let input = null
    let botao = null
    while (walker.nextNode()) {
      const el = walker.currentNode
      if (!achou) {
        if (el.children.length === 0 && /Procurador de pessoa jur[ií]dica\s*-\s*CNPJ/i.test(el.textContent || '')) achou = true
        continue
      }
      if (!input && el.tagName === 'INPUT' && el.name === 'NIPapel') { input = el; continue }
      if (input && el.tagName === 'INPUT' && el.type === 'button' && /^Alterar$/i.test(el.value)) { botao = el; break }
    }
    if (!input || !botao) return null
    input.setAttribute('data-fs-alvo', '1')
    botao.setAttribute('data-fs-botao', '1')
    return true
  })
  if (!info) throw new Error('Opção "Procurador de pessoa jurídica - CNPJ" não disponível para este certificado')
  const inp = page.locator('input[data-fs-alvo="1"]')
  await inp.click()
  await inp.fill('')
  await inp.type(cnpj, { delay: 30 })
  await page.locator('input[data-fs-botao="1"]').click()
  await page.waitForTimeout(4000)
  const t = await page.locator('body').innerText()
  const ok = t.replace(/\D/g, '').includes(cnpj) && /procurador de:/i.test(t)
  if (!ok) throw new Error('Perfil não confirmado após a troca (CNPJ/papel não conferem)')
  return true
}

/**
 * "Aquece" o servico servicos.receitafederal.gov.br e confirma que o perfil
 * ativo lá é o procurador do CNPJ pedido. É o passo que faltava: os portais
 * downstream refazem SSO próprio e voltam ao TITULAR por padrão; sem esta
 * confirmação, a Situação Fiscal sai da FS, não da empresa pedida.
 */
export async function aquecerServicosRFB(ctx, cnpj, { timeoutMs = 90_000 } = {}) {
  const p = await ctx.newPage()
  try {
    await p.goto(SERVICOS_SF, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(4000)
    if (/\/login\//.test(p.url())) {
      const b = p.locator('button:has-text("GovBR"), a:has-text("GovBR"), button:has-text("gov.br"), a:has-text("gov.br")').first()
      if (await b.count()) {
        await b.click().catch(() => {})
        await p.waitForURL((u) => !/\/login\//.test(u.toString()), { timeout: 60_000 }).catch(() => {})
        await p.waitForTimeout(5000)
      }
    }
    const limite = Date.now() + timeoutMs
    while (Date.now() < limite) {
      const t = await p.locator('body').innerText().catch(() => '')
      if (t.replace(/\D/g, '').includes(cnpj) && /procurador/i.test(t)) return true
      if (/\/login\//.test(p.url()) && /hcaptcha|sou humano/i.test(t)) throw new Error('captcha no servicos.receitafederal')
      await p.waitForTimeout(3000)
    }
    throw new Error('servicos.receitafederal não confirmou o perfil do CNPJ pedido')
  } finally {
    await p.close().catch(() => {})
  }
}

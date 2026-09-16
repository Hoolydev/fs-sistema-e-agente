import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const ECAC_HOME = 'https://cav.receita.fazenda.gov.br/autenticacao/login'
export const ECAC_PORTAL = 'https://cav.receita.fazenda.gov.br/ecac/'

/**
 * Carrega o .env do vault (~/.credentials/fs/pipeline.env).
 * Nunca lemos credencial de dentro do repo.
 */
export function loadEnv() {
  const p = process.env.FS_CONNECTOR_VAULT || path.join(os.homedir(), '.credentials/fs/pipeline.env')
  const env = {}
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

export const CDP_PORT = 9222
export const CDP_URL = process.env.FS_ECAC_CDP_URL || `http://127.0.0.1:${CDP_PORT}`

/**
 * Origens que pedem o certificado A1 no handshake TLS.
 *
 * O login por certificado no gov.br nao acontece no DOM: o navegador abre o
 * dialogo nativo de escolha de certificado, que nenhuma automacao de pagina
 * alcanca. Por isso o login era manual. O Playwright resolve isso fazendo o
 * handshake mTLS por conta propria (opcao clientCertificates, desde a 1.46),
 * e ai o dialogo nunca aparece.
 */
export const ORIGENS_CERTIFICADO = [
  'https://certificado.sso.acesso.gov.br',
  'https://certificado.sso.staging.acesso.gov.br',
]

/**
 * Monta a lista de certificados de cliente a partir do vault.
 * Prefixo do cliente: FS (Parque de Diversoes) ou GABB.
 */
export function certificadosDoCliente(env, cliente = 'GABB') {
  const p = cliente.toUpperCase()
  const pfxPath = env[`${p}_CERT_PFX`]
  const passphrase = env[`${p}_CERT_PASS`]
  if (!pfxPath || !fs.existsSync(pfxPath)) return []
  return ORIGENS_CERTIFICADO.map((origin) => ({ origin, pfxPath, passphrase }))
}

/**
 * Abre o Chrome com perfil persistente e porta CDP exposta.
 *
 * A sessao do e-CAC e cookie de sessao: morre quando o browser fecha, mesmo com
 * userDataDir persistente (verificado em 01/08/2026). Por isso quem chama esta
 * funcao e o processo `sessao.mjs`, que segura a janela aberta; os coletores
 * nunca abrem browser proprio, eles conectam via `conectar()`.
 *
 * headless=false sempre: o operador precisa assumir o controle no certificado.
 */
export async function abrirNavegador({ headless = false, downloadDir, cliente } = {}) {
  const env = loadEnv()
  const profile = env.FS_ECAC_PROFILE
  fs.mkdirSync(profile, { recursive: true })
  if (downloadDir) fs.mkdirSync(downloadDir, { recursive: true })

  const clientCertificates = cliente ? certificadosDoCliente(env, cliente) : []

  const ctx = await chromium.launchPersistentContext(profile, {
    headless,
    channel: 'chrome',
    viewport: null,
    acceptDownloads: true,
    downloadsPath: downloadDir,
    ...(clientCertificates.length ? { clientCertificates } : {}),
    args: [
      '--start-maximized',
      `--remote-debugging-port=${CDP_PORT}`,
    ],
  })

  ctx.setDefaultTimeout(60_000)
  return { ctx, env }
}

/**
 * Conecta na janela ja autenticada mantida pelo `sessao.mjs`.
 * Devolve o contexto existente, com os cookies do login vivos.
 */
export async function conectar() {
  const env = loadEnv()
  let browser
  try {
    browser = await chromium.connectOverCDP(CDP_URL, { timeout: 10_000 })
  } catch {
    throw new Error(
      'Nenhuma sessao aberta. Rode `npm run sessao` numa aba do terminal, faca o login com o certificado e deixe rodando.'
    )
  }
  const ctx = browser.contexts()[0]
  if (!ctx) throw new Error('Browser conectado mas sem contexto ativo.')
  ctx.setDefaultTimeout(60_000)
  return { browser, ctx, env }
}

/**
 * Verifica se a sessao do e-CAC ainda esta viva.
 * O portal redireciona pra tela de login quando a sessao morre.
 */
export async function sessaoViva(page) {
  await page.goto(ECAC_PORTAL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const url = page.url()
  if (/sso\.acesso\.gov\.br|autenticacao\/login/.test(url)) return false
  const corpo = await page.content()
  return /Servi.os em Destaque|Alterar Perfil de Acesso|Sair com seguran/i.test(corpo)
}

export function timestamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

export function log(...a) {
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}]`, ...a)
}

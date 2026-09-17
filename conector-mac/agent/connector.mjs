/**
 * Conector local FS — versão endurecida (14/09/2026).
 *
 * Roda sob o usuário macOS que já usa o Claude, com acesso à sessão gráfica.
 * Recebe pedidos por CONEXÃO DE SAÍDA (pull) a partir de uma ponte na VPS; nada
 * do Mac (CDP, certificado, terminal) é exposto na internet. A navegação
 * autenticada acontece aqui, no Chrome real deste Mac; o parecer volta para a
 * ponte, que entrega pelo WhatsApp via Z-API.
 *
 * Controles implementados: empresas autorizadas, validação de CNPJ, uma
 * consulta por vez, fila na ponte quando o Mac está ocupado/indisponível,
 * idempotência por requestId, estados observáveis, retomada após login, e
 * associação explícita entre pedido, fontes e arquivo entregue. Mensagens do
 * WhatsApp NUNCA viram comando de shell: o pipeline é chamado com argumentos
 * separados. Nunca reaproveita a pasta de coleta mais recente de forma
 * automática — cada pedido tem a sua.
 */
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { abrirNavegador, paginaTrabalho, sessaoViva, tentarLogin, trocarPerfilProcuradorPJ, aquecerServicosRFB, log } from './browser.mjs'

const HOME = process.env.FS_CONNECTOR_HOME || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NODE = process.execPath
const PIPELINE = path.join(HOME, 'pipeline')
const VAULT = path.join(HOME, 'secrets/pipeline.env')
const CDP_PORT = Number(process.env.FS_ECAC_CDP_PORT || 19222)
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`
const API_PORT = Number(process.env.FS_CONNECTOR_API_PORT || 18765)
const PROFILE_DIR = path.join(HOME, 'browser')

const readEnvFile = (p) => {
  const o = {}
  if (!fs.existsSync(p)) return o
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) o[m[1]] = m[2]
  }
  return o
}

const vault = readEnvFile(VAULT)
const bridge = readEnvFile(path.join(HOME, 'secrets/bridge.env')) // BRIDGE_URL, BRIDGE_TOKEN
const empresasPath = path.join(HOME, 'secrets/empresas.json')

/** Allowlist de empresas autorizadas. O titular do certificado entra sempre. */
function empresasAutorizadas() {
  const set = new Map()
  const titular = (vault.FS_CERT_CNPJ || '').replace(/\D/g, '')
  if (titular) set.set(titular, vault.FS_CERT_RAZAO || 'Titular do certificado')
  if (fs.existsSync(empresasPath)) {
    try {
      for (const e of JSON.parse(fs.readFileSync(empresasPath, 'utf8'))) {
        const c = String(e.cnpj || '').replace(/\D/g, '')
        if (c) set.set(c, e.razao || '')
      }
    } catch (e) {
      log('empresas.json inválido:', e.message)
    }
  }
  return set
}

function cnpjValido(cnpj) {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false
  const d = cnpj.split('').map(Number)
  const calc = (len) => {
    let f = len - 7
    let t = 0
    for (let i = 0; i < len; i++) {
      t += (d[i] ?? 0) * f--
      if (f < 2) f = 9
    }
    const r = t % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === d[12] && calc(13) === d[13]
}

const nowIso = () => new Date().toISOString()
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const jobsDir = path.join(HOME, 'jobs')
fs.mkdirSync(jobsDir, { recursive: true, mode: 0o700 })
fs.mkdirSync(path.join(HOME, 'logs'), { recursive: true, mode: 0o700 })

const jobs = new Map()
let active // requestId em execução (uma consulta por vez)
let session = 'fechada'
let sessionNote = ''
let ctx // contexto Playwright conectado
const processedPath = path.join(jobsDir, 'processed.json')
const processed = new Set(fs.existsSync(processedPath) ? JSON.parse(fs.readFileSync(processedPath, 'utf8')) : [])
const markProcessed = (id) => {
  processed.add(id)
  fs.writeFileSync(processedPath, JSON.stringify([...processed]), { mode: 0o600 })
}

async function saveJob(job) {
  job.updatedAt = nowIso()
  const p = path.join(jobsDir, job.id + '.json')
  await fsp.writeFile(p + '.tmp', JSON.stringify(job, null, 2), { mode: 0o600 })
  await fsp.rename(p + '.tmp', p)
  jobs.set(job.id, job)
}

// Retoma jobs interrompidos: nada é repetido automaticamente na coleta.
for (const f of fs.readdirSync(jobsDir)) {
  if (!/^[a-f0-9-]+\.json$/.test(f)) continue
  try {
    const j = JSON.parse(fs.readFileSync(path.join(jobsDir, f), 'utf8'))
    if (['iniciando', 'coletando', 'validando', 'gerando_parecer'].includes(j.status)) {
      j.status = 'aguardando_revisao'
      j.note = 'Execução interrompida; não repetida automaticamente.'
    }
    jobs.set(j.id, j)
  } catch {}
}

// ---------------------------------------------------------------------------
// Navegador / sessão
// ---------------------------------------------------------------------------
async function garantirNavegador() {
  if (ctx) {
    try {
      const p = paginaTrabalho(ctx)
      if (p) return ctx
    } catch {}
  }
  const r = await abrirNavegador({ profileDir: PROFILE_DIR, cdpPort: CDP_PORT })
  ctx = r.ctx
  ctx.browser = r.browser
  session = 'aberta'
  return ctx
}

async function garantirLogin() {
  await garantirNavegador()
  const page = paginaTrabalho(ctx) ?? (await ctx.newPage())
  if (await sessaoViva(page)) {
    session = 'autenticada'
    sessionNote = ''
    return true
  }
  session = 'autenticando'
  const r = await tentarLogin(page)
  if (r.ok) {
    session = 'autenticada'
    sessionNote = ''
    return true
  }
  session = 'aguardando_login'
  sessionNote =
    r.motivo === 'captcha'
      ? 'O gov.br pediu confirmação humana (captcha). Resolva na janela do Chrome deste Mac e retome.'
      : r.motivo === 'bloqueio_automatizado'
        ? 'O e-CAC bloqueou o acesso como automatizado. Aguarde e refaça o login humano na janela do Chrome.'
        : 'Login do e-CAC não concluído. Autentique na janela do Chrome deste Mac.'
  return false
}

// ---------------------------------------------------------------------------
// Pipeline (coleta / análise / parecer) — argumentos separados, sem shell
// ---------------------------------------------------------------------------
function prepararPastaJob(job) {
  const dir = path.join(jobsDir, job.id)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  for (const [name, target] of [
    ['src', path.join(PIPELINE, 'src')],
    ['skills', path.join(PIPELINE, 'skills')],
    ['node_modules', path.join(PIPELINE, 'node_modules')],
  ]) {
    const link = path.join(dir, name)
    if (!fs.existsSync(link)) fs.symlinkSync(target, link, 'dir')
  }
  if (!fs.existsSync(path.join(dir, 'package.json'))) fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n')
  return dir
}

function rodar(dir, script, args, job) {
  return new Promise((resolve) => {
    const logfile = path.join(dir, script.replace('.mjs', '') + '.log')
    const p = spawn(NODE, [path.join(dir, 'src', script), ...args], {
      cwd: dir,
      env: {
        ...process.env,
        FS_CONNECTOR_VAULT: VAULT,
        FS_ECAC_CDP_URL: CDP_URL,
        ESPERA_HUMANA_MS: process.env.ESPERA_HUMANA_MS ?? '90000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let out = ''
    const cap = (b) => {
      if (out.length < 2_000_000) out += b.toString()
    }
    p.stdout.on('data', cap)
    p.stderr.on('data', cap)
    const timer = setTimeout(() => p.kill('SIGTERM'), 20 * 60 * 1000)
    p.on('close', (code) => {
      clearTimeout(timer)
      fs.writeFileSync(logfile, out, { mode: 0o600 })
      resolve(code ?? 1)
    })
    p.on('error', () => {
      clearTimeout(timer)
      resolve(1)
    })
  })
}

/** Pasta de coleta datada DESTE job (nunca a "mais recente" global). */
function pastaColetaDoJob(dir, cnpj) {
  const base = path.join(dir, 'out', cnpj)
  if (!fs.existsSync(base)) return null
  const dias = fs.readdirSync(base).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  return dias.length ? path.join(base, dias[dias.length - 1]) : null
}

// ---------------------------------------------------------------------------
// Execução de um pedido
// ---------------------------------------------------------------------------
async function executar(job) {
  active = job.id
  const dir = prepararPastaJob(job)
  try {
    // 1. autorização e validação
    const empresas = empresasAutorizadas()
    if (!cnpjValido(job.cnpj)) {
      job.status = 'falhou'
      job.note = 'CNPJ inválido.'
      return
    }
    if (!empresas.has(job.cnpj)) {
      job.status = 'aguardando_permissao'
      job.note = 'Empresa não autorizada para este conector. Cadastre em secrets/empresas.json.'
      return
    }
    job.razao = job.razao || empresas.get(job.cnpj) || `Empresa ${job.cnpj}`

    // 2. login
    job.status = 'iniciando'
    await saveJob(job)
    if (!(await garantirLogin())) {
      job.status = 'aguardando_login'
      job.note = sessionNote
      return
    }

    // 3. perfil procurador + aquecimento dos portais downstream
    const page = paginaTrabalho(ctx)
    await trocarPerfilProcuradorPJ(page, job.cnpj)
    await aquecerServicosRFB(ctx, job.cnpj)

    // 4. correção que reaproveita fontes: pula a coleta
    let sourceDir
    const reaproveita = job.correctionOf && job.mode === 'texto'
    if (reaproveita) {
      const priorDir = path.join(jobsDir, job.correctionOf)
      sourceDir = pastaColetaDoJob(priorDir, job.cnpj)
      if (!sourceDir) {
        job.status = 'falhou'
        job.note = 'Correção de texto pediu reaproveitar fontes, mas a coleta anterior não foi encontrada.'
        return
      }
      // vincula as fontes do pedido anterior a este job
      fs.symlinkSync(sourceDir, path.join(dir, 'fontes-reaproveitadas'), 'dir')
    } else {
      job.status = 'coletando'
      await saveJob(job)
      const codC = await rodar(dir, 'coletar.mjs', ['--cnpj', job.cnpj, '--razao', job.razao], job)
      if (codC !== 0) {
        job.status = 'coleta_incompleta'
        job.note = 'Uma etapa da coleta falhou. Nenhum parecer completo foi liberado. Ver log da coleta.'
        return
      }
      sourceDir = pastaColetaDoJob(dir, job.cnpj)
      if (!sourceDir) {
        job.status = 'falhou'
        job.note = 'Coleta sem pasta datada.'
        return
      }
    }

    // 5. análise + guarda de CNPJ
    job.status = 'validando'
    await saveJob(job)
    if ((await rodar(dir, 'analisar.mjs', ['--pasta', sourceDir], job)) !== 0) {
      job.status = 'falhou'
      job.note = 'Extração do dossiê falhou.'
      return
    }
    const dados = JSON.parse(fs.readFileSync(path.join(sourceDir, 'dossie/dados.json'), 'utf8'))
    if ((dados.cnpj || '').replace(/\D/g, '') !== job.cnpj) {
      job.status = 'falhou'
      job.note = `CNPJ do dossiê (${dados.cnpj || '—'}) diverge do pedido. Coleta descartada.`
      return
    }
    job.razao = dados.razao || job.razao
    job.sources = fs.readdirSync(sourceDir).filter((f) => /\.(pdf|csv)$/i.test(f))

    // 6. parecer
    job.status = 'gerando_parecer'
    await saveJob(job)
    const diagArgs = ['--pasta', sourceDir]
    if (job.correctionOf && job.observacao) {
      // A observação da correção precisa chegar ao prompt do diagnóstico, que é
      // montado a partir de dossie.md. Anexamos um bloco marcado por requestId
      // (idempotente: não duplica se este mesmo pedido reprocessar). Nunca é
      // interpretada como shell — é texto anexado a um arquivo.
      const dossiePath = path.join(sourceDir, 'dossie/dossie.md')
      const marca = `<!-- correcao:${job.id} -->`
      const atual = fs.existsSync(dossiePath) ? fs.readFileSync(dossiePath, 'utf8') : ''
      if (!atual.includes(marca)) {
        fs.appendFileSync(
          dossiePath,
          `\n\n## Observação da correção (pedido ${job.id}) ${marca}\n\nO solicitante pediu esta revisão. Incorpore-a mantendo o lastro nas fontes:\n\n${job.observacao}\n`,
        )
      }
    }
    // Emissão pelo GERADOR OFICIAL do sistema (parecer:gerar / DiagnosticReport).
    const codD = await rodar(dir, 'parecer-fs.mjs', diagArgs, job)

    // localiza o PDF DESTE job (associação explícita)
    const pdfs = fs.readdirSync(sourceDir).filter((f) => /^Parecer_FS_.*\.pdf$/i.test(f))
    if (!pdfs.length) {
      job.status = 'aguardando_revisao'
      job.note = 'Parecer não foi gerado. Ver log da etapa; nada foi entregue.'
      return
    }
    const parecer = path.join(sourceDir, pdfs[pdfs.length - 1])
    job.parecer = parecer
    job.parecerSha256 = sha256(fs.readFileSync(parecer))
    job.coletaEm = dados.coletaEm || nowIso()
    if (codD === 0) {
      job.status = 'pronto'
      job.note = ''
    } else {
      job.status = 'aguardando_revisao'
      job.note = 'Parecer gerado mas a etapa retornou erro. Revise antes de usar.'
    }
  } catch (e) {
    job.status = 'falhou'
    job.note = (e instanceof Error ? e.message : String(e)).slice(0, 300)
  } finally {
    await saveJob(job)
    active = undefined
  }
}

// ---------------------------------------------------------------------------
// Ponte na VPS (pull de saída) + entrega
// ---------------------------------------------------------------------------
async function bridgeFetch(pathname, { method = 'GET', body } = {}) {
  if (!bridge.BRIDGE_URL || !bridge.BRIDGE_TOKEN) throw new Error('bridge.env ausente')
  const res = await fetch(bridge.BRIDGE_URL.replace(/\/$/, '') + pathname, {
    method,
    headers: {
      authorization: `Bearer ${bridge.BRIDGE_TOKEN}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) throw new Error(`bridge ${pathname} -> ${res.status} ${text.slice(0, 200)}`)
  return data
}

async function relatarStatus(job) {
  if (!bridge.BRIDGE_URL) return
  try {
    await bridgeFetch(`/mac/jobs/${job.id}/status`, { method: 'POST', body: { status: job.status, note: job.note || '' } })
  } catch (e) {
    log('status -> bridge falhou:', e.message)
  }
}

async function entregarParecer(job) {
  const buf = fs.readFileSync(job.parecer)
  await bridgeFetch(`/mac/jobs/${job.id}/result`, {
    method: 'POST',
    body: {
      cnpj: job.cnpj,
      razao: job.razao,
      requesterPhone: job.requesterPhone,
      filename: path.basename(job.parecer),
      sha256: job.parecerSha256,
      sources: job.sources || [],
      coletaEm: job.coletaEm,
      note: job.note || '',
      pdfBase64: buf.toString('base64'),
    },
  })
  job.status = 'enviado'
  await saveJob(job)
}

let pulling = false
async function cicloPull() {
  if (pulling || active || !bridge.BRIDGE_URL) return
  pulling = true
  try {
    const claim = await bridgeFetch('/mac/claim', { method: 'POST', body: { host: 'mac' } }).catch(() => null)
    if (!claim || !claim.requestId) return
    if (processed.has(claim.requestId)) {
      // idempotência: já tratado; confirma para a ponte não reentregar
      await bridgeFetch(`/mac/jobs/${claim.requestId}/status`, { method: 'POST', body: { status: 'enviado', note: 'duplicado ignorado' } }).catch(() => {})
      return
    }
    const now = nowIso()
    const job = {
      id: claim.requestId,
      cnpj: String(claim.cnpj || '').replace(/\D/g, ''),
      razao: claim.razao || '',
      requesterPhone: String(claim.requesterPhone || '').replace(/\D/g, ''),
      operation: claim.operation || 'analisar',
      correctionOf: claim.correctionOf || null,
      mode: claim.mode || null,
      observacao: claim.observacao || null,
      status: 'aguardando_mac',
      createdAt: now,
      updatedAt: now,
      origin: 'bridge',
      directory: path.join(jobsDir, claim.requestId),
    }
    jobs.set(job.id, job)
    await saveJob(job)
    await relatarStatus(job)
    await executar(job)
    await relatarStatus(job)
    if (job.status === 'pronto') {
      try {
        await entregarParecer(job)
        markProcessed(job.id)
        await relatarStatus(job)
        log(`Pedido ${job.id} entregue à ponte.`)
      } catch (e) {
        job.status = 'falhou'
        job.note = 'Entrega à ponte falhou: ' + e.message
        await saveJob(job)
        await relatarStatus(job)
      }
    } else {
      log(`Pedido ${job.id} terminou em "${job.status}": ${job.note || ''}`)
    }
  } finally {
    pulling = false
  }
}

// ---------------------------------------------------------------------------
// API local (127.0.0.1) para o CLI fs-conector — token obrigatório
// ---------------------------------------------------------------------------
const tokenPath = path.join(HOME, 'secrets/local-token')
if (!fs.existsSync(tokenPath)) fs.writeFileSync(tokenPath, randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''), { mode: 0o600 })
const localToken = fs.readFileSync(tokenPath, 'utf8').trim()
const tokenOk = (h) => {
  const a = Buffer.from(h || '')
  const b = Buffer.from(`Bearer ${localToken}`)
  return a.length === b.length && b.length > 0 && timingSafeEqual(a, b)
}
const readBody = (req) =>
  new Promise((resolve) => {
    let d = ''
    req.on('data', (c) => {
      d += c
      if (d.length > 1_000_000) req.destroy()
    })
    req.on('end', () => resolve(d ? JSON.parse(d) : {}))
  })

const server = http.createServer(async (req, reply) => {
  const send = (code, obj) => {
    reply.writeHead(code, { 'content-type': 'application/json' })
    reply.end(JSON.stringify(obj))
  }
  try {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/health') return send(200, { status: 'ok', name: 'FS Conector Mac', version: '0.2.0', bridge: !!bridge.BRIDGE_URL, whatsapp: bridge.BRIDGE_URL ? 'via_ponte' : 'nao_conectado' })
    if (!tokenOk(req.headers.authorization)) return send(401, { error: 'unauthorized' })

    if (url.pathname === '/status') {
      return send(200, { session, note: sessionNote, active: active ?? null, bridge: !!bridge.BRIDGE_URL, jobs: [...jobs.values()] })
    }
    if (url.pathname === '/session/open' && req.method === 'POST') {
      if (active) return send(409, { error: 'busy' })
      await garantirNavegador()
      return send(200, { session })
    }
    if (url.pathname === '/session/login' && req.method === 'POST') {
      if (active) return send(409, { error: 'busy' })
      const ok = await garantirLogin()
      return send(ok ? 200 : 202, { session, note: sessionNote })
    }
    if (url.pathname === '/jobs' && req.method === 'POST') {
      if (active) return send(409, { error: 'busy' })
      const body = await readBody(req)
      const cnpj = String(body.cnpj || '').replace(/\D/g, '')
      if (!cnpjValido(cnpj)) return send(400, { error: 'invalid_cnpj' })
      const id = randomUUID()
      const job = { id, cnpj, razao: body.razao || '', operation: body.operation === 'coletar' ? 'coletar' : 'analisar', requesterPhone: null, status: 'recebido', origin: 'local', createdAt: nowIso(), updatedAt: nowIso(), directory: path.join(jobsDir, id) }
      await saveJob(job)
      void executar(job)
      return send(202, { id })
    }
    const mJob = url.pathname.match(/^\/jobs\/([a-f0-9-]+)$/)
    if (mJob) return jobs.has(mJob[1]) ? send(200, jobs.get(mJob[1])) : send(404, { error: 'not_found' })
    const mResume = url.pathname.match(/^\/jobs\/([a-f0-9-]+)\/resume$/)
    if (mResume && req.method === 'POST') {
      const job = jobs.get(mResume[1])
      if (!job) return send(404, { error: 'not_found' })
      if (active || job.status !== 'aguardando_login') return send(409, { error: 'cannot_resume' })
      void executar(job)
      return send(202, { id: job.id })
    }
    return send(404, { error: 'not_found' })
  } catch (e) {
    send(500, { error: (e instanceof Error ? e.message : 'erro').slice(0, 200) })
  }
})

server.listen(API_PORT, '127.0.0.1', () => {
  log(JSON.stringify({ status: 'ready', api: `http://127.0.0.1:${API_PORT}`, home: HOME, bridge: !!bridge.BRIDGE_URL }))
})

// Loop de pull: só quando a ponte está configurada e o Mac está ocioso.
if (bridge.BRIDGE_URL) {
  setInterval(() => void cicloPull(), Number(process.env.FS_PULL_INTERVAL_MS || 15_000))
}

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})

/**
 * Ponte FS Mac <-> WhatsApp, na VPS. Isolada da stack fs-automacao-ecac.
 *
 * Dois lados:
 *  - PÚBLICO (via Traefik, TLS): POST /zapi/:token  — webhook de recebimento da
 *    Z-API. Interpreta "análise do CNPJ X", valida remetente autorizado + CNPJ,
 *    e injeta o pedido na fila. Roda direto (sem confirmação SIM/NÃO).
 *  - PRIVADO (loopback + bearer, alcançado pelo Mac por túnel SSH): /jobs,
 *    /mac/claim, /mac/jobs/:id/status|result. Nunca exposto pelo Traefik.
 *
 * Sem dependências externas. Segredos vêm do ambiente (bridge.env).
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { timingSafeEqual, randomUUID } from 'node:crypto'

const PORT = Number(process.env.BRIDGE_PORT || 18790)
const HOST = process.env.BRIDGE_HOST || '127.0.0.1'
const TOKEN = process.env.MAC_BRIDGE_TOKEN || ''          // bearer privado (Mac)
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || ''      // token no path do webhook público
const STATE_DIR = process.env.BRIDGE_STATE_DIR || '/app/state'
const Z = {
  base: (process.env.ZAPI_BASE_URL || 'https://api.z-api.io').replace(/\/$/, ''),
  instance: process.env.ZAPI_INSTANCE_ID || '',
  token: process.env.ZAPI_INSTANCE_TOKEN || '',
  client: process.env.ZAPI_CLIENT_TOKEN || '',
  dryRun: /^true$/i.test(process.env.WHATSAPP_DRY_RUN || 'false'),
}
const AUTHORIZED = new Set((process.env.AUTHORIZED_PHONE_NUMBERS || '').split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean))

fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })
const dbPath = path.join(STATE_DIR, 'jobs.json')
const db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : { jobs: {}, seen: {} }
if (!db.seen) db.seen = {}
const save = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), { mode: 0o600 })
const log = (...a) => console.log(new Date().toISOString(), ...a)

const bearerOk = (h) => { const a = Buffer.from(h || ''); const b = Buffer.from(`Bearer ${TOKEN}`); return TOKEN.length > 0 && a.length === b.length && timingSafeEqual(a, b) }
const pathTokenOk = (t) => { const a = Buffer.from(t || ''); const b = Buffer.from(WEBHOOK_TOKEN); return WEBHOOK_TOKEN.length > 0 && a.length === b.length && timingSafeEqual(a, b) }
const readBody = (req) => new Promise((resolve, reject) => { let d = ''; req.on('data', (c) => { d += c; if (d.length > 30_000_000) req.destroy() }); req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}) } catch (e) { reject(e) } }) })

function isValidCnpj(cnpj) {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false
  const d = cnpj.split('').map(Number)
  const calc = (len) => { let f = len - 7, t = 0; for (let i = 0; i < len; i++) { t += (d[i] ?? 0) * f--; if (f < 2) f = 9 } const r = t % 11; return r < 2 ? 0 : 11 - r }
  return calc(12) === d[12] && calc(13) === d[13]
}
function extractCnpj(text) {
  const m = String(text || '').match(/(?:\d[.\/\s-]?){13}\d/g) || []
  for (const cand of m) { const dig = cand.replace(/\D/g, ''); if (dig.length === 14 && isValidCnpj(dig)) return dig }
  return null
}

async function zapi(pathname, body) {
  if (Z.dryRun) { log('Z-API dry-run', pathname, JSON.stringify(body).slice(0, 100)); return { messageId: 'dry-' + Date.now() } }
  if (!Z.instance || !Z.token || !Z.client) throw new Error('Z-API não configurada')
  const res = await fetch(`${Z.base}/instances/${encodeURIComponent(Z.instance)}/token/${encodeURIComponent(Z.token)}/${pathname}`, {
    method: 'POST', headers: { 'Client-Token': Z.client, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new Error(`Z-API ${pathname}: ${data.error || res.statusText}`)
  return data
}
const sendText = (phone, message) => zapi('send-text', { phone, message })

function createJob({ cnpj, razao = '', requesterPhone, operation = 'analisar', correctionOf = null, mode = null, observacao = null, requestId }) {
  const id = requestId || randomUUID()
  if (db.jobs[id]) return db.jobs[id]
  db.jobs[id] = { id, cnpj, razao, requesterPhone, operation, correctionOf, mode, observacao, state: 'pending', note: '', createdAt: new Date().toISOString(), deliveredAt: null }
  save()
  return db.jobs[id]
}

async function entregar(job, pdfBase64, filename, note) {
  if (!AUTHORIZED.has(job.requesterPhone)) throw new Error(`destino ${job.requesterPhone} não autorizado`)
  await zapi('send-document/pdf', { phone: job.requesterPhone, document: `data:application/pdf;base64,${pdfBase64}`, fileName: filename, caption: `Diagnóstico Fiscal Federal — ${job.razao || job.cnpj}. Protocolo ${job.id}.` })
  const obs = note ? `\nObservação: ${note}` : ''
  await zapi('send-text', { phone: job.requesterPhone, message: `Pronto. Segue o parecer de ${job.razao || job.cnpj} (CNPJ ${job.cnpj}), coletado em ${job.coletaEm || 'hoje'}.${obs}` })
}

const server = http.createServer(async (req, reply) => {
  const send = (code, obj) => { reply.writeHead(code, { 'content-type': 'application/json' }); reply.end(obj === undefined ? '' : JSON.stringify(obj)) }
  try {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/health') return send(200, { status: 'ok', name: 'FS Mac Bridge', dryRun: Z.dryRun, jobs: Object.keys(db.jobs).length })

    // ---------- PÚBLICO: webhook de recebimento da Z-API ----------
    const mHook = url.pathname.match(/^\/zapi\/([^/]+)$/)
    if (mHook && req.method === 'POST') {
      if (!pathTokenOk(mHook[1])) return send(401, { error: 'invalid_webhook_token' })
      const p = await readBody(req).catch(() => ({}))
      // responde rápido; processa depois
      send(200, { received: true })
      if (p.type !== 'ReceivedCallback' || p.fromMe || p.isGroup || p.isNewsletter || p.isStatusReply || p.broadcast) return
      if (p.instanceId && Z.instance && p.instanceId !== Z.instance) return
      const phone = String(p.phone || '').replace(/\D/g, '')
      const text = p.text?.message || ''
      const mid = p.messageId || ''
      if (mid && db.seen[mid]) return
      if (mid) { db.seen[mid] = Date.now(); save() }
      if (!AUTHORIZED.has(phone)) { log('inbound não autorizado', phone); return }
      const cnpj = extractCnpj(text)
      if (!cnpj) { await sendText(phone, 'Para gerar a análise, envie o CNPJ (14 dígitos). Ex.: faça uma análise da empresa 51.646.813/0001-94.').catch(() => {}); return }
      const job = createJob({ cnpj, requesterPhone: phone, operation: 'analisar' })
      log('inbound job', job.id, cnpj, 'de', phone)
      await sendText(phone, `Recebido. Vou entrar no e-CAC e gerar a análise do CNPJ ${cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}. Aviso aqui quando o parecer estiver pronto.`).catch(() => {})
      return
    }

    // ---------- PRIVADO (bearer) ----------
    if (!bearerOk(req.headers.authorization)) return send(401, { error: 'unauthorized' })

    if (url.pathname === '/jobs' && req.method === 'POST') {
      const b = await readBody(req)
      const cnpj = String(b.cnpj || '').replace(/\D/g, '')
      const phone = String(b.requesterPhone || '').replace(/\D/g, '')
      if (!/^\d{14}$/.test(cnpj)) return send(400, { error: 'invalid_cnpj' })
      if (!AUTHORIZED.has(phone)) return send(403, { error: 'phone_not_authorized' })
      const job = createJob({ ...b, cnpj, requesterPhone: phone })
      return send(201, { requestId: job.id, deduped: !!b.requestId && db.jobs[b.requestId] && db.jobs[b.requestId].createdAt !== job.createdAt })
    }
    if (url.pathname === '/mac/claim' && req.method === 'POST') {
      const inflight = Object.values(db.jobs).find((j) => j.state === 'inflight')
      if (inflight) { if (Date.now() - new Date(inflight.leasedAt).getTime() > 30 * 60 * 1000) inflight.state = 'pending'; else return send(204) }
      const next = Object.values(db.jobs).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).find((j) => j.state === 'pending')
      if (!next) return send(204)
      next.state = 'inflight'; next.leasedAt = new Date().toISOString(); save()
      return send(200, { requestId: next.id, cnpj: next.cnpj, razao: next.razao, requesterPhone: next.requesterPhone, operation: next.operation, correctionOf: next.correctionOf, mode: next.mode, observacao: next.observacao })
    }
    const mStatus = url.pathname.match(/^\/mac\/jobs\/([a-f0-9-]+)\/status$/)
    if (mStatus && req.method === 'POST') {
      const job = db.jobs[mStatus[1]]; if (!job) return send(404, { error: 'not_found' })
      const b = await readBody(req); job.note = b.note || job.note
      if (['aguardando_login', 'aguardando_permissao', 'coleta_incompleta', 'falhou'].includes(b.status) && !job.notifiedState) {
        job.notifiedState = b.status
        const msg = { aguardando_login: 'Sua solicitação está na fila. O operador precisa concluir o login no e-CAC; assim que a sessão abrir, ela continua sozinha.', aguardando_permissao: 'Esta empresa ainda não está autorizada para consulta automática. Fale com a FS.', coleta_incompleta: 'A coleta ficou incompleta e não liberei um parecer parcial. A equipe vai revisar.', falhou: 'Não consegui concluir esta solicitação. A equipe foi avisada.' }[b.status]
        zapi('send-text', { phone: job.requesterPhone, message: msg }).catch((e) => log('aviso falhou', e.message))
      }
      if (b.status === 'enviado' && job.state !== 'done') { job.state = 'done'; job.deliveredAt = job.deliveredAt || new Date().toISOString() }
      else if (b.status && b.status !== 'enviado') job.state = b.state || job.state
      save(); return send(200, { ok: true })
    }
    const mResult = url.pathname.match(/^\/mac\/jobs\/([a-f0-9-]+)\/result$/)
    if (mResult && req.method === 'POST') {
      const job = db.jobs[mResult[1]]; if (!job) return send(404, { error: 'not_found' })
      if (job.deliveredAt) return send(200, { ok: true, deduped: true })
      const b = await readBody(req); if (!b.pdfBase64) return send(400, { error: 'missing_pdf' })
      const filename = String(b.filename || `Parecer ${job.cnpj}.pdf`).replace(/[\/\r\n]/g, ' ')
      fs.writeFileSync(path.join(STATE_DIR, `${job.id}.pdf`), Buffer.from(b.pdfBase64, 'base64'), { mode: 0o600 })
      job.razao = b.razao || job.razao; job.coletaEm = b.coletaEm || null; job.sources = b.sources || []; job.filename = filename; job.sha256 = b.sha256 || null
      await entregar(job, b.pdfBase64, filename, b.note)
      job.state = 'done'; job.deliveredAt = new Date().toISOString(); save()
      log('entregue', job.id, '->', job.requesterPhone); return send(200, { ok: true, delivered: true })
    }
    const mGet = url.pathname.match(/^\/jobs\/([a-f0-9-]+)$/)
    if (mGet) return db.jobs[mGet[1]] ? send(200, db.jobs[mGet[1]]) : send(404, { error: 'not_found' })
    if (url.pathname === '/jobs') return send(200, { jobs: Object.values(db.jobs) })
    return send(404, { error: 'not_found' })
  } catch (e) { send(500, { error: (e instanceof Error ? e.message : 'erro').slice(0, 200) }) }
})
server.listen(PORT, HOST, () => log(`FS Mac Bridge em http://${HOST}:${PORT} (dryRun=${Z.dryRun}, webhook=${WEBHOOK_TOKEN ? 'on' : 'off'})`))
process.on('SIGTERM', () => server.close(() => process.exit(0)))

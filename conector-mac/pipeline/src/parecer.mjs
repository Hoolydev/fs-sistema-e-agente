/**
 * Gera o Parecer Fiscal no padrão da casa (layout do exemplo, recolorido para
 * navy + dourado, com a logo da FS). Substitui o gerador de capítulos.
 *
 *   parser  -> números (dossie/dados.json)
 *   agente  -> preenche o template e escreve o texto das Partes, marcando
 *              "a apurar" o que a coleta não trouxer (nunca inventa)
 *   gerador -> roda calc.py para as roscas/tabelas quando há dado, e renderiza
 *              o parecer.html em PDF pelo Chrome
 *
 * O agente roda em `claude -p` em modo texto (sem ferramentas): recebe o
 * template e devolve o HTML final preenchido. É o mesmo modo já usado pela casa.
 *
 * Uso: node src/parecer.mjs --pasta out/<cnpj>/<AAAA-MM-DD>
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)
const log = (...a) => console.log(`[${new Date().toLocaleTimeString('pt-BR')}]`, ...a)

const pasta = path.resolve(arg('--pasta') ?? '')
const dirDossie = path.join(pasta, 'dossie')
if (!fs.existsSync(path.join(dirDossie, 'dados.json'))) throw new Error(`Sem dossiê em ${dirDossie}. Rode analisar.mjs antes.`)
const dados = JSON.parse(fs.readFileSync(path.join(dirDossie, 'dados.json'), 'utf8'))
const dossie = fs.readFileSync(path.join(dirDossie, 'dossie.md'), 'utf8')

const skillDir = path.resolve(process.cwd(), 'skills/parecer-fiscal')
const SKILL = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
const estrutura = fs.readFileSync(path.join(skillDir, 'references/estrutura.md'), 'utf8')
const metodologia = fs.readFileSync(path.join(skillDir, 'references/metodologia.md'), 'utf8')
const template = fs.readFileSync(path.join(skillDir, 'assets/template.html'), 'utf8')

// Pasta de montagem com os assets (css + logo) ao lado do parecer.html
const buildDir = path.join(pasta, 'parecer-build')
fs.mkdirSync(buildDir, { recursive: true, mode: 0o700 })
fs.copyFileSync(path.join(skillDir, 'assets/parecer.css'), path.join(buildDir, 'parecer.css'))
fs.copyFileSync(path.join(skillDir, 'assets/logo.svg'), path.join(buildDir, 'logo.svg'))

/**
 * Roda calc.py quando há principal/acessórios por inscrição (o que sustenta a
 * simulação de desconto). Devolve os blocos (roscas + tabelas) e os campos
 * numéricos formatados; ou null quando não há base para simular.
 */
function rodarCalc() {
  const insc = (dados.dividaAtiva?.inscricoes ?? [])
  const temSplit = Array.isArray(insc) && insc.length && insc.every((i) => i && typeof i === 'object' && 'principal' in i && 'acessorios' in i)
  if (!temSplit) return null
  const entrada = {
    inscricoes: insc,
    ...(dados.pgfn?.multa ? { multa: dados.pgfn.multa, juros: dados.pgfn.juros, encargo: dados.pgfn.encargo } : {}),
    rfb: dados.siefExigivel?.consolidado ?? 0,
    ...(dados.capag?.valor ? { capag: dados.capag.valor } : {}),
    ...(dados.capag?.rating ? { rating: dados.capag.rating } : {}),
    ...(dados.receitaBruta ? { receita_bruta_anual: dados.receitaBruta } : {}),
  }
  const jsonPath = path.join(buildDir, 'calc-dados.json')
  fs.writeFileSync(jsonPath, JSON.stringify(entrada, null, 2))
  const r = spawnSyncCalc(jsonPath)
  if (r.code !== 0) return null
  return { blocos: fs.readFileSync(path.join(buildDir, 'blocos.html'), 'utf8'), campos: r.campos }
}

import { spawnSync } from 'node:child_process'
function spawnSyncCalc(jsonPath) {
  const out = path.join(buildDir, 'blocos.html')
  const r = spawnSync('python3', [path.join(skillDir, 'scripts/calc.py'), jsonPath, '--out', out], { encoding: 'utf8' })
  const campos = {}
  for (const m of (r.stdout || '').matchAll(/\{\{([A-Z_]+)\}\}\s+(.+)/g)) campos[m[1]] = m[2].trim()
  return { code: r.status ?? 1, campos }
}

const calc = rodarCalc()
const temSimulacao = !!calc

const prompt = `${SKILL}

# Referência: estrutura do documento
${estrutura}

# Referência: metodologia e números
${metodologia}

# TEMPLATE (preencha e devolva ESTE html completo)
Abaixo está o template.html da casa, JÁ recolorido para a identidade da FS (navy + dourado) e JÁ com a logo da FS (referência relativa a logo.svg e parecer.css — mantenha essas referências intactas). Substitua cada {{CAMPO}} pelo conteúdo real, apague os blocos que não se aplicam, e escreva o texto das Partes I a IV.

\`\`\`html
${template}
\`\`\`

# Dados extraídos por parser (única fonte de números)
\`\`\`json
${JSON.stringify(dados, null, 2)}
\`\`\`

# Dossiê das fontes oficiais
${dossie.slice(0, 90_000)}

# Regras desta execução (conector FS)
- Mantenha a paleta navy/dourado e a logo do template. NÃO altere <link>/<img>.
- SEMPRE inclua a estrutura do painel de transação e as Partes I a IV.
- Número não se inventa: todo valor vem do JSON/dossiê. Onde faltar dado, escreva "a apurar" no campo e registre nas Ressalvas (seção 16).
${temSimulacao
  ? `- A simulação de desconto foi calculada pelo motor; use estes valores:\n${Object.entries(calc.campos).map(([k, v]) => `  {{${k}}} = ${v}`).join('\n')}\n  E cole os blocos (roscas e tabelas) abaixo nos lugares correspondentes:\n${calc.blocos}`
  : `- ATENÇÃO: a dívida da PGFN veio só com o valor CONSOLIDADO por inscrição, SEM principal/multa/juros por inscrição. Portanto: {{DESC_PCT}}, {{ECONOMIA}}, {{A_PAGAR}} e todo o quadro de desembolso e a simulação por inscrição = "a apurar" (não estime). Nos dois SVG de rosca ({{SVG_DONUT_SCORE}} e {{SVG_DONUT_COMPOSICAO}}), coloque no lugar um pequeno aviso "Simulação a apurar — depende do detalhamento por inscrição da PGFN". Preencha normalmente: passivo inscrito total, composição por natureza/tributo (por valor consolidado), CAPAG e rating, certidão, débitos na RFB (detalhados), processos e prazos.`}

# Saída
Responda APENAS com o HTML final completo do parecer (começando em <!DOCTYPE html>), sem cercas de código, sem comentários seus fora do HTML.`

fs.writeFileSync(path.join(buildDir, 'prompt-parecer.md'), prompt)

function chamarAgente() {
  return new Promise((resolve, reject) => {
    const p = spawn('claude', ['-p', '--output-format', 'text'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } })
    let out = ''
    let err = ''
    const timer = setTimeout(() => p.kill('SIGTERM'), 15 * 60 * 1000)
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => { clearTimeout(timer); reject(e) })
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(`claude saiu ${code}: ${err.slice(0, 300)}`)) })
    p.stdin.write(prompt)
    p.stdin.end()
  })
}

log(`Parecer de ${dados.razao ?? 'contribuinte'} (${dados.cnpj ?? '—'}) — simulação: ${temSimulacao ? 'com números' : 'a apurar (PGFN sem detalhe por inscrição)'}. Chamando o agente.`)
let saida = await chamarAgente()

// Extrai o HTML da resposta (tolera cercas ou texto em volta)
saida = saida.replace(/```html/gi, '').replace(/```/g, '')
const ini = saida.indexOf('<!DOCTYPE')
const fim = saida.lastIndexOf('</html>')
if (ini < 0 || fim < 0) throw new Error('O agente não devolveu HTML completo')
const html = saida.slice(ini, fim + 7)
const htmlPath = path.join(buildDir, 'parecer.html')
fs.writeFileSync(htmlPath, html)

const razao = (dados.razao ?? 'CONTRIBUINTE').toUpperCase()
const safe = razao.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const d = new Date()
const dd = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
const destino = path.join(pasta, `Parecer Fiscal ${safe} ${dd}.pdf`)

log('Renderizando o PDF pelo Chrome.')
const navegador = await chromium.launch({ channel: 'chrome' })
try {
  const page = await navegador.newPage()
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForTimeout(500)
  await page.pdf({ path: destino, format: 'A4', printBackground: true, preferCSSPageSize: true })
} finally {
  await navegador.close()
}
console.log(`\n  ${destino}`)
process.exit(0)

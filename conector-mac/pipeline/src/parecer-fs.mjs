/**
 * Emissão do parecer FS pelo GERADOR OFICIAL do sistema (npm run parecer:gerar).
 * Substitui o gerador antigo de HTML (parecer.mjs). O agente produz o
 * DiagnosticReport (com opinion), e o comando oficial valida + renderiza pelo
 * mesmo pdf.ts/logo do sistema, gravando recibo .fs.json.
 *
 * Uso: node src/parecer-fs.mjs --pasta out/<cnpj>/<AAAA-MM-DD>
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const arg = (n) => { const a = process.argv.slice(2); return a.includes(n) ? a[a.indexOf(n) + 1] : null }
const log = (...a) => console.log(`[${new Date().toLocaleTimeString('pt-BR')}]`, ...a)

const CLONE = process.env.FS_SISTEMA_DIR || '/Users/holydev/Documents/ChatGPT/FS Soluções Tributarias/fs-sistema-e-agente'
const SIS = path.join(CLONE, 'sistema-fs')
if (!fs.existsSync(path.join(SIS, 'scripts/generate-fs-report.ts'))) throw new Error(`Gerador oficial não encontrado em ${SIS}. Localize o clone fs-sistema-e-agente.`)

const pasta = path.resolve(arg('--pasta') ?? '')
const dirDossie = path.join(pasta, 'dossie')
if (!fs.existsSync(path.join(dirDossie, 'dados.json'))) throw new Error(`Sem dossiê em ${dirDossie}. Rode analisar.mjs antes.`)
const dados = JSON.parse(fs.readFileSync(path.join(dirDossie, 'dados.json'), 'utf8'))
const dossie = fs.readFileSync(path.join(dirDossie, 'dossie.md'), 'utf8')

const model = fs.readFileSync(path.join(SIS, 'lib/diagnostico/model.ts'), 'utf8')
const opinionSchema = fs.readFileSync(path.join(SIS, 'lib/diagnostico/opinion-schema.ts'), 'utf8')
const demo = fs.readFileSync(path.join(SIS, 'lib/diagnostico/demo.ts'), 'utf8')

const prompt = `Você é o analista da FS Soluções Tributárias. Produza um DiagnosticReport JSON VÁLIDO para o gerador oficial do sistema, a partir das fontes reais abaixo. Responda APENAS com o JSON (começando em { e terminando em }), sem cercas nem comentários.

# Schema executável (Zod) — obedeça exatamente
## model.ts
${model}
## opinion-schema.ts
${opinionSchema}

# Exemplo VÁLIDO de estrutura (NÃO copie os números; é só a forma)
${demo}

# Regras de mapeamento (obrigatórias)
- "mode": "real" (não "demo"). "opinion" é OBRIGATÓRIO e completo.
- Valores monetários em CENTAVOS inteiros (R$ 1.234,56 => 123456). Composição desconhecida => null. NÃO usar zero para fonte ausente.
- "sources" deve incluir id "rfb" e id "pgfn" (title, provider, collectedAt ISO, status "coletado"|"pendente", note com documento/data-base). Pelo menos uma fonte fiscal "coletado".
- "debts": uma linha por inscrição/débito. sourceId === origin.toLowerCase() (origin "PGFN" => sourceId "pgfn"; "RFB" => "rfb"). Não duplicar consolidado como dívida.
- Se alguma source ficar "pendente", "pending" não pode ficar vazio.
- Dados ausentes viram pendência/"A apurar" e null; NÃO invente desconto, CAPAG, prazos ou parcelas sem parâmetros fundamentados vindos das fontes. opinion.scenario = null se não houver base sustentada.
- CNPJ da EMPRESA consultada (não o do certificado/procurador). Datas em ISO.

# Fontes reais desta empresa
## dados.json (pipeline Mac — chaves dividaAtiva/siefExigivel/razao; converta para o schema e para centavos)
${JSON.stringify(dados, null, 2)}

## dossiê (texto das fontes oficiais)
${dossie.slice(0, 80_000)}

Responda só com o JSON do DiagnosticReport.`

function chamarAgente() {
  return new Promise((resolve, reject) => {
    const p = spawn('claude', ['-p', '--output-format', 'text'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } })
    let out = '', err = ''
    const timer = setTimeout(() => p.kill('SIGTERM'), 15 * 60 * 1000)
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => { clearTimeout(timer); reject(e) })
    p.on('close', (c) => { clearTimeout(timer); c === 0 ? resolve(out) : reject(new Error(`claude saiu ${c}: ${err.slice(0, 200)}`)) })
    p.stdin.write(prompt); p.stdin.end()
  })
}

log(`Parecer FS (gerador oficial) de ${dados.razao ?? '—'} (${dados.cnpj ?? '—'}). Montando DiagnosticReport pelo agente.`)
let saida = await chamarAgente()
saida = saida.replace(/```json/gi, '').replace(/```/g, '')
const ini = saida.indexOf('{'), fim = saida.lastIndexOf('}')
if (ini < 0 || fim <= ini) throw new Error('O agente não devolveu JSON')
let report
try { report = JSON.parse(saida.slice(ini, fim + 1)) } catch (e) { throw new Error('JSON inválido do agente: ' + e.message) }

const buildDir = path.join(pasta, 'parecer-build')
fs.mkdirSync(buildDir, { recursive: true, mode: 0o700 })
const inputJson = path.join(buildDir, 'relatorio.json')
fs.writeFileSync(inputJson, JSON.stringify(report, null, 2), { mode: 0o600 })

const cnpj = (dados.cnpj || 'EMPRESA').replace(/\D/g, '')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPdf = path.join(pasta, `Parecer_FS_${cnpj}_${stamp}.pdf`)

log('Chamando o gerador oficial: npm run parecer:gerar')
const r = spawnSync('npm', ['--prefix', SIS, 'run', 'parecer:gerar', '--', '--input', inputJson, '--output', outPdf], { encoding: 'utf8', env: { ...process.env } })
const saidaGer = (r.stdout || '') + (r.stderr || '')
fs.writeFileSync(path.join(buildDir, 'gerador.log'), saidaGer, { mode: 0o600 })
if (r.status !== 0 || !fs.existsSync(outPdf)) {
  const campos = (saidaGer.match(/Confira campos:.*/) || saidaGer.match(/[A-Za-zãç].*/g)?.slice(-1) || [''])[0]
  throw new Error('Gerador oficial recusou o relatório: ' + campos.slice(0, 240))
}
console.log(`\n  ${outPdf}`)
console.log(`  recibo: ${outPdf}.fs.json`)
process.exit(0)

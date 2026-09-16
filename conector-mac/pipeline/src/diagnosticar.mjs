/**
 * Etapa 3 do fluxo: o dossie vira Diagnostico Fiscal Federal em PDF.
 *
 * Uso: npm run diagnosticar -- --cnpj 11222333000181
 *      npm run diagnosticar -- --pasta out/11222333000181/2026-08-06
 *      npm run diagnosticar -- --cnpj ... --so-json   (nao gera PDF)
 *
 * Divisao de trabalho, que e o ponto do desenho:
 *   parser  -> todo numero, data e prazo
 *   agente  -> leitura juridica, redacao, escolha das teses aplicaveis
 *   gerador -> diagramacao no padrao da casa
 *
 * O agente roda em Claude Code headless (`claude -p`), com a skill do
 * diagnostico. Ele recebe o dossie e o dados.json e devolve JSON estruturado.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { log } from './lib/browser.mjs'
import { gerarPdfDiagnostico } from './lib/relatorio.mjs'
import { conferirValores } from './lib/conferencia.mjs'

/**
 * Chama o Claude Code em modo headless com o prompt pelo stdin.
 *
 * O prompt passa de cem mil caracteres, entao nao cabe em argumento de linha de
 * comando: tem que ir pelo stdin, e o stdin precisa ser fechado, senao o CLI
 * fica esperando mais entrada.
 */
function chamarAgente(prompt, { timeoutMs = 15 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn('claude', ['-p', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let saida = ''
    let erro = ''
    const relogio = setTimeout(() => {
      p.kill('SIGTERM')
      reject(new Error(`O agente passou de ${Math.round(timeoutMs / 60000)} minutos sem responder`))
    }, timeoutMs)

    p.stdout.on('data', (d) => (saida += d))
    p.stderr.on('data', (d) => (erro += d))
    p.on('error', (e) => {
      clearTimeout(relogio)
      reject(new Error(`Nao consegui executar o claude: ${e.message}`))
    })
    p.on('close', (codigo) => {
      clearTimeout(relogio)
      if (codigo !== 0) return reject(new Error(`claude saiu com codigo ${codigo}: ${erro.trim().slice(0, 400)}`))
      resolve(saida)
    })

    p.stdin.write(prompt)
    p.stdin.end()
  })
}

const args = process.argv.slice(2)
const arg = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)
const soJson = args.includes('--so-json')
// Rediagramar sem chamar o agente de novo, quando so o layout mudou.
const refazerPdf = args.includes('--refazer-pdf')

function resolverPasta() {
  const explicita = arg('--pasta')
  if (explicita) return path.resolve(explicita)
  const cnpj = (arg('--cnpj') ?? '').replace(/\D/g, '')
  if (!cnpj) throw new Error('Informe --cnpj ou --pasta')
  const base = path.join(process.cwd(), 'out', cnpj)
  if (!fs.existsSync(base)) throw new Error(`Sem coleta para o CNPJ ${cnpj}`)
  const dias = fs.readdirSync(base).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  if (!dias.length) throw new Error(`Sem coleta datada em ${base}`)
  return path.join(base, dias[dias.length - 1])
}

/** Recorta o JSON da resposta, tolerando cercas de codigo e texto em volta. */
export function extrairJson(saida = '') {
  const semCerca = String(saida).replace(/```(?:json)?/gi, '')
  const inicio = semCerca.indexOf('{')
  const fim = semCerca.lastIndexOf('}')
  if (inicio < 0 || fim <= inicio) throw new Error('O agente nao devolveu JSON')
  return JSON.parse(semCerca.slice(inicio, fim + 1))
}


const pasta = resolverPasta()
const dirDossie = path.join(pasta, 'dossie')
const arquivoDados = path.join(dirDossie, 'dados.json')
const arquivoDossie = path.join(dirDossie, 'dossie.md')

if (!fs.existsSync(arquivoDados)) {
  throw new Error(`Sem dossie em ${dirDossie}. Rode antes: npm run analisar -- --pasta ${pasta}`)
}

const dados = JSON.parse(fs.readFileSync(arquivoDados, 'utf8'))
const dossie = fs.readFileSync(arquivoDossie, 'utf8')
const skill = fs.readFileSync(
  path.join(process.cwd(), 'skills/diagnostico-fiscal-federal/SKILL.md'),
  'utf8'
)

log(`Diagnostico de ${dados.razao ?? 'contribuinte'} (${dados.cnpj ?? 'sem CNPJ'})`)

const prompt = [
  skill,
  '',
  '# Dados extraidos por parser, esta e a fonte dos numeros',
  '',
  '```json',
  JSON.stringify(dados, null, 2),
  '```',
  '',
  '# Dossie das fontes oficiais',
  '',
  dossie.slice(0, 120_000),
  '',
  '# Tarefa',
  '',
  'Escreva o Diagnostico Fiscal Federal desta empresa e devolva apenas o JSON no formato especificado.',
].join('\n')

const arquivoPrompt = path.join(dirDossie, 'prompt-diagnostico.md')
fs.writeFileSync(arquivoPrompt, prompt)

const arquivoDiagnostico = path.join(dirDossie, 'diagnostico.json')

let diagnostico
if (refazerPdf) {
  if (!fs.existsSync(arquivoDiagnostico)) throw new Error('Sem diagnostico.json para rediagramar')
  diagnostico = JSON.parse(fs.readFileSync(arquivoDiagnostico, 'utf8'))
  log('Rediagramando o diagnostico existente, sem chamar o agente.')
} else {
  log('Chamando o agente. Isso leva alguns minutos.')
  const stdout = await chamarAgente(prompt)
  diagnostico = extrairJson(stdout)
  fs.writeFileSync(arquivoDiagnostico, JSON.stringify(diagnostico, null, 2))
  log('Diagnostico recebido do agente.')
}

let conferencia = conferirValores(diagnostico, dados)
log(
  `Conferencia: ${conferencia.citados} valor(es) citado(s), ${conferencia.derivacoesOk} conta(s) conferida(s), ${conferencia.suspeitos.length} sem lastro`
)

/**
 * Segunda passada: em vez de so acusar, o pipeline cobra a prestacao de contas.
 *
 * Somar subtotal e calcular encargo e trabalho legitimo de analise, e exigir
 * que venha declarado de primeira nem sempre funciona. Entao, quando sobra
 * valor sem lastro, perguntamos de onde saiu cada um e conferimos a resposta.
 * O que nao fechar continua sinalizado.
 */
if (conferencia.suspeitos.length && !refazerPdf) {
  log(`Pedindo a origem de ${conferencia.suspeitos.length} valor(es) ao agente.`)
  const cobranca = [
    'Voce escreveu um diagnostico fiscal a partir do JSON abaixo, que e a unica fonte de numeros.',
    '',
    '```json',
    JSON.stringify(dados, null, 2),
    '```',
    '',
    'Estes valores aparecem no seu texto e nao constam literalmente na fonte:',
    '',
    ...conferencia.suspeitos.map((s) => `- R$ ${s.valor}`),
    '',
    'Para cada um, devolva a conta que leva ate ele. Responda apenas com JSON:',
    '',
    '{"derivacoes": [',
    '  {"valor": 3896764.46, "conta": "descricao curta", "parcelas": [2257145.55, 1448512.30]},',
    '  {"valor": 451429.11, "conta": "encargo de 20%", "percentualDe": 2257145.55, "percentual": 20}',
    ']}',
    '',
    'Cada parcela precisa existir na fonte. Se algum valor nao puder ser justificado pela fonte,',
    'devolva-o com "conta": "sem lastro" e sem parcelas, em vez de inventar uma conta.',
  ].join('\n')

  try {
    const resposta = await chamarAgente(cobranca, { timeoutMs: 8 * 60 * 1000 })
    const { derivacoes } = extrairJson(resposta)
    // Mesclar, nunca substituir: a resposta cobre apenas os valores cobrados, e
    // as contas que ja tinham sido declaradas continuam valendo.
    diagnostico.derivacoes = [...(diagnostico.derivacoes ?? []), ...(derivacoes ?? [])]
    fs.writeFileSync(arquivoDiagnostico, JSON.stringify(diagnostico, null, 2))

    conferencia = conferirValores(diagnostico, dados)
    log(
      `Reconferencia: ${conferencia.derivacoesOk} conta(s) conferida(s), ${conferencia.suspeitos.length} ainda sem lastro`
    )
  } catch (e) {
    log(`Nao consegui obter as contas: ${e.message}`)
  }
}

if (conferencia.suspeitos.length) {
  console.log('\n=== Valores citados sem lastro no dossie ===')
  for (const s of conferencia.suspeitos) console.log(`  R$ ${s.valor}: ${s.motivo}`)
  console.log('Confira estes antes de enviar ao cliente.')
}

if (soJson) {
  console.log(`\n  ${path.join(dirDossie, 'diagnostico.json')}`)
  process.exit(0)
}

const destino = await gerarPdfDiagnostico(diagnostico, dados, pasta)
console.log(`\n  ${destino}`)
process.exit(conferencia.suspeitos.length ? 4 : 0)

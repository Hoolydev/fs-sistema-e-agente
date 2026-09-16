import fs from 'node:fs'
import path from 'node:path'
import { log } from './browser.mjs'

/**
 * Padrao de nomenclatura definido pelo Fernando: sem travessao e sem underline.
 * Espelha os arquivos que ele ja produz, ex.:
 *   "Diagnostico Fiscal F SPESSATTO 20-07-2026.pdf"
 */
export function nomeArquivo(documento, razao, ext = 'pdf') {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const data = `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`
  const limpo = String(razao)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${documento} ${limpo} ${data}.${ext}`
}

export function pastaSaida(baseOut, cnpj) {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const dia = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const dir = path.join(baseOut, cnpj.replace(/\D/g, ''), dia)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Salva a pagina atual como PDF.
 * page.pdf() do Playwright so roda headless, e aqui o navegador precisa estar
 * visivel pro login com certificado. Entao usamos Page.printToPDF via CDP,
 * que funciona nos dois modos. E o mesmo "mandar imprimir e salvar" que o
 * Fernando faz na mao no relatorio consolidado do Regularize.
 */
export async function salvarPdf(ctx, page, destino) {
  const cdp = await ctx.newCDPSession(page)
  const { data } = await cdp.send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: false,
    paperWidth: 8.27,
    paperHeight: 11.69,
    marginTop: 0.4,
    marginBottom: 0.4,
    marginLeft: 0.4,
    marginRight: 0.4,
  })
  fs.writeFileSync(destino, Buffer.from(data, 'base64'))
  await cdp.detach()
  log(`PDF salvo: ${path.basename(destino)}`)
  return destino
}

/**
 * Confere se a pagina tem mesmo o conteudo esperado antes de virar PDF.
 *
 * Sem isso a coleta "passa" salvando telas de erro: na primeira rodada com a
 * GABB, a CAPAG gravou um PDF com "Voce nao tem permissao de acesso" e o
 * relatorio consolidado saiu sem nenhuma inscricao, os dois reportados como ok.
 * Um PDF de erro entregue como fonte de diagnostico e pior que uma falha.
 */
export async function conferirPagina(page, { erroSe = [], exigir = [] } = {}) {
  const texto = await page.locator('body').innerText().catch(() => '')
  for (const padrao of erroSe) {
    if (new RegExp(padrao, 'i').test(texto)) {
      throw new Error(`Pagina em estado invalido: "${padrao}" encontrado`)
    }
  }
  for (const padrao of exigir) {
    if (!new RegExp(padrao, 'i').test(texto)) {
      throw new Error(`Pagina sem o conteudo esperado: "${padrao}" ausente`)
    }
  }
  return texto
}

/** Erros comuns dos portais da PGFN/RFB que nunca devem virar PDF de entrega. */
export const ERROS_PORTAL = [
  'nao tem permissao de acesso',
  'não tem permissão de acesso',
  'sistema indispon',
  'acesso negado',
  'erro inesperado',
  'sessao expirada',
  'sessão expirada',
]

/**
 * Telas que a automacao nunca deve estar visitando, por regra de escopo.
 *
 * Emitir DARF gera documento de arrecadacao em nome do contribuinte e esta
 * fora da regra de somente leitura acordada com o Fernando. Na coleta da GABB
 * em 03/08 o extrator do SISPAR entrou pela URL raiz e parou exatamente em
 * "EMISSAO DE DOCUMENTO DE ARRECADACAO", que virou PDF de entrega. Detectar
 * isso e abortar a etapa, em vez de seguir clicando.
 */
export const TELAS_PROIBIDAS = [
  'emiss.o de documento de arrecada',
  'informe o n.mero do parcelamento',
]

/**
 * Captura um download disparado por uma acao (botao "Baixar relatorio").
 */
export async function capturarDownload(page, acao, destino) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    acao(),
  ])
  await download.saveAs(destino)
  log(`Download salvo: ${path.basename(destino)}`)
  return destino
}

/**
 * Evidencia visual de cada etapa. Serve pra auditar a coleta e pra provar ao
 * cliente de onde cada numero saiu, igual o rodape de fontes dos PDFs dele.
 */
export async function evidencia(page, dir, nome) {
  const destino = path.join(dir, 'evidencias', `${nome}.png`)
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  await page.screenshot({ path: destino, fullPage: true })
  return destino
}

/**
 * Registro de proveniencia: cada fonte com o horario exato da extracao.
 * Alimenta o rodape do diagnostico ("relatorio emitido as 07h48...").
 */
export class Proveniencia {
  constructor(cnpj, razao) {
    this.cnpj = cnpj
    this.razao = razao
    this.iniciadoEm = new Date().toISOString()
    this.fontes = []
  }
  registrar(fonte, detalhe, arquivo) {
    const agora = new Date()
    this.fontes.push({
      fonte,
      detalhe,
      arquivo: arquivo ? path.basename(arquivo) : null,
      extraidoEm: agora.toISOString(),
      hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    })
  }
  salvar(dir) {
    const destino = path.join(dir, 'proveniencia.json')
    fs.writeFileSync(destino, JSON.stringify(this, null, 2))
    return destino
  }
}

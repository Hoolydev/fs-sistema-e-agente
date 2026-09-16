/**
 * Extrator 4: Processos digitais e intimacoes (e-Processo).
 *
 * e-CAC > Legislacao e Processo > Processos Digitais (e-Processo)
 * Abre ja autenticado, herdando a sessao do e-CAC. SPA com rotas em hash.
 *
 * Duas telas, ambas citadas por ele na call:
 *   - Processos em que sou o Interessado Principal
 *   - Comunicados e Intimacoes  <- e daqui que sai o prazo de defesa
 *
 * POR QUE NAO IMPRIMIR A TELA:
 * A grade nasce paginada em 10 linhas e as colunas truncam o texto com
 * reticencias. Na coleta da GABB em 03/08 isso produziu dois PDFs inuteis:
 * "Mostrando 1 a 10 de 13 registro(s)" nos processos e "1 a 10 de 23" nas
 * intimacoes, com numero de processo saindo como "11000.740..." e data como
 * "24/04/20...". Um prazo de defesa truncado e pior que prazo nenhum.
 *
 * A tela oferece "Exportar CSV" e "Exportar PDF" nativos, que trazem a base
 * inteira sem truncar. Usamos os dois: o CSV alimenta a analise, o PDF vale
 * como documento de fonte. A impressao da tela virou fallback, e mesmo assim
 * so depois de expandir a paginacao ao maximo.
 *
 * SOMENTE LEITURA. Nao abre juntada, nao protocola, nao solicita servico.
 */
import fs from 'node:fs'
import path from 'node:path'
import { log } from '../lib/browser.mjs'
import {
  salvarPdf,
  evidencia,
  nomeArquivo,
  conferirPagina,
  ERROS_PORTAL,
} from '../lib/coleta.mjs'

const BASE = 'https://eprocesso.cav.receita.fazenda.gov.br/eprocessocontribuinte/'
export const ROTAS = {
  processos: `${BASE}#/processos_consultar?consulta=meus-processos`,
  intimacoes: `${BASE}#/comunicados_intimacoes_consultar`,
}

/** Le a primeira tabela util da tela como matriz de strings. */
async function lerTabela(page) {
  return page.evaluate(() => {
    const tabelas = [...document.querySelectorAll('table')]
    const util = tabelas.find((t) => t.querySelectorAll('tr').length > 1)
    if (!util) return null
    return [...util.querySelectorAll('tr')].map((tr) =>
      [...tr.querySelectorAll('th, td')].map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim())
    )
  })
}

/**
 * Le o rodape "Mostrando 1 a 10 de 23 registro(s)" pra saber se a grade na tela
 * representa o total. E o que denuncia coleta parcial.
 */
export function lerTotalizador(texto = '') {
  const m = texto.match(/Mostrando\s+(\d+)\s+a\s+(\d+)\s+de\s+(\d+)\s+registro/i)
  if (!m) return null
  return { de: Number(m[1]), ate: Number(m[2]), total: Number(m[3]) }
}

/**
 * Sobe a paginacao pro maior valor disponivel, pra impressao de tela e leitura
 * de grade cobrirem tudo. O seletor costuma ser um <select> com 10/25/50/100.
 */
async function expandirPaginacao(page) {
  const escolhido = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('select')]
    for (const s of selects) {
      const numeros = [...s.options]
        .map((o) => Number(String(o.value ?? o.text).replace(/\D/g, '')))
        .filter((n) => Number.isFinite(n) && n > 0)
      if (!numeros.length) continue
      const maior = Math.max(...numeros)
      if (maior <= 10) continue
      const opcao = [...s.options].find(
        (o) => Number(String(o.value ?? o.text).replace(/\D/g, '')) === maior
      )
      if (!opcao) continue
      s.value = opcao.value
      s.dispatchEvent(new Event('change', { bubbles: true }))
      return maior
    }
    return null
  })
  if (escolhido) {
    log(`e-Processo: paginacao ampliada para ${escolhido} linhas`)
    await page.waitForTimeout(4000)
  }
  return escolhido
}

/**
 * Aciona um botao de exportacao e captura o download.
 * Devolve null quando o botao nao existe ou o portal nao dispara o download,
 * pra que o chamador caia no fallback em vez de abortar a coleta inteira.
 */
async function exportar(page, rotulo, destino) {
  try {
    // O clique vai por evaluate, no DOM, de proposito.
    //
    // O botao do PrimeNG deixa uma navegacao pendente que nunca termina. Com o
    // locator do Playwright, o auto-waiting fica preso em "waiting for
    // navigation to finish" e o download so chega depois do timeout: foi o que
    // fez a coleta de 07/08 concluir que a exportacao nativa nao existia, e
    // depois fez o segundo export falhar mesmo com o primeiro funcionando.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.evaluate((texto) => {
        const alvo = [...document.querySelectorAll('button, a')].find((e) =>
          (e.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase().includes(texto.toLowerCase())
        )
        if (!alvo) throw new Error(`botao "${texto}" ausente`)
        alvo.click()
      }, rotulo),
    ])
    await download.saveAs(destino)
    const tamanho = fs.statSync(destino).size
    if (tamanho < 200) {
      log(`e-Processo: "${rotulo}" baixou arquivo vazio (${tamanho} bytes)`)
      fs.unlinkSync(destino)
      return null
    }
    log(`e-Processo: ${rotulo} salvo (${Math.round(tamanho / 1024)} KB)`)
    return destino
  } catch (e) {
    log(`e-Processo: falha ao exportar "${rotulo}": ${e.message}`)
    return null
  }
}

async function abrirTela(page, url, nome, { dir, razao, prov, ctx, documento }) {
  log(`e-Processo: ${nome}`)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  // A SPA costuma exigir o clique de consulta pra popular a grade
  const botao = page
    .locator('button:has-text("Consultar"), button:has-text("Pesquisar"), input[value="Consultar" i]')
    .first()
  if (await botao.count()) {
    await botao.click().catch(() => {})
    await page.waitForTimeout(4000)
  }
  await page.waitForTimeout(2000)

  const texto = await conferirPagina(page, { erroSe: ERROS_PORTAL })
  const vazio = /nenhum registro|não foram encontrados|sem registros/i.test(texto)

  await expandirPaginacao(page)
  await evidencia(page, dir, `eprocesso-${nome}`)

  // Exportacao nativa: e o que traz a base completa, sem truncar coluna.
  const arquivos = []
  const csv = await exportar(page, 'Exportar CSV', path.join(dir, nomeArquivo(documento, razao, 'csv')))
  if (csv) arquivos.push(csv)

  const destinoPdf = path.join(dir, nomeArquivo(documento, razao))
  const pdf = await exportar(page, 'Exportar PDF', destinoPdf)
  if (pdf) {
    arquivos.push(pdf)
  } else {
    // Fallback: imprime a tela ja com a paginacao expandida.
    log(`e-Processo: exportacao nativa indisponivel, imprimindo a tela de ${nome}`)
    await salvarPdf(ctx, page, destinoPdf)
    arquivos.push(destinoPdf)
  }

  const tabela = await lerTabela(page)
  const totalizador = lerTotalizador(await page.locator('body').innerText().catch(() => ''))
  const linhas = Math.max(0, (tabela?.length ?? 1) - 1)

  // Coleta parcial nao pode passar por completa. Se o portal diz 23 e a grade
  // trouxe 10, quem for usar isso precisa saber, e o CSV vira a fonte boa.
  if (totalizador && linhas && linhas < totalizador.total && !csv) {
    throw new Error(
      `Coleta parcial em ${nome}: ${linhas} de ${totalizador.total} registros e sem CSV de apoio`
    )
  }
  if (totalizador) log(`e-Processo: ${nome}, ${totalizador.total} registro(s) no portal`)

  for (const arquivo of arquivos) {
    prov?.registrar('Receita Federal, e-Processo', documento, arquivo)
  }

  return { arquivos, tabela, totalizador, vazio }
}

export async function extrairProcessos(ctx, { dir, razao, prov }) {
  const page = await ctx.newPage()
  const arquivos = []
  try {
    const p = await abrirTela(page, ROTAS.processos, 'processos', {
      dir, razao, prov, ctx, documento: 'Processos Digitais',
    })
    arquivos.push(...p.arquivos)

    const i = await abrirTela(page, ROTAS.intimacoes, 'intimacoes', {
      dir, razao, prov, ctx, documento: 'Comunicados e Intimacoes',
    })
    arquivos.push(...i.arquivos)

    return { arquivos, processos: p.tabela, intimacoes: i.tabela, totais: { processos: p.totalizador, intimacoes: i.totalizador } }
  } finally {
    await page.close().catch(() => {})
  }
}

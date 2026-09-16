/**
 * Extratores 2 e 3: Divida Ativa da Uniao e CAPAG (Regularize / SISPAR).
 *
 * URLs confirmadas pelo rodape de impressao dos PDFs extraidos na call de
 * 31/07/2026, e o caminho de navegacao foi validado contra o portal em
 * 07/08/2026. O Regularize so opera de segunda a sexta, das 07h as 22h
 * (horario de Brasilia).
 *
 * Como as duas telas finais tem URL propria e estavel, vamos direto nelas e so
 * caimos na navegacao por cliques se o acesso direto nao resolver.
 *
 * Caminho dele:
 *   e-CAC > Divida Ativa da Uniao > PGFN, todos os servicos do Regularize
 *   > Consulta de divida ativa > relatorio consolidado > imprimir em PDF
 *   > Negociar divida > Capacidade de pagamento (SISPAR) > consultar > imprimir
 *
 * O relatorio consolidado so exporta HTML, por isso imprimimos via CDP em vez
 * de esperar download.
 *
 * SOMENTE LEITURA. "Negociar divida" e usado apenas para chegar na tela de
 * consulta da CAPAG. Nada de aderir, simular adesao ou emitir guia.
 */
import path from 'node:path'
import { log, ECAC_PORTAL } from '../lib/browser.mjs'
import { salvarPdf, evidencia, nomeArquivo, conferirPagina, ERROS_PORTAL, TELAS_PROIBIDAS } from '../lib/coleta.mjs'

/**
 * URLs finais das duas telas, lidas do rodape de impressao dos PDFs de
 * referencia (Regularize_Relatorio_Divida_Ativa_31072026-1455.pdf e
 * "Procuradoria Geral da Fazenda Nacional - PGFN.pdf").
 */
export const URL_CONSULTA_DIVIDAS = 'https://www.regularize.pgfn.gov.br/consultaDividas'
export const URL_RELATORIO_DIVIDA = 'https://www.regularize.pgfn.gov.br/consultaDividas/relatorio'
export const URL_CAPAG = 'https://sisparnet.pgfn.fazenda.gov.br/sisparInternet/consultarCapag.jsf'

/**
 * O Regularize publica a propria janela de funcionamento na home. Fora dela o
 * portal responde "Sistema indisponivel no momento" e nem faz o SSO.
 */
export function janelaRegularize(agora = new Date()) {
  const brt = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const dia = brt.getDay()
  const hora = brt.getHours()
  const util = dia >= 1 && dia <= 5
  const dentro = util && hora >= 7 && hora < 22
  return {
    dentro,
    motivo: dentro
      ? null
      : !util
        ? 'Regularize nao opera aos fins de semana (seg a sex, 07h as 22h)'
        : `Regularize fora do horario (07h as 22h). Agora sao ${hora}h`,
  }
}

/** Chega no Regularize autenticado partindo do e-CAC, que e onde ocorre o SSO. */
async function abrirRegularize(ctx) {
  const page = await ctx.newPage()
  await page.goto(ECAC_PORTAL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.locator('a:has-text("Dívida Ativa da União")').first().click()
  await page.waitForTimeout(2000)

  const antes = ctx.pages().length
  await page.locator('a:has-text("Todos os serviços do Regularize")').first().click()
  await page.waitForTimeout(8000)

  const paginas = ctx.pages()
  const alvo = paginas.length > antes ? paginas[paginas.length - 1] : page
  await alvo.waitForLoadState('domcontentloaded').catch(() => {})
  await alvo.waitForTimeout(4000)

  const texto = await alvo.locator('body').innerText().catch(() => '')
  if (/Sistema indispon/i.test(texto)) {
    throw new Error('Regularize respondeu "sistema indisponivel". Rode em dia util entre 07h e 22h.')
  }
  return alvo
}

export const URL_SISPAR_HUB = 'https://www.regularize.pgfn.gov.br/sispar'

/** O sistema de negociacoes e servido pelo SERPRO, dentro de um iframe. */
const DOMINIO_SISPAR = /estaleiro\.serpro\.gov\.br/i

/**
 * Espera o iframe do Sistema de Negociacoes aparecer.
 *
 * Cuidado com o filtro: a URL da pagina externa tambem contem "sispar"
 * (/sispar/sisparnet), entao procurar por "sispar" devolve o frame errado, que
 * so tem o menu do Regularize. O que identifica o sistema e o dominio do SERPRO.
 */
async function esperarFrameSispar(page, timeoutMs = 40_000) {
  const limite = Date.now() + timeoutMs
  while (Date.now() < limite) {
    const frame = page.frames().find((f) => DOMINIO_SISPAR.test(f.url()))
    if (frame) {
      const texto = await frame.evaluate(() => document.body?.innerText ?? '').catch(() => '')
      if (/Sistema de Negocia/i.test(texto)) return frame
    }
    await page.waitForTimeout(2000)
  }
  throw new Error('O Sistema de Negociacoes do SISPAR nao carregou no iframe')
}

/**
 * Abre o SISPAR e devolve a pagina e o iframe do sistema.
 *
 * Caminho real, mapeado em 07/08/2026 com a sessao viva:
 *   regularize.pgfn.gov.br/sispar > ACESSAR > /sispar/sisparnet
 *   > iframe pro-frontend-simulador-sispar.estaleiro.serpro.gov.br/home
 *
 * O menu do sistema fica dentro do iframe: SIMULAR/NEGOCIAR, CONSULTAR, EMITIR
 * GUIA, DEBITO AUTOMATICO, CAPACIDADE DE PAGAMENTO, RECIBOS e DECLARACAO DE
 * RECEITA. Usamos apenas CONSULTAR e CAPACIDADE DE PAGAMENTO.
 */
export async function abrirSispar(ctx) {
  // "Feche o navegador, retorne ao Regularize e tente novamente" e a instrucao
  // que o proprio sisparnet da quando a sessao anterior ficou pendurada. Ele
  // autentica por token JWT na URL e guarda o estado em cookie proprio; se o
  // cookie velho continua ali, toda tentativa nova responde "voce nao tem
  // permissao de acesso", que era o erro da coleta de 03/08 e das repeticoes
  // de 07/08. Limpar so o dominio dele equivale a fechar o navegador, sem
  // derrubar a sessao do e-CAC, que custou um login humano.
  for (const domain of ['sisparnet.pgfn.fazenda.gov.br', 'pro-frontend-simulador-sispar.estaleiro.serpro.gov.br']) {
    await ctx.clearCookies({ domain }).catch(() => {})
  }

  const page = await ctx.newPage()
  await page.goto(URL_SISPAR_HUB, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)

  const acessar = page.locator('button:has-text("ACESSAR"), a:has-text("ACESSAR")').first()
  if (!(await acessar.count())) throw new Error('Botao ACESSAR ausente na tela do SISPAR')
  await acessar.click({ timeout: 20_000 })
  await page.waitForTimeout(8000)

  const frame = await esperarFrameSispar(page)
  return { page, frame }
}

/**
 * Aciona uma funcao do menu do SISPAR e resolve o aviso de redirecionamento.
 *
 * Cada funcao abre um modal, "voce sera redirecionado para outro ambiente do
 * sistema SISPAR", com DESISTIR e CONTINUAR. Sem confirmar, nada acontece, e o
 * modal aberto ainda intercepta os cliques seguintes. Foi o que fez a coleta de
 * 07/08 parar na home do sistema.
 *
 * Devolve a pagina onde a funcao abriu, que pode ser uma aba nova.
 */
export async function abrirFuncaoSispar(ctx, page, rotulo, { menu } = {}) {
  const frame = page.frames().find((f) => DOMINIO_SISPAR.test(f.url()))
  if (!frame) throw new Error('Frame do SISPAR perdido antes de abrir a funcao')

  await frame.locator(`text=${rotulo}`).first().click({ timeout: 20_000 })
  await page.waitForTimeout(4000)

  const antes = ctx.pages().length
  const atual = page.frames().find((f) => DOMINIO_SISPAR.test(f.url())) ?? frame
  const continuar = atual.locator('button:has-text("CONTINUAR")').first()
  if (await continuar.count()) {
    log(`SISPAR: confirmando o redirecionamento de "${rotulo}"`)
    await continuar.click({ timeout: 20_000 })
    await page.waitForTimeout(10_000)
  }

  const paginas = ctx.pages()
  const alvo = paginas.length > antes ? paginas[paginas.length - 1] : page
  await alvo.waitForLoadState('domcontentloaded').catch(() => {})
  await alvo.waitForTimeout(5000)

  // O ambiente de destino e o SISPAR classico (JSF, "Producao 2.6.3 BUILD 3"),
  // que sempre abre na consulta de negociacoes, seja qual for a funcao clicada
  // no menu novo. Para chegar em outra tela e preciso usar o menu de la:
  //   Consulta | Adesao | Emissao de Documento | Debito automatico |
  //   Capacidade de pagamento | Declaracao de Receita
  // Sem esta etapa, a coleta de 07/08 salvou a consulta de negociacoes dentro
  // do arquivo da CAPAG.
  if (menu) {
    const item = alvo.locator(`a:has-text("${menu}"), td:has-text("${menu}")`).first()
    if (await item.count()) {
      log(`SISPAR: menu "${menu}"`)
      await item.click({ timeout: 20_000 }).catch(() => {})
      await alvo.waitForTimeout(7000)
    } else {
      log(`SISPAR: item de menu "${menu}" nao encontrado`)
    }
  }
  return alvo
}

export async function extrairPgfn(ctx, { dir, razao, prov }) {
  const janela = janelaRegularize()
  if (!janela.dentro) {
    throw new Error(janela.motivo)
  }

  const page = await abrirRegularize(ctx)
  const arquivos = []

  try {
    // --- Extracao 2: relatorio consolidado da divida ---
    // A tela "Personalizar Relatorio" abre com TODOS os checkboxes
    // desmarcados. Sem marcar nada e mandar gerar, o PDF sai com
    // "Naturezas selecionadas:" em branco e nenhuma inscricao. O Fernando
    // marca tudo, como se ve no relatorio de referencia dele.
    // E uma SPA Angular: indo direto em /consultaDividas/relatorio a tela
    // monta sem os checkboxes (o estado vem da tela anterior). Tem que passar
    // por /consultaDividas e clicar em RELATORIO CONSOLIDADO.
    log('PGFN: relatorio consolidado da divida')
    await page.goto(URL_CONSULTA_DIVIDAS, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(7000)
    await page.locator('button:has-text("RELATÓRIO CONSOLIDADO")').first().click({ timeout: 20_000 })
    await page.waitForTimeout(7000)

    // Os inputs sao custom: ficam ocultos atras do label estilizado, entao
    // check() do Playwright nao pega. Marcamos no DOM e disparamos o evento
    // que o Angular escuta.
    for (const id of ['natTodosCheck', 'sitTodosCheck']) {
      await page.evaluate((alvo) => {
        const cb = document.getElementById(alvo)
        if (!cb) return
        if (!cb.checked) {
          const label = document.querySelector(`label[for="${alvo}"]`)
          if (label) label.click()
          else cb.click()
        }
      }, id)
      await page.waitForTimeout(1200)
    }

    const marcados = await page.evaluate(() =>
      [...document.querySelectorAll('input[type=checkbox]')].filter((c) => c.checked).length
    )
    log(`PGFN: ${marcados} filtros marcados`)
    if (marcados === 0) throw new Error('Nenhum filtro marcado, o relatorio sairia vazio')

    await page.locator('button:has-text("GERAR RELATÓRIO")').first().click({ timeout: 20_000 })
    await page.waitForTimeout(9000)
    await conferirPagina(page, {
      erroSe: ERROS_PORTAL,
      exigir: ['Relat.rio Consolidado da D.vida', 'Naturezas selecionadas: *\\w'],
    })
    await evidencia(page, dir, 'pgfn-relatorio-consolidado')

    const destinoDivida = path.join(dir, nomeArquivo('Relatorio Consolidado Divida Ativa', razao))
    await salvarPdf(ctx, page, destinoDivida)
    arquivos.push(destinoDivida)
    prov?.registrar('PGFN, portal Regularize', 'Relatorio Consolidado da Divida', destinoDivida)

    // A CAPAG mora no SISPAR e e coletada pelo extrator de la: o sisparnet nao
    // aceita duas aberturas na mesma sessao, a segunda responde "voce nao tem
    // permissao de acesso". Uma visita so, duas telas.
    return arquivos
  } finally {
    await page.close().catch(() => {})
  }
}

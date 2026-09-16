/**
 * Extrator 5: SISPAR, negociacoes e extratos individualizados.
 *
 * ESTADO: reescrito em 06/08 depois da coleta falha da GABB. Entrar pela URL
 * raiz do sisparnet nao funciona: o sistema so aceita sessao originada pelo hub
 * do Regularize, e sem ela a navegacao para na primeira tela publica que o JSF
 * oferece, que e a de EMISSAO DE DOCUMENTO DE ARRECADACAO. Foi o que aconteceu
 * em 03/08: o PDF entregue como "Negociacoes SISPAR" era o formulario de
 * emissao de DARF pedindo o numero do parcelamento.
 *
 * Agora entramos pelo mesmo caminho da CAPAG (hub > card) e abortamos se a tela
 * de emissao aparecer.
 *
 * Por que esta etapa existe, e por que ela e a mais valiosa das cinco:
 *
 * O relatorio consolidado da divida informa QUE existem negociacoes, mas nao os
 * montantes ja amortizados em cada uma. O proprio Fernando registra isso como
 * pendencia no diagnostico do Spessatto, em "pontos de apuracao pendentes":
 *
 *   "(I) saldos individualizados das doze contas SISPAR, uma vez que o
 *    relatorio informa a existencia das negociacoes mas nao os montantes ja
 *    amortizados"
 *
 * Ou seja: ele fecha o diagnostico com uma base de calculo aproximada porque
 * abrir doze contas na mao e caro. E a base de calculo e o que define o
 * honorario dele, que e 50% do valor efetivamente extinto. Automatizar a
 * varredura conta a conta resolve uma pendencia que hoje ele declara em rodape.
 *
 * O capitulo 02 do diagnostico da Cooper-Acao sai inteiro daqui: numero da
 * negociacao, data de adesao, data de deferimento, situacao, modalidade,
 * programa, quantidade de prestacoes, debito automatico, impedimento de
 * rescisao e impedimento de liquidacao.
 *
 * SOMENTE LEITURA. Abre a arvore de negociacoes e le extratos. Nao adere,
 * nao rescinde, nao altera modalidade, nao emite guia.
 */
import path from 'node:path'
import { log } from '../lib/browser.mjs'
import {
  salvarPdf,
  evidencia,
  nomeArquivo,
  conferirPagina,
  ERROS_PORTAL,
  TELAS_PROIBIDAS,
} from '../lib/coleta.mjs'
import { janelaRegularize, abrirSispar, abrirFuncaoSispar } from './pgfn.mjs'

/**
 * Rotulos do card de consulta no hub do SISPAR, em ordem de tentativa.
 * O menu do sistema (Producao 2.6.3 BUILD 3) traz "Consulta"; o hub novo do
 * Regularize costuma rotular o card de forma mais descritiva.
 */
const CARDS_CONSULTA = [
  'CONSULTAR NEGOCIAÇÕES',
  'CONSULTA DE NEGOCIAÇÕES',
  'MINHAS NEGOCIAÇÕES',
  'CONSULTA',
]

/**
 * Menu do SISPAR, lido do PDF de referencia da CAPAG (31/07/2026, sistema
 * "Producao - 2.6.3 BUILD 3", JSF):
 *
 *   Consulta | Adesao | Emissao de Documento | Debito automatico |
 *   Capacidade de pagamento | Declaracao de Receita | Sair
 *
 * Usamos apenas "Consulta". "Adesao" e "Emissao de Documento" alteram estado ou
 * geram documento de arrecadacao e estao fora do escopo de leitura.
 */
export const MENU_CONSULTA = 'Consulta'

/**
 * A relacao de contas SISPAR ja vem no relatorio de situacao fiscal, na secao
 * "Parcelamento com Exigibilidade Suspensa (SISPAR)", com numero da conta e
 * modalidade, neste formato:
 *
 *   NNNNNNNNN  TRANSACAO POR ADESAO - EDITAL PGDAU N NN/AAAA - SIMPLES NACIONAL
 *              Modalidade: MICROEMPRESA E PEQUENO PORTE - ATE 145 MESES - REDUCAO ATE 70%
 *   NNNNNNNNN  PARCELAMENTO CONVENCIONAL
 *              Modalidade: PARCELAMENTO SEM GARANTIA  SIMPLES NACIONAL
 *
 * Ou seja, nao precisamos descobrir QUAIS sao as contas navegando no SISPAR:
 * a extracao 1 ja entrega a lista. O que falta, e que so existe aqui dentro, e
 * o SALDO individualizado de cada conta.
 */
export function contasDoRelatorioSituacaoFiscal(textoRelatorio = '') {
  const bloco = textoRelatorio.split(/Parcelamento com Exigibilidade Suspensa \(SISPAR\)/i)[1]
  if (!bloco) return []
  const contas = []
  const re = /^\s*(\d{6,12})\s+(.+?)\s*$/gm
  let m
  while ((m = re.exec(bloco.split(/Final do Relat/i)[0] ?? '')) !== null) {
    contas.push({ conta: m[1], instrumento: m[2].trim() })
  }
  return contas
}

/** Campos do detalhe da negociacao, na ordem em que aparecem no diagnostico. */
export const CAMPOS_NEGOCIACAO = [
  'Nº da Negociação',
  'Nome do Contribuinte',
  'CNPJ',
  'Tipo de Acordo',
  'Data de Adesão',
  'Data de Deferimento',
  'Situação',
  'Data da Situação',
  'Modalidade',
  'Programa',
  'Qtd. de Prestações',
  'Débito Automático',
  'Impedimento de Rescisão',
  'Impedimento de Liquidação',
]

/**
 * "Impedimento de Liquidacao = Nao" e o sinal verde da tese: confirma que o
 * pedido de amortizacao com direito creditorio pode ser protocolado ja, nos
 * termos do art. 78 da Portaria PGFN 6.757/2022. Vale como flag estruturada.
 */
export function liberaProtocolo(detalhe) {
  const v = String(detalhe?.['Impedimento de Liquidação'] ?? '').trim().toLowerCase()
  return v.startsWith('não') || v.startsWith('nao')
}

/**
 * Conta pendente e risco de rescisao: art. 4o, §§ 3o e 4o da Lei 13.988/2020 e
 * art. 77 da Portaria PGFN 6.757/2022 vedam nova transacao por dois anos, o que
 * elimina o pre-requisito do art. 79, I. E o item 1 do plano de acao dele.
 */
export function contasEmRisco(negociacoes = []) {
  return negociacoes.filter((n) => /pendente|atraso|inadimpl/i.test(String(n.situacao ?? '')))
}

async function lerGrade(page) {
  return page.evaluate(() => {
    const t = [...document.querySelectorAll('table')].find((x) => x.querySelectorAll('tr').length > 1)
    if (!t) return null
    return [...t.querySelectorAll('tr')].map((tr) =>
      [...tr.querySelectorAll('th, td')].map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim())
    )
  })
}

export async function extrairSispar(ctx, { dir, razao, prov }) {
  const janela = janelaRegularize()
  if (!janela.dentro) throw new Error(janela.motivo)

  // Mesmo caminho da CAPAG: hub do Regularize, iframe do sistema, funcao
  // CONSULTAR, e a confirmacao do aviso de redirecionamento.
  const { page: hub } = await abrirSispar(ctx)
  const arquivos = []
  let page = hub

  try {
    log('SISPAR: lista de negociacoes')
    page = await abrirFuncaoSispar(ctx, hub, 'CONSULTAR')

    // Barreira de escopo: se caiu na emissao de documento de arrecadacao,
    // saimos daqui sem clicar em mais nada e sem gerar PDF.
    await conferirPagina(page, { erroSe: [...ERROS_PORTAL, ...TELAS_PROIBIDAS] })

    await evidencia(page, dir, 'sispar-negociacoes')
    const destinoLista = path.join(dir, nomeArquivo('Negociacoes SISPAR', razao))
    await salvarPdf(ctx, page, destinoLista)
    arquivos.push(destinoLista)
    prov?.registrar('PGFN, SISPAR', 'Relacao de negociacoes', destinoLista)

    const grade = await lerGrade(page)
    const linhas = (grade ?? []).slice(1)
    log(`SISPAR: ${linhas.length} negociacoes na grade`)

    // --- CAPAG, na mesma visita ---
    // Nao da pra deixar isso no extrator da PGFN: reabrir o sisparnet na mesma
    // sessao devolve "voce nao tem permissao de acesso". Como ja estamos
    // dentro, basta trocar de tela pelo menu do sistema.
    try {
      log('SISPAR: capacidade de pagamento')
      const menu = page.locator('a:has-text("Capacidade de pagamento"), td:has-text("Capacidade de pagamento")').first()
      if (await menu.count()) {
        await menu.click({ timeout: 20_000 })
        await page.waitForTimeout(8000)

        // A tela abre no formulario de pesquisa, com o CNPJ do certificado ja
        // preenchido. Sem acionar "Pesquisar", o PDF sai com o formulario em
        // branco no lugar da capacidade apurada.
        const pesquisar = page
          .locator('input[type=submit][value*="Pesquisar" i], button:has-text("Pesquisar"), a:has-text("Pesquisar")')
          .first()
        if (await pesquisar.count()) {
          await pesquisar.click({ timeout: 20_000 }).catch(() => {})
          await page.waitForTimeout(8000)
        }

        await conferirPagina(page, {
          erroSe: [...ERROS_PORTAL, ...TELAS_PROIBIDAS],
          // Exigir o resultado, e nao apenas o titulo da tela: a classificacao
          // de A a D e o que decide se ha desconto a obter, e e ela que o
          // diagnostico usa pra escolher a tese.
          exigir: ['capacidade de pagamento', 'classifica|capacidade de pagamento em|R\\$'],
        })
        await evidencia(page, dir, 'sispar-capag')
        const destinoCapag = path.join(dir, nomeArquivo('Capacidade de Pagamento CAPAG', razao))
        await salvarPdf(ctx, page, destinoCapag)
        arquivos.push(destinoCapag)
        prov?.registrar('PGFN, SISPAR', 'Consulta de Capacidade de Pagamento', destinoCapag)
      } else {
        log('SISPAR: menu de capacidade de pagamento ausente')
      }
    } catch (e) {
      log(`SISPAR: CAPAG nao obtida, ${e.message}`)
    }

    // Volta pra consulta antes de abrir os extratos conta a conta.
    const voltarConsulta = page.locator('a:has-text("Consulta"), td:has-text("Consulta")').first()
    if (await voltarConsulta.count()) {
      await voltarConsulta.click({ timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(7000)
    }

    // Extrato individualizado de cada conta. E o que fecha a base de calculo.
    const detalhes = []
    for (let i = 0; i < linhas.length; i++) {
      const link = page.locator('table tbody tr a').nth(i)
      if (!(await link.count())) continue
      log(`SISPAR: extrato da conta ${i + 1}/${linhas.length}`)
      await link.click().catch(() => {})
      await page.waitForTimeout(4000)

      // Cada extrato passa pela mesma barreira: um clique errado na arvore de
      // negociacoes cai na emissao de guia, e ali a automacao nao entra.
      try {
        await conferirPagina(page, { erroSe: [...ERROS_PORTAL, ...TELAS_PROIBIDAS] })
      } catch (e) {
        log(`SISPAR: conta ${i + 1} ignorada, ${e.message}`)
        await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
        await page.waitForTimeout(3000)
        continue
      }

      const detalhe = await lerGrade(page)
      detalhes.push(detalhe)

      const destino = path.join(dir, nomeArquivo(`Extrato Conta SISPAR ${i + 1}`, razao))
      await salvarPdf(ctx, page, destino)
      arquivos.push(destino)
      prov?.registrar('PGFN, SISPAR', `Extrato individualizado da conta ${i + 1}`, destino)

      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(3000)
    }

    return { arquivos, negociacoes: grade, detalhes }
  } finally {
    // Encerrar pelo "Sair" do sistema, e nao so fechando a aba.
    //
    // O sisparnet admite uma sessao por contribuinte e a mantem viva por cerca
    // de 20 minutos (o cabecalho mostra o tempo restante). Abandonar a aba
    // deixa a sessao pendurada, e toda tentativa seguinte recebe "voce nao tem
    // permissao de acesso" ate ela expirar sozinha. Foi o que travou os testes
    // de 07/08 depois da primeira execucao boa.
    try {
      const sair = page.locator('a:has-text("Sair"), td:has-text("Sair")').first()
      if (await sair.count()) {
        log('SISPAR: encerrando a sessao pelo menu Sair')
        await sair.click({ timeout: 10_000 }).catch(() => {})
        await page.waitForTimeout(4000)
      }
    } catch {
      // sessao ja pode ter caido
    }
    await page.close().catch(() => {})
    if (hub !== page) await hub.close().catch(() => {})
  }
}

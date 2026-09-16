/**
 * Extrator 1: Relatorio de Situacao Fiscal (RFB + PGFN).
 *
 * e-CAC > Certidoes e Situacao Fiscal > Consulta Pendencias - Situacao Fiscal
 * O servico mora fora do e-CAC classico, em servicos.receitafederal.gov.br, e
 * tem SSO proprio: cai numa tela "Entrar com GovBR" que reaproveita a sessao
 * gov.br ja aberta. hCaptcha invisivel na tela de login.
 *
 * Saida: o relatorio que o Fernando chama de "situacao fiscal", base do
 * capitulo 02 do diagnostico (pendencias, debitos SIEF, processos fiscais).
 *
 * SOMENTE LEITURA.
 */
import path from 'node:path'
import { log } from '../lib/browser.mjs'
import {
  salvarPdf,
  capturarDownload,
  evidencia,
  nomeArquivo,
  conferirPagina,
  ERROS_PORTAL,
} from '../lib/coleta.mjs'

export const URL_SITUACAO_FISCAL = 'https://servicos.receitafederal.gov.br/servico/pendencias/'

export async function extrairSituacaoFiscal(ctx, { dir, razao, prov }) {
  const page = await ctx.newPage()
  const arquivos = []

  try {
    log('Situacao fiscal: abrindo')
    await page.goto(URL_SITUACAO_FISCAL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // SSO proprio do servicos.receitafederal.gov.br.
    // O botao se chama "Entrar com GovBR", sem ponto entre gov e br, entao um
    // seletor por "gov.br" nao casa. Foi o que fez a coleta de 07/08 parar na
    // tela de autenticacao com a sessao do e-CAC ja valida.
    if (/\/login\//.test(page.url())) {
      log('Situacao fiscal: SSO, reaproveitando sessao gov.br')
      const botao = page
        .locator(
          'button:has-text("GovBR"), a:has-text("GovBR"), input[value*="GovBR" i], ' +
            'button:has-text("gov.br"), a:has-text("gov.br"), input[value*="Entrar" i]'
        )
        .first()
      if (!(await botao.count())) throw new Error('Botao de login GovBR nao encontrado na tela de SSO')
      await botao.click({ timeout: 20_000 })
      await page.waitForURL((u) => !/\/login\//.test(u.toString()), { timeout: 90_000 }).catch(() => {})
      await page.waitForTimeout(5000)
    }

    // O botao dispara validarHcaptcha(), e o hCaptcha as vezes apresenta desafio
    // visual (em 07/08 pediu "clique na flor em que a abelha nunca pousa").
    // Resolver captcha nao e coisa que esta automacao faz, entao a janela fica
    // aberta esperando a pessoa concluir, do mesmo modo que no login do e-CAC.
    // Em execucao desassistida, ESPERA_HUMANA_MS=0 faz a etapa falhar direto.
    const esperaHumana = Number(process.env.ESPERA_HUMANA_MS ?? 5 * 60 * 1000)
    if (/\/login\//.test(page.url()) && esperaHumana > 0) {
      log(`Situacao fiscal: hCaptcha pediu confirmacao. Resolva na janela do navegador, aguardo ate ${Math.round(esperaHumana / 60000)} min.`)
      const limite = Date.now() + esperaHumana
      while (Date.now() < limite && /\/login\//.test(page.url())) {
        await page.waitForTimeout(5000)
      }
      if (!/\/login\//.test(page.url())) {
        log('Situacao fiscal: autenticado, seguindo.')
        await page.waitForTimeout(4000)
      }
    }

    if (/\/login\//.test(page.url())) {
      await evidencia(page, dir, 'situacao-fiscal-bloqueado')
      throw new Error(`SSO nao passou, hCaptcha nao resolvido. URL: ${page.url()}`)
    }

    await page.waitForTimeout(4000)
    await conferirPagina(page, { erroSe: ERROS_PORTAL })
    await evidencia(page, dir, 'situacao-fiscal-tela')

    // O botao "Baixar relatorio" pode gerar download ou abrir uma view.
    const btnBaixar = page
      .locator('button:has-text("Baixar"), a:has-text("Baixar"), button:has-text("relatório"), a:has-text("relatório")')
      .first()

    const destino = path.join(dir, nomeArquivo('Situacao Fiscal', razao))

    if (await btnBaixar.count()) {
      log('Situacao fiscal: botao de download encontrado')
      try {
        await capturarDownload(page, () => btnBaixar.click(), destino)
      } catch {
        log('Situacao fiscal: sem evento de download, imprimindo a pagina')
        await page.waitForTimeout(4000)
        await salvarPdf(ctx, page, destino)
      }
    } else {
      log('Situacao fiscal: sem botao de download, imprimindo a pagina')
      await salvarPdf(ctx, page, destino)
    }

    arquivos.push(destino)
    prov?.registrar(
      'Receita Federal e PGFN',
      'Relatorio de Informacoes de Apoio para Emissao de Certidao',
      destino
    )
    return arquivos
  } finally {
    await page.close().catch(() => {})
  }
}

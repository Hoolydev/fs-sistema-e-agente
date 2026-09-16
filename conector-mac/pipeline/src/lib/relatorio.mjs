/**
 * Diagramacao do Diagnostico Fiscal Federal no padrao da FS.
 *
 * O modelo e o diagnostico da F. SPESSATTO de 20/07/2026, que e a versao
 * evoluida que o Fernando usa hoje: navy e dourado, sem emoji, capa com KPIs,
 * capitulos numerados de 01 a 08 e rodape listando cada fonte com o horario de
 * extracao.
 *
 * O HTML vira PDF pelo Chrome headless do proprio Playwright, que ja e
 * dependencia da coleta.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { nomeArquivo } from './coleta.mjs'

const NAVY = '#12233f'
const DOURADO = '#b08d47'

/**
 * Logo da FS embutida como data URI para o Chrome renderizar no PDF sem depender
 * de arquivo externo. Fica em pipeline/assets/logo-white.svg (versão branca, para
 * o cabeçalho navy). Se faltar, o cabeçalho cai no texto da marca — nunca quebra.
 */
const LOGO_FS = (() => {
  try {
    const p = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/logo-white.svg')
    const svg = fs.readFileSync(p)
    return `data:image/svg+xml;base64,${svg.toString('base64')}`
  } catch {
    return null
  }
})()

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Markdown minimo: paragrafos e negrito. */
function md(texto = '') {
  return esc(texto)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`)
    .join('')
}

function tabela(t) {
  const cabecalho = (t.colunas ?? []).map((c) => `<th>${esc(c)}</th>`).join('')
  const corpo = (t.linhas ?? [])
    .map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')
  const total = t.total
    ? `<tr class="total">${t.total.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`
    : ''
  return `
    ${t.titulo ? `<h4>${esc(t.titulo)}</h4>` : ''}
    <table><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}${total}</tbody></table>`
}

function capitulo(numero, titulo, conteudo) {
  return `
    <section class="capitulo">
      <h2><span class="num">${numero}</span>${esc(titulo)}</h2>
      ${conteudo}
    </section>`
}

export function montarHtml(d, dados) {
  const hoje = new Date().toLocaleDateString('pt-BR')

  const kpis = (d.kpisCapa ?? [])
    .map((k) => `<div class="kpi"><span class="rotulo">${esc(k.rotulo)}</span><span class="valor">${esc(k.valor)}</span></div>`)
    .join('')

  const destaques = (d.destaques ?? [])
    .map(
      (c) => `
      <div class="cartao">
        <div class="cartao-rotulo">${esc(c.rotulo)}</div>
        <div class="cartao-valor">${esc(c.valor)}</div>
        ${c.nota ? `<div class="cartao-nota">${esc(c.nota)}</div>` : ''}
      </div>`
    )
    .join('')

  const revelam = (d.oQueOsNumerosRevelam ?? [])
    .map((b) => `<div class="bloco"><div class="bloco-titulo">${esc(b.titulo)}</div>${md(b.texto)}</div>`)
    .join('')

  const riscos = (d.riscos ?? [])
    .map((r) => `<div class="bloco risco"><div class="bloco-titulo">${esc(r.titulo)}</div>${md(r.texto)}</div>`)
    .join('')

  const normas = (d.embasamento ?? [])
    .map((n) => `<div class="norma"><div class="norma-titulo">${esc(n.norma)}</div><div class="norma-texto">${esc(n.texto)}</div></div>`)
    .join('')

  const plano = (d.planoDeAcao ?? [])
    .map(
      (p) => `
      <tr>
        <td class="prazo">${esc(p.prazo)}</td>
        <td><strong>${esc(p.acao)}</strong>${p.detalhe ? `<br><span class="detalhe">${esc(p.detalhe)}</span>` : ''}</td>
      </tr>`
    )
    .join('')

  const pendentes = (d.pontosPendentes ?? []).map((p) => `<li>${esc(p)}</li>`).join('')

  // O horario so entra separado quando o detalhe ja nao o traz, pra nao sair
  // "emitido em 03/08/2026 10:24:02, extraido as 10:24".
  const fontes = (dados.fontes ?? [])
    .map((f) => {
      const detalheTemHora = /\d{2}:\d{2}/.test(f.detalhe ?? '')
      const hora = f.hora && !detalheTemHora ? `, extraído às ${esc(f.hora)}` : ''
      return `<li>${esc(f.fonte)}, ${esc(f.detalhe)}${hora}</li>`
    })
    .join('')

  const tabelasPassivo = (d.mapaDoPassivo?.tabelas ?? []).map(tabela).join('')

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(d.titulo ?? 'Diagnóstico Fiscal Federal')} ${esc(dados.razao ?? '')}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1a1a1a;
    font-size: 9.5pt;
    line-height: 1.55;
  }
  .capa { background: ${NAVY}; color: #fff; padding: 30px 42px 26px; }
  .marca-logo { height: 42px; width: auto; display: block; }
  .marca { font-size: 8pt; letter-spacing: 4px; text-transform: uppercase; color: ${DOURADO}; }
  .marca-sub { font-size: 7pt; letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,.55); margin-top: 3px; }
  .capa h1 { font-size: 19pt; margin: 20px 0 6px; font-weight: 600; letter-spacing: .5px; }
  .capa .empresa { font-size: 12pt; font-weight: 600; margin: 0 0 3px; }
  .capa .identificacao { font-size: 9pt; color: rgba(255,255,255,.7); margin: 0; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.18); }
  .kpi { min-width: 0; }
  .kpi .rotulo { display: block; font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(255,255,255,.55); }
  .kpi .valor { display: block; font-size: 11.5pt; font-weight: 600; margin-top: 3px; }

  main { padding: 24px 42px 30px; }

  .cartoes { display: flex; gap: 10px; margin: 0 0 20px; }
  .cartao { flex: 1; border: 1px solid #dcdcdc; border-top: 3px solid ${DOURADO}; padding: 10px 12px; }
  .cartao-rotulo { font-size: 6.8pt; letter-spacing: 1.2px; text-transform: uppercase; color: #6b7280; line-height: 1.35; min-height: 18px; }
  .cartao-valor { font-size: 12pt; font-weight: 600; color: ${NAVY}; margin: 5px 0 3px; }
  .cartao-nota { font-size: 7.5pt; color: #6b7280; line-height: 1.4; }

  /* Capitulo longo nao pode levar avoid: empurraria a pagina inteira em branco.
     Quem evita quebra feia sao os blocos, tabelas e normas, que sao curtos. */
  .capitulo { margin-bottom: 22px; }
  h2 { font-size: 11pt; color: ${NAVY}; margin: 0 0 12px; padding-bottom: 7px; border-bottom: 1px solid ${DOURADO}; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; page-break-after: avoid; }
  h2 .num { color: ${DOURADO}; margin-right: 10px; }
  h4 { font-size: 8pt; letter-spacing: 1.5px; text-transform: uppercase; color: #4b5563; margin: 16px 0 7px; font-weight: 600; }
  p { margin: 0 0 9px; text-align: justify; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 8.5pt; page-break-inside: avoid; }
  th { text-align: left; font-size: 7pt; letter-spacing: 1px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #d1d5db; padding: 6px 8px; font-weight: 600; }
  th:not(:first-child), td:not(:first-child) { text-align: right; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  tr.total td { font-weight: 600; border-top: 1px solid ${NAVY}; border-bottom: none; }

  .bloco { background: #f7f7f5; border-left: 3px solid ${NAVY}; padding: 11px 14px; margin-bottom: 10px; page-break-inside: avoid; }
  .bloco.risco { border-left-color: ${DOURADO}; }
  .bloco-titulo { font-weight: 600; font-size: 8.5pt; letter-spacing: 1px; text-transform: uppercase; color: ${NAVY}; margin-bottom: 6px; }
  .bloco p { margin: 0 0 6px; font-size: 8.8pt; }

  .norma { margin-bottom: 9px; page-break-inside: avoid; }
  .norma-titulo { font-weight: 600; color: ${NAVY}; font-size: 8.8pt; }
  .norma-texto { font-size: 8.5pt; color: #374151; text-align: justify; }

  .plano td { vertical-align: top; text-align: left !important; }
  .plano .prazo { width: 22%; color: ${DOURADO}; font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: .8px; }
  .plano .detalhe { color: #4b5563; font-size: 8.2pt; }

  .pendentes { background: #fbf8f1; border: 1px solid #ecdfc4; padding: 11px 14px 11px 30px; margin: 10px 0; }
  .pendentes li { font-size: 8.5pt; margin-bottom: 4px; }

  .conclusao { background: ${NAVY}; color: #fff; padding: 16px 20px; margin-top: 6px; }
  .conclusao p { color: rgba(255,255,255,.92); margin-bottom: 7px; }

  footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #d1d5db; font-size: 7.5pt; color: #6b7280; }
  footer .titulo { font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; color: ${NAVY}; font-weight: 600; margin-bottom: 5px; }
  footer ul { margin: 0 0 8px; padding-left: 14px; }
  footer li { margin-bottom: 2px; }
</style>
</head>
<body>

<div class="capa">
  ${LOGO_FS ? `<img class="marca-logo" src="${LOGO_FS}" alt="FS Soluções Tributárias">` : `<div class="marca">FS Soluções Tributárias</div>
  <div class="marca-sub">Consultoria e Planejamento Fiscal</div>`}
  <h1>${esc(d.titulo ?? 'DIAGNÓSTICO FISCAL FEDERAL')}</h1>
  <p class="empresa">${esc(dados.razao ?? '')}</p>
  <p class="identificacao">CNPJ ${esc(dados.cadastro?.cnpj ?? dados.cnpj ?? '')}${dados.cadastro?.municipio ? ` | ${esc(dados.cadastro.municipio)}, ${esc(dados.cadastro.uf ?? '')}` : ''}${dados.cadastro?.cnae ? ` | CNAE ${esc(dados.cadastro.cnae)}` : ''}</p>
  <div class="kpis">${kpis}</div>
</div>

<main>
  ${destaques ? `<div class="cartoes">${destaques}</div>` : ''}

  ${capitulo('01', 'Diagnóstico executivo', md(d.diagnosticoExecutivo))}
  ${capitulo('02', 'Mapa do passivo', md(d.mapaDoPassivo?.texto) + tabelasPassivo)}
  ${revelam ? capitulo('03', 'O que os números revelam', revelam) : ''}
  ${riscos ? capitulo('04', 'Riscos ativos', riscos + (d.custoDaInercia ? `<h4>Custo da inércia</h4>${md(d.custoDaInercia)}` : '')) : ''}
  ${normas ? capitulo('05', 'Embasamento jurídico', (d.solucao ? md(d.solucao) : '') + normas) : ''}
  ${plano ? capitulo('06', 'Plano de ação', `<table class="plano"><tbody>${plano}</tbody></table>${pendentes ? `<h4>Pontos de apuração pendentes</h4><ul class="pendentes">${pendentes}</ul>` : ''}`) : ''}
  ${d.conclusao ? capitulo('07', 'Conclusão', `<div class="conclusao">${md(d.conclusao)}</div>`) : ''}

  <footer>
    <div class="titulo">Fontes oficiais desta análise</div>
    ${fontes ? `<ul>${fontes}</ul>` : '<p>Proveniência não registrada nesta coleta.</p>'}
    <p>FS SOLUÇÕES TRIBUTÁRIAS LTDA · Goiânia, GO · Atuação nacional · Documento emitido em ${hoje}</p>
  </footer>
</main>
</body>
</html>`
}

export async function gerarPdfDiagnostico(diagnostico, dados, pasta) {
  const html = montarHtml(diagnostico, dados)
  const arquivoHtml = path.join(pasta, 'dossie', 'diagnostico.html')
  fs.writeFileSync(arquivoHtml, html)

  const destino = path.join(pasta, nomeArquivo('Diagnostico Fiscal Federal', dados.razao ?? 'Contribuinte'))

  const navegador = await chromium.launch({ channel: 'chrome' })
  try {
    const page = await navegador.newPage()
    await page.goto(`file://${arquivoHtml}`, { waitUntil: 'load' })
    await page.pdf({
      path: destino,
      format: 'A4',
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    })
  } finally {
    await navegador.close()
  }
  return destino
}

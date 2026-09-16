/**
 * Leitura por regra fixa dos relatorios oficiais.
 *
 * Tudo que e numero sai daqui, nao do agente. O modelo le contexto e escreve
 * analise juridica; base de calculo e prazo saem de parser testado contra o
 * documento real. Um valor errado num diagnostico que embasa honorario de
 * exito nao e um erro de redacao.
 *
 * O relatorio de situacao fiscal tem doze secoes, e nenhuma delas repete o
 * layout da outra. Por isso o texto e fatiado por titulo antes de qualquer
 * regex: assim uma linha do SIDA nunca e lida com o formato do SIEF.
 *
 * Testado contra:
 *   Situacao Fiscal GABB ... 03-08-2026.pdf        (9 paginas, 12 secoes)
 *   Regularize_Relatorio_Divida_Ativa_31072026.pdf (referencia, 3 inscricoes)
 */

/** "1.234,56" -> 1234.56 */
export function valor(txt) {
  if (txt == null) return null
  const limpo = String(txt).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/** "23/06/2024" -> Date (meio-dia UTC, pra nao escorregar de dia por fuso) */
export function data(txt) {
  const m = String(txt ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12))
}

/** Primeiro grupo que casou, ignorando alternativas vazias do regex. */
function achar(texto, re) {
  const m = String(texto ?? '').match(re)
  if (!m) return null
  const grupo = m.slice(1).find((g) => g != null && String(g).trim() !== '')
  return grupo == null ? null : String(grupo).trim()
}

/** Cabecalho e rodape que se repetem a cada pagina e poluem o parse. */
const RUIDO = [
  /^MINIST[ÉE]RIO DA FAZENDA/i,
  /^SECRETARIA ESPECIAL DA RECEITA FEDERAL/i,
  /^PROCURADORIA-GERAL DA FAZENDA NACIONAL/i,
  /^INFORMA[ÇC][ÕO]ES DE APOIO PARA EMISS[ÃA]O DE CERTID[ÃA]O/i,
  /^P[áa]gina:\s*\d+/i,
  /^--\s*\d+\s+of\s+\d+\s*--$/i,
  /^CNPJ:\s*[\d.]+\s*-\s*/i,
  /^CNPJ do certificado:/i,
  /^_{5,}$/,
]

/**
 * Uma linha de registro pode vir partida em duas pelo extrator de texto,
 * sempre no mesmo padrao: o inicio do registro fica sozinho e o resto desce.
 *
 *   "3373-01 - IRPJ 4º"                    +  "TRIM/2025 30/01/2026 31.182,70 ..."
 *   "00.4.25.281503-62 4156-CONTR."        +  "EMPREGADOR 13/11/2025 ..."
 *
 * Sem juntar, o parser do SIEF perdia os oito debitos trimestrais de IRPJ e
 * CSLL da GABB, cerca de R$ 148 mil fora da base de calculo.
 */
const INICIO_REGISTRO = /^(?:\d{4}-\d{2}\s*-|\d{2}\.\d\.\d{2}\.\d{6}-\d{2})/

export function normalizar(texto = '') {
  const linhas = []
  for (const bruta of String(texto).split('\n')) {
    const linha = bruta.replace(/\s+/g, ' ').trim()
    if (!linha) continue
    if (RUIDO.some((re) => re.test(linha))) continue

    const anterior = linhas[linhas.length - 1]
    if (anterior && INICIO_REGISTRO.test(anterior) && !/\d{2}\/\d{2}\/\d{4}/.test(anterior)) {
      linhas[linhas.length - 1] = `${anterior} ${linha}`
      continue
    }
    linhas.push(linha)
  }
  return linhas
}

/**
 * Fatia o relatorio pelos titulos de secao, que no PDF vem seguidos de uma
 * regua de underscores.
 */
export function secoes(texto = '') {
  const linhas = normalizar(texto)
  const blocos = []
  let atual = { titulo: 'cabecalho', linhas: [] }
  for (const linha of linhas) {
    const m = linha.match(/^(.+?)\s*_{5,}\s*$/)
    if (m && m[1].trim().length > 3) {
      blocos.push(atual)
      atual = { titulo: m[1].trim(), linhas: [] }
      continue
    }
    atual.linhas.push(linha)
  }
  blocos.push(atual)
  return blocos
}

function secao(blocos, re) {
  return blocos.find((b) => re.test(b.titulo))?.linhas ?? []
}

/** Dados cadastrais da matriz. */
export function cadastro(texto = '') {
  return {
    cnpj: achar(texto, /CNPJ:\s*([\d.]+\/[\d-]+)/),
    razao: achar(texto, /CNPJ:\s*[\d.]+\s*-\s*(.+?)\s*$/m),
    unidade: achar(texto, /UA de Domic[ií]lio:\s*(.+?)(?:\s+C[óo]digo da UA|\s*$)/m),
    municipio: achar(texto, /Munic[ií]pio:\s*([A-ZÀ-Ú\s]+?)\s+UF:/),
    uf: achar(texto, /UF:\s*([A-Z]{2})/),
    responsavel: achar(texto, /Respons[áa]vel:\s*(.+)/),
    situacao: achar(texto, /Situa[çc][ãa]o:\s*(\w+)/),
    naturezaJuridica: achar(texto, /Natureza Jur[ií]dica:\s*(.+?)(?:\s+Data de Abertura|$)/m),
    abertura: achar(texto, /Data de Abertura:\s*(\d{2}\/\d{2}\/\d{4})/),
    cnae: achar(texto, /CNAE:\s*(.+)/),
    porte: achar(texto, /Porte da Empresa:\s*(.+)/),
  }
}

/**
 * Certidao mais recente e ha quantos dias a empresa esta sem certidao valida.
 * O "1.924 dias sem certidao" que abre o capitulo 03 do diagnostico sai daqui.
 */
export function certidao(texto = '', hoje = new Date()) {
  const linha = String(texto).match(
    /Certid[ãa]o\s+(Positiva com Efeitos de Negativa|Negativa|Positiva)[^\n:]*:\s*([A-Z0-9.]+)\s*Emiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4})\s*Data de Validade:\s*(\d{2}\/\d{2}\/\d{4})/i
  )
  if (!linha) {
    return { situacao: null, numero: null, emissao: null, validade: null, diasSemCertidao: null }
  }
  const validade = data(linha[4])
  const vencida = validade ? validade < hoje : null
  return {
    situacao: vencida ? 'vencida' : 'valida',
    tipo: linha[1],
    numero: linha[2],
    emissao: linha[3],
    validade: linha[4],
    diasSemCertidao: vencida ? Math.floor((hoje - validade) / 86_400_000) : 0,
  }
}

/** Debitos exigiveis no SIEF: nove colunas, com multa e juros discriminados. */
function lerSiefExigivel(linhas) {
  const re =
    /^(\d{4}-\d{2})\s*-\s*(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([A-ZÀ-Ú -]+)$/
  const itens = []
  for (const linha of linhas) {
    const m = linha.match(re)
    if (!m) continue
    const cabeca = m[2].trim()
    const corte = cabeca.search(/\s(?:\d{2}\/\d{4}|\d[ºo°]\s*TRIM\/\d{4}|\d{4})$/)
    itens.push({
      codigo: m[1],
      tributo: (corte > 0 ? cabeca.slice(0, corte) : cabeca).trim(),
      periodo: (corte > 0 ? cabeca.slice(corte) : '').trim() || null,
      vencimento: m[3],
      valorOriginal: valor(m[4]),
      saldoDevedor: valor(m[5]),
      multa: valor(m[6]),
      juros: valor(m[7]),
      saldoConsolidado: valor(m[8]),
      situacao: m[9].trim(),
    })
  }
  return itens
}

/** Debitos com exigibilidade suspensa no SIEF: seis colunas, sem acessorios. */
function lerSiefSuspenso(linhas) {
  const re =
    /^(\d{4}-\d{2})\s*-\s*(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([A-ZÀ-Ú -]+)$/
  const itens = []
  for (const linha of linhas) {
    const m = linha.match(re)
    if (!m) continue
    const cabeca = m[2].trim()
    const corte = cabeca.search(/\s(?:\d{2}\/\d{4}|\d[ºo°]\s*TRIM\/\d{4}|\d{4})$/)
    itens.push({
      codigo: m[1],
      tributo: (corte > 0 ? cabeca.slice(0, corte) : cabeca).trim(),
      periodo: (corte > 0 ? cabeca.slice(corte) : '').trim() || null,
      vencimento: m[3],
      valorOriginal: valor(m[4]),
      saldoDevedor: valor(m[5]),
      situacao: m[6].trim(),
    })
  }
  return itens
}

/** Inscricoes em divida ativa listadas no proprio relatorio (SIDA). */
function lerSida(linhas) {
  const itens = []
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(
      /^(\d{2}\.\d\.\d{2}\.\d{6}-\d{2})\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s*(\d{2}\/\d{2}\/\d{4})?\s*([\d.]+\/[\d-]+)?\s*(.*)$/
    )
    if (!m) continue
    const proxima = linhas[i + 1] ?? ''
    itens.push({
      inscricao: m[1],
      receita: m[2].trim(),
      inscritoEm: m[3],
      ajuizadoEm: m[4] ?? null,
      processo: m[5] ?? null,
      tipoDevedor: (m[6] ?? '').trim() || null,
      situacao: achar(proxima, /^Situa[çc][ãa]o:\s*(.+)$/) ?? null,
    })
  }
  return itens
}

/** Contas do SISPAR: numero, instrumento e modalidade na linha seguinte. */
function lerSispar(linhas) {
  const itens = []
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(/^(\d{6,12})\s+(.+)$/)
    if (!m) continue
    itens.push({
      conta: m[1],
      instrumento: m[2].trim(),
      modalidade: achar(linhas[i + 1] ?? '', /^Modalidade:\s*(.+)$/),
    })
  }
  return itens
}

/** Parcelamentos do SIEFPAR, com parcelas em atraso ou valor suspenso. */
function lerSiefpar(linhas) {
  const itens = []
  for (const linha of linhas) {
    const numero = achar(linha, /Parcelamento:\s*([\d.\-/]+)/)
    if (!numero) continue
    itens.push({
      parcelamento: numero,
      parcelasEmAtraso: Number(achar(linha, /Parcelas em Atraso:\s*(\d+)/) ?? 0) || null,
      valorEmAtraso: valor(achar(linha, /Valor em Atraso:\s*([\d.,]+)/)),
      valorSuspenso: valor(achar(linha, /Valor Suspenso:\s*([\d.,]+)/)),
      situacao: achar(linha, /Situa[çc][ãa]o:\s*(.+)$/),
    })
  }
  return itens
}

/**
 * Leitura completa do relatorio de situacao fiscal.
 * E a fonte mais rica da coleta: sozinha ja entrega cadastro, certidao,
 * debitos exigiveis, debitos suspensos, inscricoes em divida ativa e a
 * relacao de contas de negociacao.
 */
export function relatorioSituacaoFiscal(texto = '', hoje = new Date()) {
  const blocos = secoes(texto)
  const siefExigivel = lerSiefExigivel(secao(blocos, /Pend[êe]ncia\s*-\s*D[ée]bito \(SIEF\)/i))
  const siefSuspenso = lerSiefSuspenso(secao(blocos, /D[ée]bito com Exigibilidade Suspensa \(SIEF\)/i))

  return {
    cadastro: cadastro(texto),
    certidao: certidao(texto, hoje),
    sief: { exigivel: siefExigivel, suspenso: siefSuspenso, resumo: resumoSief(siefExigivel) },
    siefpar: {
      pendentes: lerSiefpar(secao(blocos, /Pend[êe]ncia\s*[–-]\s*Parcelamento \(SIEFPAR\)/i)),
      suspensos: lerSiefpar(secao(blocos, /Parcelamento com Exigibilidade Suspensa \(SIEFPAR\)/i)),
    },
    sida: {
      pendentes: lerSida(secao(blocos, /Pend[êe]ncia\s*-\s*Inscri[çc][ãa]o \(SIDA\)/i)),
      suspensas: lerSida(secao(blocos, /Inscri[çc][ãa]o com Exigibilidade Suspensa \(SIDA\)/i)),
    },
    sispar: {
      pendentes: lerSispar(secao(blocos, /Pend[êe]ncia\s*-\s*Parcelamento \(SISPAR\)/i)),
      suspensos: lerSispar(secao(blocos, /Parcelamento com Exigibilidade Suspensa \(SISPAR\)/i)),
    },
    secoes: blocos.map((b) => b.titulo).filter((t) => t !== 'cabecalho'),
  }
}

/** Somatorios do SIEF exigivel, com a participacao de acessorios no saldo. */
export function resumoSief(itens = []) {
  const soma = (campo) => itens.reduce((t, i) => t + (i[campo] ?? 0), 0)
  const consolidado = soma('saldoConsolidado')
  const multa = soma('multa')
  const juros = soma('juros')
  return {
    quantidade: itens.length,
    principal: soma('saldoDevedor'),
    multa,
    juros,
    consolidado,
    acessorios: multa + juros,
    percentualAcessorios: consolidado ? (multa + juros) / consolidado : null,
    porTributo: Object.entries(
      itens.reduce((acc, i) => {
        acc[i.tributo] = (acc[i.tributo] ?? 0) + (i.saldoConsolidado ?? 0)
        return acc
      }, {})
    )
      .map(([tributo, total]) => ({ tributo, total }))
      .sort((a, b) => b.total - a.total),
  }
}

/** Compatibilidade com o extrator do SISPAR, que so precisa da lista de contas. */
export function contasSispar(texto = '') {
  const r = relatorioSituacaoFiscal(texto)
  return [...r.sispar.pendentes, ...r.sispar.suspensos]
}

/** Compatibilidade: lista plana dos debitos exigiveis no SIEF. */
export function pendenciasSief(texto = '') {
  return relatorioSituacaoFiscal(texto).sief.exigivel
}

/**
 * Relatorio Consolidado da Divida do Regularize.
 * Traz os totais do resumo e os blocos por natureza.
 */
export function totaisDividaAtiva(texto = '') {
  const t = String(texto)
  const quantidade = Number(
    achar(t, /Quantidade de inscri[çc][õo]es selecionadas\*?:\s*(\d+)/) ??
      achar(t, /Total de inscri[çc][õo]es ativas:\s*(\d+)/) ??
      0
  )
  const total =
    valor(achar(t, /Valor das inscri[çc][õo]es selecionadas\*?:\s*R?\$?\s*([\d.,]+)/)) ??
    valor(achar(t, /Valor total da d[ií]vida\*?:\s*R?\$?\s*([\d.,]+)/))

  const naturezas = [...t.matchAll(/^([A-Za-zÀ-ú][A-Za-zÀ-ú \/]+?)\s*\((\d+)\)\s*$/gm)]
    .map((m) => ({ natureza: m[1].trim(), inscricoes: Number(m[2]) }))
    .filter((n) => !/^(Negociada|Ativa|Garantida|Suspensa|Extinta)/i.test(n.natureza))

  const inscricoes = [...t.matchAll(/^(\d[\d\s]{10,}[\d-]+)\s*$/gm)].map((m) => m[1].trim())

  return {
    quantidade: quantidade || null,
    valorTotal: total,
    naturezas,
    inscricoes,
    vazio: !quantidade && !total,
  }
}

/**
 * Consulta de Capacidade de Pagamento do SISPAR.
 *
 * E o dado que decide a tese do diagnostico: sob classificacao A ou B a
 * metodologia da PGFN nao reconhece necessidade de concessao, entao nao ha
 * desconto a obter e a transacao convencional so alonga prazo.
 */
export function capacidadePagamento(texto = '') {
  const t = String(texto)
  const classificacao = achar(t, /Classifica[çc][ãa]o para transa[çc][ãa]o\s*:?\s*([A-D])\b/i)
  const capacidade = valor(achar(t, /Capacidade de pagamento em (?:em )?60 meses:\s*R\$\s*([\d.,]+)/i))
  const dividaPgfn = valor(achar(t, /Valor da d[ií]vida na PGFN:\s*R\$\s*([\d.,]+)/i))
  const dividaRfb = valor(achar(t, /Valor da d[ií]vida na RFB:\s*R\$\s*([\d.,]+)/i))
  const total = valor(achar(t, /Valor total da d[ií]vida na PGFN e RFB:\s*R\$\s*([\d.,]+)/i))

  return {
    classificacao,
    capacidade60Meses: capacidade,
    dividaPgfn,
    dividaRfb,
    total,
    atualizadaEm: achar(t, /Data de atualiza[çc][ãa]o da capacidade de pagamento:\s*([\d/]+ [\d:]+)/i),
    consultadaEm: achar(t, /Consulta realizada em\s*([\d/]+)\s*[àa]s\s*([\d:]+)/i),
    // Quantas vezes a capacidade apurada cobre a divida. Acima de 1 significa
    // que a PGFN entende que o contribuinte pode quitar integralmente.
    coberturaDaDivida: capacidade && total ? capacidade / total : null,
    semDesconto: classificacao ? ['A', 'B'].includes(classificacao.toUpperCase()) : null,
  }
}

/**
 * Data e hora de extracao declaradas pelo proprio documento.
 *
 * Serve de fallback quando a coleta nao gravou proveniencia: em vez de o
 * diagnostico sair com "proveniencia nao registrada" no rodape, o horario vem
 * do cabecalho do documento oficial, que e fonte melhor que o log da coleta.
 *
 *   Situacao fiscal:  "03/08/2026 10:24:02"
 *   Regularize:       "Dados obtidos em 31/07/2026 as 14:55"
 *   SISPAR:           "Acesso em: 03/08/2026 10:25:06"
 */
export function extracaoDeclarada(texto = '') {
  const t = String(texto)
  const padroes = [
    /Dados obtidos em\s*(\d{2}\/\d{2}\/\d{4})\s*[àa]s\s*(\d{2}:\d{2}(?::\d{2})?)/i,
    /Acesso em:\s*(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}(?::\d{2})?)/i,
    /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/,
  ]
  for (const re of padroes) {
    const m = t.match(re)
    if (m) return { data: m[1], hora: m[2].slice(0, 5), completo: `${m[1]} ${m[2]}` }
  }
  return null
}

/**
 * Prazos abertos nos comunicados e intimacoes.
 * "NAO REALIZADA" com data final futura e o que vira item de acao com data no
 * plano do diagnostico.
 */
/**
 * Prazos a partir do CSV de comunicados e intimacoes, que e a fonte boa.
 *
 * O PDF da mesma tela sai paginado e truncado ("24/04/20...", "11000.74..."),
 * e prazo de defesa truncado nao serve pra nada. O CSV traz as 23 linhas com
 * data, prazo e situacao da manifestacao inteiros.
 */
export function prazosDoCsv(registros = [], hoje = new Date()) {
  const campo = (r, ...nomes) => {
    for (const n of nomes) {
      const chave = Object.keys(r).find((k) => k.toLowerCase().includes(n.toLowerCase()))
      if (chave && r[chave]) return r[chave]
    }
    return null
  }

  return registros.map((r) => {
    const final = data(campo(r, 'Data Final'))
    const situacao = campo(r, 'Situação da Manifestação', 'Situacao') ?? ''
    const pendente = /N[ÃA]O REALIZADA/i.test(situacao)
    return {
      processo: campo(r, 'Número do Processo', 'Numero do Processo'),
      tipo: campo(r, 'Tipo da Correspond'),
      natureza: campo(r, 'Natureza'),
      postagem: campo(r, 'Data/Hora da Postagem', 'Postagem'),
      ciencia: campo(r, 'Data da Ci'),
      prazo: campo(r, 'Prazo para Manifesta'),
      dataFinal: campo(r, 'Data Final'),
      situacao,
      emAberto: pendente && final ? final >= hoje : false,
      vencido: pendente && final ? final < hoje : false,
      diasRestantes: final ? Math.ceil((final - hoje) / 86_400_000) : null,
    }
  })
}

export function prazosAbertos(texto = '', hoje = new Date()) {
  const itens = []
  for (const linha of normalizar(texto)) {
    if (!/intima|comunica/i.test(linha)) continue
    const datas = [...linha.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map((m) => m[1])
    if (!datas.length) continue
    const final = data(datas[datas.length - 1])
    const naoRealizada = /N[ÃA]O REALIZADA/i.test(linha)
    itens.push({
      processo: achar(linha, /(\d{5}\.\d{2,6}[\d./-]*)/),
      prazoDias: Number(achar(linha, /(\d+)\s*Dias/i) ?? 0) || null,
      dataFinal: datas[datas.length - 1] ?? null,
      emAberto: naoRealizada && final ? final >= hoje : false,
      vencido: naoRealizada && final ? final < hoje : false,
      diasRestantes: final ? Math.ceil((final - hoje) / 86_400_000) : null,
    })
  }
  return itens
}

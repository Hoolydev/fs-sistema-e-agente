/**
 * Leitura da pasta de coleta e extracao de texto dos PDFs.
 *
 * Usamos pdf-parse em vez do pdftotext do sistema pra nao depender de binario
 * externo: a mesma pasta tem que rodar no Mac daqui e na maquina do Fernando.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * Lista os PDFs da coleta e a proveniencia, se existir.
 *
 * O diagnostico gerado mora na mesma pasta e precisa ficar de fora: numa
 * segunda analise ele entrava como fonte e o documento virava fonte de si
 * mesmo, aparecendo no proprio rodape de fontes oficiais.
 */
export function lerPasta(pasta) {
  const tudo = fs.readdirSync(pasta)
  const arquivos = tudo
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .filter((f) => !/^Diagnostico Fiscal Federal/i.test(f))
    .sort()
    .map((f) => path.join(pasta, f))

  let proveniencia = null
  const prov = path.join(pasta, 'proveniencia.json')
  if (fs.existsSync(prov)) {
    try {
      proveniencia = JSON.parse(fs.readFileSync(prov, 'utf8'))
    } catch {
      proveniencia = null
    }
  }
  return { arquivos, proveniencia }
}

/** Texto e numero de paginas de um PDF. */
export async function extrairTextoPdf(arquivo) {
  const { PDFParse } = require('pdf-parse')
  const buffer = fs.readFileSync(arquivo)
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const r = await parser.getText()
    return { texto: r.text ?? '', paginas: r.total ?? r.pages?.length ?? 0 }
  } finally {
    await parser.destroy?.()
  }
}

/**
 * CSV do e-Processo, ja em objetos.
 *
 * Vale mais que o PDF da mesma tela: o PDF sai paginado em dez linhas e com as
 * colunas truncadas em reticencias, enquanto o CSV traz a base inteira. E dele
 * que saem os prazos de manifestacao.
 */
export function lerCsv(arquivo) {
  const bruto = fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '')
  const linhas = bruto.split(/\r?\n/).filter((l) => l.trim())
  if (linhas.length < 2) return { colunas: [], registros: [] }

  const partir = (linha) => {
    const campos = []
    let atual = ''
    let entreAspas = false
    for (const c of linha) {
      if (c === '"') entreAspas = !entreAspas
      else if (c === ',' && !entreAspas) {
        campos.push(atual.trim())
        atual = ''
      } else atual += c
    }
    campos.push(atual.trim())
    return campos
  }

  const colunas = partir(linhas[0])
  const registros = linhas.slice(1).map((l) => {
    const campos = partir(l)
    return Object.fromEntries(colunas.map((c, i) => [c, campos[i] ?? '']))
  })
  return { colunas, registros }
}

/** Lista os CSVs da coleta. */
export function csvsDaPasta(pasta) {
  return fs
    .readdirSync(pasta)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .sort()
    .map((f) => path.join(pasta, f))
}

/**
 * Marca PDFs que sao tela de erro em vez de documento.
 * A coleta ja barra isso em tela, mas quem analisa uma pasta antiga precisa
 * saber que aquele arquivo nao vale como fonte.
 */
export function pareceTelaDeErro(texto = '') {
  return /n.o tem permiss.o de acesso|sistema indispon.vel|acesso negado|EMISS.O DE DOCUMENTO DE ARRECADA/i.test(
    texto
  )
}

/**
 * Conferencia dos valores citados no diagnostico contra os numeros do parser.
 *
 * Modulo proprio porque e a trava de qualidade da entrega e precisa ser
 * testavel isoladamente, sem disparar o pipeline.
 */

/**
 * Confere o que o agente escreveu contra os numeros do parser.
 *
 * Um diagnostico que embasa honorario por exito nao pode sair com valor que
 * nao existe na fonte. Todo valor em reais citado no texto tem que ser:
 *
 *   a) um numero que esta no dossie, ou
 *   b) uma conta declarada pelo agente em `derivacoes`, cujas parcelas estao
 *      no dossie e cuja soma bate com o valor citado.
 *
 * A primeira versao so aceitava (a) e acusava dezesseis falsos positivos na
 * GABB, todos somas corretas: o total das quatro secoes, o encargo de 20% do
 * DL 1.025/1969, a soma das parcelas em atraso. Exigir a conta declarada
 * resolve sem afrouxar: some com fonte, ou nao cite.
 */
export function conferirValores(diagnostico, dados, { tolerancia = 0.02 } = {}) {
  const conhecidos = new Set()
  const varrer = (o) => {
    if (o == null) return
    if (typeof o === 'number') {
      if (Number.isFinite(o)) conhecidos.add(o.toFixed(2))
      return
    }
    if (Array.isArray(o)) return o.forEach(varrer)
    if (typeof o === 'object') return Object.values(o).forEach(varrer)
  }
  varrer(dados)

  // Os valores do dossie antes de qualquer promocao. Serve pra distinguir, no
  // fim, o que veio direto da fonte do que passou por uma conta declarada.
  const daFonte = new Set(conhecidos)

  /**
   * Aceita tanto numero JS quanto texto pt-BR.
   *
   * Passar 100.5 pelo parser de texto devolvia 1005, porque a limpeza de
   * separador de milhar come o ponto decimal. Era o que fazia toda conferencia
   * por percentual falhar.
   */
  const paraNumero = (x) => {
    if (typeof x === 'number') return x
    if (x == null) return NaN
    return Number(String(x).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'))
  }
  const num = paraNumero

  /**
   * Derivacoes se apoiam umas nas outras: o total geral soma subtotais que, por
   * sua vez, somam parcelas do dossie. Por isso a conferencia roda em rodadas,
   * promovendo a conhecido tudo que fechou, ate parar de aparecer novidade.
   */
  const derivadas = new Map()
  const pendentes = (diagnostico.derivacoes ?? []).map((d) => ({
    ...d,
    valorNum: typeof d.valor === 'number' ? d.valor : num(d.valor),
    parcelasNum: (d.parcelas ?? []).map((p) => (typeof p === 'number' ? p : num(p))),
  }))

  let mudou = true
  while (mudou) {
    mudou = false
    for (const d of pendentes) {
      if (!Number.isFinite(d.valorNum)) continue
      const chave = d.valorNum.toFixed(2)
      if (derivadas.get(chave)?.confere) continue

      const soma = d.parcelasNum.reduce((t, p) => t + (Number.isFinite(p) ? p : 0), 0)
      const parcelasComLastro = d.parcelasNum.every((p) => conhecidos.has(p.toFixed(2)))
      const fecha = d.parcelasNum.length > 0 && Math.abs(soma - d.valorNum) <= tolerancia

      const base = d.percentualDe == null ? null : num(d.percentualDe)
      const percentual =
        base != null && d.percentual != null && conhecidos.has(base.toFixed(2))
          ? Math.abs((base * Number(d.percentual)) / 100 - d.valorNum) <= Math.max(tolerancia, 0.5)
          : false

      const confere = (fecha && parcelasComLastro) || percentual
      derivadas.set(chave, {
        ...d,
        confere,
        motivo: percentual
          ? 'percentual conferido'
          : base != null
            ? 'a base do percentual nao esta no dossie'
            : !d.parcelasNum.length
              ? 'sem parcelas declaradas'
              : !parcelasComLastro
                ? 'alguma parcela nao esta no dossie'
                : !fecha
                  ? `parcelas somam ${soma.toFixed(2)}`
                  : 'soma conferida',
      })

      if (confere && !conhecidos.has(chave)) {
        conhecidos.add(chave)
        mudou = true
      }
    }
  }

  const texto = JSON.stringify({ ...diagnostico, derivacoes: undefined })
  const citados = [...texto.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map((m) => m[1])

  const suspeitos = []
  let derivacoesOk = 0
  for (const bruto of [...new Set(citados)]) {
    const n = num(bruto)
    if (!Number.isFinite(n)) continue
    const chave = n.toFixed(2)

    // Ordem importa: a derivacao conferida foi promovida a conhecida durante as
    // rodadas, entao ela precisa ser creditada como conta antes do teste de
    // presenca na fonte, senao nunca apareceria no contador.
    const derivada = derivadas.get(chave)
    if (derivada?.confere) {
      derivacoesOk++
      continue
    }
    if (daFonte.has(chave)) continue
    suspeitos.push({
      valor: bruto,
      motivo: derivada ? derivada.motivo : 'nao esta no dossie e nao foi declarado como conta',
    })
  }

  return { citados: citados.length, derivacoesOk, suspeitos }
}

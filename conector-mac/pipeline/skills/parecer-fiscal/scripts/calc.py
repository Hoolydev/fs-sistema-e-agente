#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
calc.py — motor de cálculo do parecer/diagnóstico fiscal.

Uso:
    python3 scripts/calc.py dados.json --out blocos.html

Lê um JSON com as inscrições e os parâmetros do caso, devolve no terminal os
números-chave já formatados em pt-BR e grava um arquivo HTML com os blocos
prontos (tabelas e SVGs) para colar no template.

A aritmética fica aqui de propósito: valor de parecer é número conferível, e
conta feita à mão em texto corrido é onde o erro aparece.

Schema mínimo do JSON de entrada:

{
  "inscricoes": [
    {"num":"31 6 24 002015-02","data":"09/04/2024","tributo":"COFINS",
     "natureza":"Tributária","principal":3904390.51,"acessorios":4210933.03}
  ],
  "multa": 2199591.98,            // opcional: abre M/J/Encargo no quadro 2
  "juros": 6139191.42,
  "encargo": 3867349.03,
  "rfb": 424850.20,
  "capag": 43695645.13,
  "rating": "B",
  "receita_bruta_anual": 77825418.73,
  "entrada_pct": 0.06,
  "parcelas_entrada": 12,         // 6 no regime geral, 12 no regime especial
  "parcelas_saldo": 133,          // 114 no regime geral, 133 no especial
  "teto_desconto": 0.65,
  "parcelamento_convencional_meses": 60
}
"""

import json
import sys
import argparse
from collections import OrderedDict


# ---------------------------------------------------------------- formatação
def fmt(v, casas=2):
    s = f"{v:,.{casas}f}"
    return s.replace(",", "@").replace(".", ",").replace("@", ".")


def pct(v, casas=2):
    return fmt(v * 100, casas) + "%"


# ---------------------------------------------------------------- cálculo
def simular(d):
    ins = d["inscricoes"]
    teto = d.get("teto_desconto", 0.65)

    for i in ins:
        i["total"] = i["principal"] + i["acessorios"]
        desc = min(i["acessorios"], i["total"] * teto)
        i["desconto"] = desc
        i["final"] = i["total"] - desc
        i["pct"] = desc / i["total"] if i["total"] else 0
        i["teto_atingido"] = abs(desc - i["total"] * teto) < 0.01

    r = OrderedDict()
    r["passivo"] = sum(i["total"] for i in ins)
    r["principal"] = sum(i["principal"] for i in ins)
    r["descontavel"] = sum(i["acessorios"] for i in ins)
    r["economia"] = sum(i["desconto"] for i in ins)
    r["a_pagar"] = sum(i["final"] for i in ins)
    r["desc_pct"] = r["economia"] / r["passivo"] if r["passivo"] else 0
    r["n_inscricoes"] = len(ins)

    r["rfb"] = d.get("rfb", 0.0)
    r["federal_total"] = r["passivo"] + r["rfb"]
    capag = d.get("capag")
    if capag:
        r["capag"] = capag
        r["cobertura"] = capag / r["federal_total"]

    # desembolso
    ent_pct = d.get("entrada_pct", 0.06)
    n_ent = d.get("parcelas_entrada", 12)
    n_sal = d.get("parcelas_saldo", 133)
    r["entrada_total"] = r["passivo"] * ent_pct
    r["entrada_mes"] = r["entrada_total"] / n_ent
    r["saldo"] = r["a_pagar"] - r["entrada_total"]
    r["saldo_mes"] = r["saldo"] / n_sal
    r["n_entrada"] = n_ent
    r["n_parcelas"] = n_sal
    r["ent_pct"] = ent_pct

    conv = d.get("parcelamento_convencional_meses", 60)
    r["parc_conv"] = r["passivo"] / conv
    r["conv_meses"] = conv
    r["alivio_entrada"] = 1 - r["entrada_mes"] / r["parc_conv"]
    r["alivio_saldo"] = 1 - r["saldo_mes"] / r["parc_conv"]

    # penhora de faturamento
    rb = d.get("receita_bruta_anual")
    if rb:
        r["receita_bruta"] = rb
        r["fat_mes"] = rb / 12
    return r


# ---------------------------------------------------------------- SVG
def donut_score(p):
    """Rosca única com o percentual de desconto no centro."""
    circ = 2 * 3.14159265 * 42
    dash = circ * p
    return f'''<svg class="donut" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="42" fill="none" stroke="#E4EDE7" stroke-width="15"/>
  <circle cx="60" cy="60" r="42" fill="none" stroke="#b08d47" stroke-width="15"
          stroke-dasharray="{dash:.1f} {circ - dash:.1f}" transform="rotate(-90 60 60)" stroke-linecap="butt"/>
  <text x="60" y="63" text-anchor="middle" font-size="17" font-weight="700" fill="#b08d47">{pct(p)}</text>
  <text x="60" y="76" text-anchor="middle" font-size="7.5" fill="#8A9095">desconto alvo</text>
</svg>'''


def donut_composicao(fatias):
    """fatias = [(rótulo, valor, cor), ...] em ordem."""
    total = sum(f[1] for f in fatias)
    circ = 2 * 3.14159265 * 42
    off = 0.0
    arcos = []
    for _, v, cor in fatias:
        dash = circ * (v / total)
        arcos.append(
            f'  <circle cx="60" cy="60" r="42" fill="none" stroke="{cor}" stroke-width="17"'
            f' stroke-dasharray="{dash:.1f} {circ - dash:.1f}" stroke-dashoffset="{-off:.1f}"'
            f' transform="rotate(-90 60 60)"/>'
        )
        off += dash
    return '<svg class="donut" viewBox="0 0 120 120">\n' + "\n".join(arcos) + "\n</svg>"


# ---------------------------------------------------------------- tabelas
def t_inscricoes(ins):
    linhas = "".join(
        f'    <tr><td>{i["num"]}</td><td>{i.get("data","")}</td><td>{i.get("tributo","")}</td>'
        f'<td class="num">R$ {fmt(i["principal"])}</td><td class="num">R$ {fmt(i["acessorios"])}</td>'
        f'<td class="num">R$ {fmt(i["total"])}</td></tr>\n'
        for i in ins
    )
    tot = (
        f'    <tr class="total"><td>TOTAL — {len(ins)} inscrições</td><td></td><td></td>'
        f'<td class="num">R$ {fmt(sum(i["principal"] for i in ins))}</td>'
        f'<td class="num">R$ {fmt(sum(i["acessorios"] for i in ins))}</td>'
        f'<td class="num">R$ {fmt(sum(i["total"] for i in ins))}</td></tr>\n'
    )
    return (
        '<table>\n  <thead><tr><th>Inscrição</th><th>Data</th><th>Tributo</th>'
        '<th class="num">Principal</th><th class="num">M + J + Encargo</th><th class="num">Total</th></tr></thead>\n'
        f"  <tbody>\n{linhas}{tot}  </tbody>\n</table>"
    )


def t_simulacao(ins):
    linhas = "".join(
        f'    <tr><td>{i["num"]}</td><td>{i.get("natureza","")}</td><td>{i.get("tributo","")}</td>'
        f'<td class="num">R$ {fmt(i["total"])}</td><td class="num">R$ {fmt(i["desconto"])}</td>'
        f'<td class="num">R$ {fmt(i["final"])}</td><td class="num">{pct(i["pct"])}</td></tr>\n'
        for i in ins
    )
    tot = (
        f'    <tr class="total"><td>TOTAL — {len(ins)} inscrições</td><td></td><td></td>'
        f'<td class="num">R$ {fmt(sum(i["total"] for i in ins))}</td>'
        f'<td class="num">R$ {fmt(sum(i["desconto"] for i in ins))}</td>'
        f'<td class="num">R$ {fmt(sum(i["final"] for i in ins))}</td>'
        f'<td class="num">{pct(sum(i["desconto"] for i in ins) / sum(i["total"] for i in ins))}</td></tr>\n'
    )
    return (
        '<table>\n  <thead><tr><th>Inscrição</th><th>Nat.</th><th>Tributo</th>'
        '<th class="num">Valor total</th><th class="num">Desconto</th><th class="num">Valor final</th>'
        '<th class="num">% desc.</th></tr></thead>\n'
        f"  <tbody>\n{linhas}{tot}  </tbody>\n</table>"
    )


def t_agrupada(ins, chave, rotulo):
    grupos = OrderedDict()
    for i in ins:
        k = i.get(chave, "—")
        g = grupos.setdefault(k, {"n": 0, "v": 0.0})
        g["n"] += 1
        g["v"] += i["total"]
    total = sum(g["v"] for g in grupos.values())
    ordenado = sorted(grupos.items(), key=lambda kv: -kv[1]["v"]) if chave != "ano" else sorted(grupos.items())
    linhas = "".join(
        f'    <tr><td>{k}</td><td class="num">{g["n"]}</td><td class="num">R$ {fmt(g["v"])}</td>'
        f'<td class="num">{pct(g["v"] / total)}</td></tr>\n'
        for k, g in ordenado
    )
    tot = (
        f'    <tr class="total"><td>TOTAL</td><td class="num">{len(ins)}</td>'
        f'<td class="num">R$ {fmt(total)}</td><td class="num">100,00%</td></tr>\n'
    )
    return (
        f'<table>\n  <thead><tr><th>{rotulo}</th><th class="num">Inscr.</th>'
        '<th class="num">Valor</th><th class="num">% do total</th></tr></thead>\n'
        f"  <tbody>\n{linhas}{tot}  </tbody>\n</table>"
    )


def t_penhora(r, passivo):
    linhas = ""
    leitura = {
        1: "Baixo impacto no caixa; garantia lenta",
        2: "Próxima da parcela da transação",
        3: "Equilíbrio entre garantia e caixa",
        5: "Garantia rápida; exige margem confortável",
    }
    for p in (1, 2, 3, 5):
        v = r["fat_mes"] * p / 100
        meses = passivo / v
        linhas += (
            f'    <tr><td class="num">{p}%</td><td class="num">R$ {fmt(v)}</td>'
            f'<td class="num">{meses:.0f} meses</td><td>{leitura[p]}</td></tr>\n'
        )
    return (
        '<table>\n  <thead><tr><th class="num">% do faturamento</th><th class="num">Valor mensal</th>'
        '<th class="num">Cobertura do passivo inscrito</th><th>Leitura</th></tr></thead>\n'
        f"  <tbody>\n{linhas}  </tbody>\n</table>"
    )


# ---------------------------------------------------------------- saída
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dados")
    ap.add_argument("--out", default="blocos.html")
    a = ap.parse_args()

    d = json.load(open(a.dados, encoding="utf-8"))
    r = simular(d)
    ins = d["inscricoes"]

    larg_sem = 250.0
    larg_com = larg_sem * (r["a_pagar"] / r["passivo"])

    comp = []
    if all(k in d for k in ("multa", "juros", "encargo")):
        comp = [
            ("Principal", r["principal"], "#12233f"),
            ("Multa", d["multa"], "#B8912F"),
            ("Juros", d["juros"], "#D8B75E"),
            ("Encargo", d["encargo"], "#E8D9AE"),
        ]
    else:
        comp = [
            ("Principal", r["principal"], "#12233f"),
            ("Multa, juros e encargo", r["descontavel"], "#B8912F"),
        ]

    blocos = []
    add = blocos.append
    add("<!-- ====== SVG DONUT SCORE ====== -->\n" + donut_score(r["desc_pct"]))
    add("<!-- ====== SVG DONUT COMPOSICAO ====== -->\n" + donut_composicao(comp))
    add("<!-- ====== TABELA_NATUREZA ====== -->\n" + t_agrupada(ins, "natureza", "Natureza"))
    add("<!-- ====== TABELA_TRIBUTO ====== -->\n" + t_agrupada(ins, "tributo", "Tributo"))
    if any("ano" in i for i in ins):
        add("<!-- ====== TABELA_ANO ====== -->\n" + t_agrupada(ins, "ano", "Ano de inscrição"))
    add("<!-- ====== TABELA_INSCRICOES ====== -->\n" + t_inscricoes(ins))
    add("<!-- ====== TABELA_SIMULACAO ====== -->\n" + t_simulacao(ins))
    if "fat_mes" in r:
        add("<!-- ====== TABELA_DIMENSIONAMENTO (penhora) ====== -->\n" + t_penhora(r, r["passivo"]))

    with open(a.out, "w", encoding="utf-8") as f:
        f.write("\n\n".join(blocos) + "\n")

    campos = [
        ("PASSIVO", fmt(r["passivo"])),
        ("PRINCIPAL", fmt(r["principal"])),
        ("DESCONTAVEL", fmt(r["descontavel"])),
        ("ECONOMIA", fmt(r["economia"])),
        ("A_PAGAR", fmt(r["a_pagar"])),
        ("DESC_PCT", pct(r["desc_pct"])),
        ("N_INSCRICOES", str(r["n_inscricoes"])),
        ("RFB", fmt(r["rfb"])),
        ("FEDERAL_TOTAL", fmt(r["federal_total"])),
    ]
    if "capag" in r:
        campos += [("CAPAG", fmt(r["capag"])), ("COBERTURA", pct(r["cobertura"], 0))]
    campos += [
        ("PCT_ENTRADA", pct(r["ent_pct"], 0)),
        ("ENTRADA_TOTAL", fmt(r["entrada_total"])),
        ("N_ENTRADA", str(r["n_entrada"])),
        ("ENTRADA_MES", fmt(r["entrada_mes"])),
        ("SALDO", fmt(r["saldo"])),
        ("N_PARCELAS", str(r["n_parcelas"])),
        ("SALDO_MES", fmt(r["saldo_mes"])),
        ("INI_SALDO", str(r["n_entrada"] + 1)),
        ("FIM_SALDO", str(r["n_entrada"] + r["n_parcelas"])),
        ("PARC_60X", fmt(r["parc_conv"])),
        ("ALIVIO_PCT", pct(r["alivio_entrada"], 0)),
        ("ALIVIO_SALDO", pct(r["alivio_saldo"], 0)),
        ("LARG_SEM", f"{larg_sem:.0f}"),
        ("LARG_COM", f"{larg_com:.0f}"),
    ]
    if "fat_mes" in r:
        campos += [("RECEITA_BRUTA", fmt(r["receita_bruta"])), ("FAT_MES", fmt(r["fat_mes"]))]

    print("=== CAMPOS DO TEMPLATE " + "=" * 46)
    for k, v in campos:
        print(f"{{{{{k}}}}}".ljust(20), v)

    print("\n=== CONFERÊNCIA " + "=" * 53)
    print(f"Entrada = {pct(r['ent_pct'],0)} x R$ {fmt(r['passivo'])} = R$ {fmt(r['entrada_total'])}; "
          f"÷ {r['n_entrada']} = R$ {fmt(r['entrada_mes'])}.")
    print(f"Saldo = R$ {fmt(r['a_pagar'])} − R$ {fmt(r['entrada_total'])} = R$ {fmt(r['saldo'])}; "
          f"÷ {r['n_parcelas']} = R$ {fmt(r['saldo_mes'])}.")
    print(f"Convencional {r['conv_meses']}x = R$ {fmt(r['parc_conv'])}/mês. "
          f"Alívio: {pct(r['alivio_entrada'],0)} na entrada, {pct(r['alivio_saldo'],0)} no saldo.")
    teto = [i["num"] for i in ins if i["teto_atingido"]]
    if teto:
        print(f"ATENÇÃO — teto de 65% atingido em: {', '.join(teto)} (o desconto não zera todos os acessórios).")
    else:
        faixa = sorted(i["pct"] for i in ins)
        print(f"Nenhuma inscrição atinge o teto: descontos entre {pct(faixa[0])} e {pct(faixa[-1])}.")
    print(f"\nBlocos HTML gravados em: {a.out}")


if __name__ == "__main__":
    main()

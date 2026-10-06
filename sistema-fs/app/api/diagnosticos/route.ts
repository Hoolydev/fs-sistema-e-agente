import { sessionFor } from "@/lib/auth/server";
import { roleOf } from "@/lib/auth/roles";
import { scopeFor } from "@/lib/auth/scope";
import { NextResponse } from "next/server";
import { isValidCnpj, normalizeCnpj } from "@/lib/diagnostico/model";
import { PgfnError } from "@/lib/diagnostico/pgfn";
import { runPreliminaryDiagnostic } from "@/lib/diagnostico/consulta";
import { z } from "zod";

// Leitura da Receita Federal sem procuração, feita pelo analista. Valores em centavos; o nome do analista vem da sessão.
const printable = (s: string) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s);
const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine(printable);
const rfbManualSchema = z.object({
  hasDebts: z.boolean(), reference: text(3, 200), note: text(0, 500).optional(),
  count: z.number().int().min(0).max(9999).nullable().optional(), totalCents: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  items: z.array(z.object({ description: text(2, 120), period: text(0, 40), total: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) })).max(50).optional(),
}).strict();
const extrasSchema = z.object({ rfbManual: rfbManualSchema.nullable().optional(), annexIds: z.array(z.string().max(90)).max(30).optional() });

export const runtime = "nodejs";
export const maxDuration = 60;

// Diagnóstico preliminar por CNPJ: PGFN (contrato Serpro, sem procuração) + cadastro público.
// A Situação Fiscal RFB fica pendente até o contribuinte outorgar procuração à FS no e-CAC.
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const session = await sessionFor(request);
  if (!session) return NextResponse.json({ message: "Entre na sua conta para continuar." }, { status: 401, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Solicitação inválida." }, { status: 400, headers }); }
  const raw = typeof body === "object" && body !== null && "cnpj" in body ? body.cnpj : undefined;
  if (typeof raw !== "string" || raw.length > 30 || !isValidCnpj(normalizeCnpj(raw))) return NextResponse.json({ code: "INVALID_CNPJ", message: "Informe um CNPJ válido, incluindo os dígitos verificadores." }, { status: 422, headers });
  // force = pedido explícito de nova versão (nova consulta PGFN cobrada), ignorando a janela de reaproveitamento.
  const force = typeof body === "object" && body !== null && "force" in body && body.force === true;
  const extras = extrasSchema.safeParse(body);
  if (!extras.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Confira a leitura da Receita Federal: referência da fonte (mín. 3 caracteres), descrição e valor de cada débito." }, { status: 422, headers });
  const rfbManual = extras.data.rfbManual ? { ...extras.data.rfbManual, analyst: session.user.name } : null;
  try {
    // Externo só reaproveita e arquiva pareceres próprios.
    const result = await runPreliminaryDiagnostic(normalizeCnpj(raw), session.user.id, { force, scope: scopeFor({ id: session.user.id, role: roleOf(session.user) }), rfbManual, annexIds: extras.data.annexIds ?? [] });
    const message = result.reused ? "Já existe um diagnóstico recente deste CNPJ. Reabrindo o parecer arquivado, sem nova consulta."
      : `${result.pgfnReused ? "Nova versão emitida com a consulta PGFN já realizada (sem nova cobrança)" : "Diagnóstico preliminar emitido: PGFN e cadastro coletados"}; ${rfbManual ? "Receita Federal pela leitura do analista" : "Receita Federal pendente de procuração"}.`;
    return NextResponse.json({ ...result, message }, { status: result.reused ? 200 : 201, headers });
  } catch (error) {
    if (error instanceof PgfnError) {
      if (error.code === "credentials_missing") return NextResponse.json({ code: "PROVIDER_NOT_READY", message: "As credenciais do contrato Serpro Dívida Ativa não estão configuradas no sistema. Nenhuma consulta foi realizada ou cobrada." }, { status: 503, headers });
      if (error.code === "auth_failed") return NextResponse.json({ code: "PROVIDER_DENIED", message: "O Serpro recusou o acesso ao serviço Dívida Ativa. Confira contrato e credenciais; nenhuma consulta foi cobrada." }, { status: 502, headers });
      return NextResponse.json({ code: "PROVIDER_ERROR", message: `${error.message} Nenhum parecer foi emitido.` }, { status: 502, headers });
    }
    const code = error instanceof Error ? error.message : "";
    if (code === "ANNEX_NOT_ALLOWED") return NextResponse.json({ code, message: "Um dos documentos escolhidos como anexo não pertence a esta empresa ou ao seu acesso. Nenhuma consulta foi feita." }, { status: 422, headers });
    // Nunca expor payloads ou stack; o motivo interno fica no log da plataforma.
    console.error("diagnostico_preliminar_failed", code);
    return NextResponse.json({ code: "ISSUANCE_FAILED", message: "A consulta foi concluída, mas o parecer não pôde ser validado ou arquivado. A equipe precisa revisar antes de repetir; não refaça a consulta automaticamente." }, { status: 500, headers });
  }
}

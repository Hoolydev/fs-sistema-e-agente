import { sessionFor } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { isValidCnpj, normalizeCnpj } from "@/lib/diagnostico/model";
import { PgfnError } from "@/lib/diagnostico/pgfn";
import { runPreliminaryDiagnostic } from "@/lib/diagnostico/consulta";

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
  try {
    const result = await runPreliminaryDiagnostic(normalizeCnpj(raw), session.user.id, { force });
    return NextResponse.json({ ...result, message: result.reused ? "Já existe um diagnóstico recente deste CNPJ. Reabrindo o parecer arquivado, sem nova consulta." : "Diagnóstico preliminar emitido: PGFN e cadastro coletados; Receita Federal pendente de procuração." }, { status: result.reused ? 200 : 201, headers });
  } catch (error) {
    if (error instanceof PgfnError) {
      if (error.code === "credentials_missing") return NextResponse.json({ code: "PROVIDER_NOT_READY", message: "As credenciais do contrato Serpro Dívida Ativa não estão configuradas no sistema. Nenhuma consulta foi realizada ou cobrada." }, { status: 503, headers });
      if (error.code === "auth_failed") return NextResponse.json({ code: "PROVIDER_DENIED", message: "O Serpro recusou o acesso ao serviço Dívida Ativa. Confira contrato e credenciais; nenhuma consulta foi cobrada." }, { status: 502, headers });
      return NextResponse.json({ code: "PROVIDER_ERROR", message: `${error.message} Nenhum parecer foi emitido.` }, { status: 502, headers });
    }
    const code = error instanceof Error ? error.message : "";
    // Nunca expor payloads ou stack; o motivo interno fica no log da plataforma.
    console.error("diagnostico_preliminar_failed", code);
    return NextResponse.json({ code: "ISSUANCE_FAILED", message: "A consulta foi concluída, mas o parecer não pôde ser validado ou arquivado. A equipe precisa revisar antes de repetir; não refaça a consulta automaticamente." }, { status: 500, headers });
  }
}

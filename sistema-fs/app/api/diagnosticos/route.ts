import { requireSession } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { isValidCnpj, normalizeCnpj } from "@/lib/diagnostico/model";
export async function POST(request: Request) {
  const denied = await requireSession(request); if (denied) return denied;
  const headers = { "Cache-Control": "no-store" };
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Solicitação inválida." }, { status: 400, headers }); }
  const raw = typeof body === "object" && body !== null && "cnpj" in body ? body.cnpj : undefined;
  if (typeof raw !== "string" || raw.length > 30 || !isValidCnpj(normalizeCnpj(raw))) return NextResponse.json({ code: "INVALID_CNPJ", message: "Informe um CNPJ válido, incluindo os dígitos verificadores." }, { status: 422, headers });
  // Fail closed: there is no private-data endpoint until identity, company access,
  // the shared queue and the contracted providers are wired together.
  return NextResponse.json({ code: "PROVIDER_NOT_READY", message: "As consultas reais ainda não estão disponíveis. A ativação depende da contratação do Serpro, das autorizações da empresa e da configuração do acesso da equipe. Nenhuma consulta foi realizada ou cobrada." }, { status: 503, headers });
}

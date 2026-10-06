import { requirePermission } from "@/lib/auth/server";
import { scopeFor } from "@/lib/auth/scope";
import { sitfisStatusFor } from "@/lib/diagnostico/sitfis";
export const runtime = "nodejs";
// Andamento da consulta da Receita Federal de um parecer (parecer-base ou versão completa), para a tela.
export async function GET(request: Request) {
  const { actor, denied } = await requirePermission(request); if (denied) return denied;
  const id = new URL(request.url).searchParams.get("documento") ?? "";
  if (!/^doc_[a-zA-Z0-9-]{1,80}$/.test(id)) return Response.json({ message: "Documento inválido." }, { status: 422 });
  try {
    const found = await sitfisStatusFor(id, scopeFor(actor));
    return Response.json({ request: found && { status: found.status, message: found.message, resultUrl: found.resultDocumentId ? `/diagnostico/${found.resultDocumentId}` : null, isResult: found.resultDocumentId === id, createdAt: found.createdAt, updatedAt: found.updatedAt } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "Andamento indisponível." }, { status: 503 }); }
}

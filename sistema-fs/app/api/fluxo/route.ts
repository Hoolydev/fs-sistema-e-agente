import { requirePermission } from "@/lib/auth/server";
import { scopeFor } from "@/lib/auth/scope";
import { jsonBody, reply } from "@/lib/controller/http";
import { isSector, moveSchema } from "@/lib/fluxo/model";
import { canApprove, canWork, listFlow, moveCard } from "@/lib/fluxo/store";
import { flowError } from "./http";
export const runtime = "nodejs";

// Quadro de uma área: cartões (um por CNPJ) e o que a pessoa pode fazer nele.
export async function GET(request: Request) {
  const { actor, denied } = await requirePermission(request); if (denied) return denied;
  const sector = new URL(request.url).searchParams.get("setor");
  if (!isSector(sector)) return reply({ message: "Área inválida." }, 400);
  if (actor.role === "externo" && (sector === "comercial" || sector === "juridico")) return reply({ message: "Seu perfil de acesso não permite esta área." }, 403);
  try {
    const [cards, work, advance] = await Promise.all([listFlow(sector, scopeFor(actor)), canWork(actor, sector), canApprove(actor, sector)]);
    return reply({ sector, cards, canWork: work, canAdvance: advance });
  }
  catch (error) { return flowError(error); }
}
// Arrastar o cartão para outra subetapa da mesma área.
export async function PATCH(request: Request) {
  const { actor, denied } = await requirePermission(request, { processo: ["editar"] }); if (denied) return denied;
  const body = await jsonBody(request); if (body instanceof Response) return body;
  const input = moveSchema.safeParse(body);
  if (!input.success) return reply({ message: "Movimento inválido." }, 422);
  try { return reply({ card: await moveCard(input.data.cnpj, input.data.substage, input.data.version, actor, scopeFor(actor)) }); }
  catch (error) { return flowError(error); }
}

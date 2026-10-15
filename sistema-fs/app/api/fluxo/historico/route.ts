import { requirePermission } from "@/lib/auth/server";
import { scopeFor } from "@/lib/auth/scope";
import { reply } from "@/lib/controller/http";
import { flowHistory, getCard } from "@/lib/fluxo/store";
import { flowError } from "../http";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { actor, denied } = await requirePermission(request); if (denied) return denied;
  const cnpj = new URL(request.url).searchParams.get("cnpj") ?? "";
  try {
    const card = await getCard(cnpj, scopeFor(actor));
    if (!card) return reply({ message: "Cliente não encontrado no fluxo." }, 404);
    return reply({ card, history: await flowHistory(card.cnpj) });
  } catch (error) { return flowError(error); }
}

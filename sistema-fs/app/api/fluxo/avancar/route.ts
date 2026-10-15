import { requirePermission } from "@/lib/auth/server";
import { scopeFor } from "@/lib/auth/scope";
import { jsonBody, reply } from "@/lib/controller/http";
import { advanceSchema } from "@/lib/fluxo/model";
import { advanceCard } from "@/lib/fluxo/store";
import { flowError } from "../http";
export const runtime = "nodejs";

// Enviar o cliente para a próxima área (ou devolver à anterior). Validação de revisor.
export async function POST(request: Request) {
  const { actor, denied } = await requirePermission(request, { processo: ["revisar"] }); if (denied) return denied;
  const body = await jsonBody(request); if (body instanceof Response) return body;
  const input = advanceSchema.safeParse(body);
  if (!input.success) return reply({ message: input.error.issues[0]?.message ?? "Pedido inválido." }, 422);
  try { return reply({ card: await advanceCard(input.data.cnpj, input.data.version, input.data.direction, input.data.note, actor, scopeFor(actor)) }); }
  catch (error) { return flowError(error); }
}

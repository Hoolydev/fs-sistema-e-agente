import { requirePermission } from "@/lib/auth/server";
import { jsonBody, reply, storeError } from "@/lib/controller/http";
import { decisionSchema } from "@/lib/controller/model";
import { reviewProcess } from "@/lib/controller/store";
export const runtime = "nodejs";

// Aprovar ou pedir ajustes: somente perfis revisores (administrador e advogado).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { actor, denied } = await requirePermission(request, { processo: ["revisar"] }); if (denied) return denied;
  const body = await jsonBody(request); if (body instanceof Response) return body;
  const input = decisionSchema.safeParse(body);
  if (!input.success) return reply({ message: "Descreva o ajuste solicitado (mínimo de 3 caracteres)." }, 422);
  try { return reply({ process: await reviewProcess((await params).id, input.data.decision, input.data.note, input.data.version, actor) }); } catch (error) { return storeError(error); }
}

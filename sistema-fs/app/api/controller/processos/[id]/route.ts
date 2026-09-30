import { requirePermission } from "@/lib/auth/server";
import { sameOrigin } from "@/lib/comercial/security";
import { jsonBody, reply, storeError } from "@/lib/controller/http";
import { processSchema } from "@/lib/controller/model";
import { deleteProcess, getProcess, processHistory, updateProcess } from "@/lib/controller/store";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { denied } = await requirePermission(request); if (denied) return denied;
  try {
    const { id } = await params, process = await getProcess(id);
    return process ? reply({ process, history: await processHistory(id) }) : reply({ message: "Registro não encontrado." }, 404);
  } catch (error) { return storeError(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  const { actor, denied } = await requirePermission(request, { processo: ["editar"] }); if (denied) return denied;
  const body = await jsonBody(request); if (body instanceof Response) return body;
  const input = processSchema.safeParse(body);
  if (!input.success || typeof body.version !== "string") return reply({ message: "Confira os campos informados.", fields: input.success ? [] : input.error.issues.map(i => i.path[0]) }, 422);
  try { return reply({ process: await updateProcess((await params).id, input.data, body.version, actor) }); } catch (error) { return storeError(error); }
}
export async function DELETE(request: Request, { params }: Context) {
  const { actor, denied } = await requirePermission(request, { processo: ["excluir"] }); if (denied) return denied;
  if (!sameOrigin(request)) return reply({ message: "Origem inválida." }, 403);
  try { await deleteProcess((await params).id, actor); return reply({ ok: true }); } catch (error) { return storeError(error); }
}

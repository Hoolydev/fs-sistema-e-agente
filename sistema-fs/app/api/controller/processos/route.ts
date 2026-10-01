import { requirePermission } from "@/lib/auth/server";
import { fieldsMessage, jsonBody, reply, storeError } from "@/lib/controller/http";
import { fieldLabels, processSchema } from "@/lib/controller/model";
import { createProcess, listProcesses } from "@/lib/controller/store";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { actor, denied } = await requirePermission(request); if (denied) return denied;
  try { return reply({ processes: await listProcesses(), role: actor.role }); } catch (error) { return storeError(error); }
}
export async function POST(request: Request) {
  const { actor, denied } = await requirePermission(request, { processo: ["incluir"] }); if (denied) return denied;
  const body = await jsonBody(request); if (body instanceof Response) return body;
  const input = processSchema.safeParse(body);
  if (!input.success) return reply({ message: fieldsMessage(input.error.issues.map(i => i.path[0]), fieldLabels), fields: input.error.issues.map(i => i.path[0]) }, 422);
  try { return reply({ process: await createProcess(input.data, actor) }, 201); } catch (error) { return storeError(error); }
}

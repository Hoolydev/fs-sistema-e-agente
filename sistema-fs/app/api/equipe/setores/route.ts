import { requirePermission } from "@/lib/auth/server";
import { jsonBody, reply } from "@/lib/controller/http";
import { sectorsSchema } from "@/lib/fluxo/model";
import { allUserSectors, setUserSectors } from "@/lib/fluxo/store";
import { flowError } from "../../fluxo/http";
export const runtime = "nodejs";

// Setor de cada pessoa no fluxo de etapas: só o administrador consulta e altera.
export async function GET(request: Request) {
  const { denied } = await requirePermission(request, { user: ["update"] }); if (denied) return denied;
  try { return reply({ sectors: await allUserSectors() }); } catch (error) { return flowError(error); }
}
export async function PATCH(request: Request) {
  const { denied } = await requirePermission(request, { user: ["update"] }); if (denied) return denied;
  const body = await jsonBody(request); if (body instanceof Response) return body;
  const input = sectorsSchema.safeParse(body);
  if (!input.success) return reply({ message: "Setores inválidos." }, 422);
  try { return reply({ userId: input.data.userId, sectors: await setUserSectors(input.data.userId, input.data.sectors) }); } catch (error) { return flowError(error); }
}

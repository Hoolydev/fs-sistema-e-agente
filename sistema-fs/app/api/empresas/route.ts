import { requirePermission } from "@/lib/auth/server";
import { fieldsMessage, jsonBody, reply, storeError } from "@/lib/controller/http";
const labels = { name: "razão social", cnpj: "CNPJ", notes: "observações" };
import { companySchema, createCompany, listCompanies, updateCompany } from "@/lib/empresas/store";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { denied } = await requirePermission(request); if (denied) return denied;
  try { return reply({ companies: await listCompanies() }); } catch (error) { return storeError(error); }
}
// Cadastrar empresa: qualquer perfil que inclui registros no Controller.
export async function POST(request: Request) {
  const { actor, denied } = await requirePermission(request, { processo: ["incluir"] }); if (denied) return denied;
  const body = await jsonBody(request); if (body instanceof Response) return body;
  const input = companySchema.safeParse(body);
  if (!input.success) return reply({ message: fieldsMessage(input.error.issues.map(i => i.path[0]), labels), fields: input.error.issues.map(i => i.path[0]) }, 422);
  try { return reply({ company: await createCompany(input.data, actor) }, 201); }
  catch (error) { return error instanceof Error && error.message === "DUPLICATE_COMPANY" ? reply({ code: "DUPLICATE_COMPANY", message: "Esta empresa já está cadastrada." }, 409) : storeError(error); }
}
export async function PATCH(request: Request) {
  const { actor, denied } = await requirePermission(request, { processo: ["editar"] }); if (denied) return denied;
  const body = await jsonBody(request); if (body instanceof Response) return body;
  const input = companySchema.safeParse(body);
  if (!input.success) return reply({ message: fieldsMessage(input.error.issues.map(i => i.path[0]), labels), fields: input.error.issues.map(i => i.path[0]) }, 422);
  try { return reply({ company: await updateCompany(input.data.cnpj, input.data, actor) }); } catch (error) { return storeError(error); }
}

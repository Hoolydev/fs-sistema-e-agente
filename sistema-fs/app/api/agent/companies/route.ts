import { agentService } from "@/lib/documentos/access";
import { listCompanies } from "@/lib/empresas/store";
import { searchKey } from "@/lib/controller/model";
export const runtime = "nodejs";
// Empresas cadastradas (Administrativo) ou presentes no Controller, para o agente vincular comprovantes e pedidos a um CNPJ.
export async function GET(request: Request) {
  if (!agentService(request)) return new Response(null, { status: 401 });
  const q = searchKey((new URL(request.url).searchParams.get("q") ?? "").slice(0, 160));
  if (q.length < 3) return Response.json({ message: "Informe nome ou CNPJ." }, { status: 422 });
  try {
    const found = (await listCompanies()).filter(c => c.cnpj.includes(q) || searchKey(c.name).includes(q));
    return Response.json({ companies: found.slice(0, 20).map(({ cnpj, name }) => ({ cnpj, name })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "Controller indisponível." }, { status: 503 }); }
}

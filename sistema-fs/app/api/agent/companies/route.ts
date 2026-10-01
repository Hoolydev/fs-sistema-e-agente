import { agentService } from "@/lib/documentos/access";
import { listProcesses } from "@/lib/controller/store";
import { searchKey } from "@/lib/controller/model";
export const runtime = "nodejs";
// Empresas conhecidas pelo Controller, para o agente vincular comprovantes e pedidos a um CNPJ.
export async function GET(request: Request) {
  if (!agentService(request)) return new Response(null, { status: 401 });
  const q = searchKey((new URL(request.url).searchParams.get("q") ?? "").slice(0, 160));
  if (q.length < 3) return Response.json({ message: "Informe nome ou CNPJ." }, { status: 422 });
  try {
    const seen = new Map<string, string>();
    for (const p of await listProcesses()) if (!seen.has(p.cnpj) && (p.cnpj.includes(q) || searchKey(p.company).includes(q))) seen.set(p.cnpj, p.company);
    return Response.json({ companies: [...seen].slice(0, 20).map(([cnpj, name]) => ({ cnpj, name })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "Controller indisponível." }, { status: 503 }); }
}

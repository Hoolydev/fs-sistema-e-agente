import { agentService } from "@/lib/documentos/access";
import { teamDirectory } from "@/lib/equipe/team";
export const runtime = "nodejs";
// Quem é cada número de WhatsApp e o que pode pedir ao agente. Sem e-mail: o agente só precisa de nome, perfil e atribuições.
export async function GET(request: Request) {
  if (!agentService(request)) return new Response(null, { status: 401 });
  try { return Response.json({ members: (await teamDirectory()).filter(m => m.active).map(({ id, name, role, phone, tasks }) => ({ id, name, role, phone, tasks })) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ message: "Equipe indisponível." }, { status: 503 }); }
}

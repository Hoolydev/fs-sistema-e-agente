import { agentService } from "@/lib/documentos/access";
import { boundedBody } from "@/lib/comercial/security";
import { acknowledgeNotification } from "@/lib/avisos/store";
export const runtime = "nodejs";
// O agente confirma o envio (ou registra a falha) de cada aviso.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!agentService(request)) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
  try {
    const body = JSON.parse((await boundedBody(request, 2000)).toString() || "{}") as { sent?: unknown; error?: unknown };
    await acknowledgeNotification(id, body.sent === true, typeof body.error === "string" ? body.error : "");
    return Response.json({ ok: true });
  } catch { return Response.json({ message: "Confirmação inválida." }, { status: 422 }); }
}

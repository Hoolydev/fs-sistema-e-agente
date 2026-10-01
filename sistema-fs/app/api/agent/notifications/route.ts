import { agentService } from "@/lib/documentos/access";
import { ensureDailyDigest, pendingNotifications } from "@/lib/avisos/store";
import { listProcesses } from "@/lib/controller/store";
export const runtime = "nodejs";
// Caixa de saída de avisos. A cada consulta o sistema também garante o resumo diário das contagens (a partir das 08:00).
export async function GET(request: Request) {
  if (!agentService(request)) return new Response(null, { status: 401 });
  try {
    await ensureDailyDigest(await listProcesses()).catch(() => {});
    return Response.json({ notifications: await pendingNotifications() }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "Avisos indisponíveis." }, { status: 503 }); }
}

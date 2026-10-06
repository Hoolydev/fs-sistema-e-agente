import { z } from "zod";
import { agentService } from "@/lib/documentos/access";
import { boundedBody } from "@/lib/comercial/security";
import { completeSitfis } from "@/lib/diagnostico/sitfis";
export const runtime = "nodejs";
export const maxDuration = 60;
const metadata = z.object({ requestId: z.string().regex(/^sitfis-[a-f0-9-]{36}$/), cnpj: z.string().regex(/^\d{14}$/), ok: z.boolean(), code: z.string().max(60).optional(), collectedAt: z.string().max(40).optional(), sha256: z.string().regex(/^[a-f0-9]{64}$/).optional() });
// Resultado da consulta SITFIS feita pelo worker do agente: PDF oficial + texto extraído, ou o código da falha.
export async function POST(request: Request) {
  if (!agentService(request)) return new Response(null, { status: 401 });
  try {
    const raw = await boundedBody(request, 4 * 1024 * 1024);
    const form = await new Response(raw, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
    const meta = metadata.parse(JSON.parse(String(form.get("metadata"))));
    const file = form.get("file"), text = form.get("text");
    const result = await completeSitfis({ ...meta, ...(file instanceof File ? { pdf: Buffer.from(await file.arrayBuffer()) } : {}), ...(typeof text === "string" ? { text: text.slice(0, 2_000_000) } : {}) });
    return Response.json({ status: result.status, resultDocumentId: result.resultDocumentId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const status = code === "NOT_FOUND" ? 404 : code === "BODY_LIMIT" ? 413 : 422;
    console.error("sitfis_result_rejected", code.slice(0, 40));
    return Response.json({ message: "Resultado SITFIS recusado." }, { status });
  }
}

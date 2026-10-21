import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requirePermission } from "@/lib/auth/server";
import { scopeFor } from "@/lib/auth/scope";
import { savedReport } from "@/lib/diagnostico/store";
import { generateSummaryPdf } from "@/lib/diagnostico/pdf-estrategico";
import { auditDocument } from "@/lib/documentos/store";
import { documentResponse } from "@/lib/documentos/access";
export const runtime = "nodejs";
// Resumo de 1 página do diagnóstico, gerado na hora do payload arquivado (mesmos números do diagnóstico, sem nova consulta).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { actor, denied } = await requirePermission(request); if (denied) return denied;
  const { id } = await params, report = await savedReport(id, scopeFor(actor));
  if (!report) return new Response(null, { status: 404 });
  const pdf = Buffer.from(generateSummaryPdf(report, await readFile(join(process.cwd(), "public/brand/fs-horizontal.png"))));
  await auditDocument(actor.id, "view-summary", id);
  return documentResponse({ name: `Resumo Diagnostico ${report.company.cnpj} v${report.version}.pdf`, content: pdf, mime: "application/pdf" }, new URL(request.url).searchParams.has("download"));
}

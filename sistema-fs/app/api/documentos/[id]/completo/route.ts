import { requirePermission } from "@/lib/auth/server";
import { scopeFor } from "@/lib/auth/scope";
import { savedReport } from "@/lib/diagnostico/store";
import { mergeOpinionWithAnnexes, type AnnexFile } from "@/lib/diagnostico/anexos";
import { auditDocument, documentContent } from "@/lib/documentos/store";
import { documentResponse } from "@/lib/documentos/access";
export const runtime = "nodejs";
export const maxDuration = 60;
// Parecer arquivado + anexos registrados nele, num único PDF gerado na hora (o parecer guardado não muda).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { actor, denied } = await requirePermission(request); if (denied) return denied;
  const { id } = await params, scope = scopeFor(actor);
  const report = await savedReport(id, scope), opinion = report ? await documentContent(id, scope) : null;
  if (!report || !opinion) return new Response(null, { status: 404 });
  const annexes: AnnexFile[] = [];
  for (const annex of report.annexes ?? []) {
    const file = await documentContent(annex.id, scope);
    if (file) annexes.push({ name: annex.name, type: annex.type, content: file.content, mime: file.mime });
  }
  const merged = await mergeOpinionWithAnnexes(opinion.content, annexes);
  await auditDocument(actor.id, "view-complete", id);
  return documentResponse({ name: opinion.name.replace(/\.pdf$/i, " com anexos.pdf"), content: merged.pdf, mime: "application/pdf" }, new URL(request.url).searchParams.has("download"));
}

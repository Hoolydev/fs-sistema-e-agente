import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/auth/server";
import { sameOrigin } from "@/lib/comercial/security";
import { detectMime } from "@/lib/documentos/access";
import { archiveDocument, auditDocument, documentKinds, documents } from "@/lib/documentos/store";
import { isValidCnpj, normalizeCnpj } from "@/lib/diagnostico/model";
import { listCompanies } from "@/lib/empresas/store";
import { isDocumentType } from "@/lib/documentos/tipos";
import { ownerFor, scopeFor } from "@/lib/auth/scope";
export const runtime="nodejs";
export async function GET(request:Request){const {actor,denied}=await requirePermission(request);if(denied)return denied;try{const q=(new URL(request.url).searchParams.get('q')??'').slice(0,160);const found=await documents(q,false,scopeFor(actor));return Response.json({documents:found,total:found.length},{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({message:'Não foi possível carregar o acervo.'},{status:503});}}
const MAX = 3 * 1024 * 1024, MAX_FILES = 10;
// Envio pela tela: vários arquivos de uma vez para uma empresa (PDF, JPG ou PNG, até 3 MB cada).
export async function POST(request: Request) {
  const { actor, denied } = await requirePermission(request, { processo: ["incluir"] }); if (denied) return denied;
  if (!sameOrigin(request)) return Response.json({ message: "Origem inválida." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > MAX_FILES * MAX + 50_000) return Response.json({ message: `Envie até ${MAX_FILES} arquivos de até 3 MB cada.` }, { status: 413 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ message: "Envio inválido." }, { status: 400 }); }
  const cnpj = normalizeCnpj(String(form.get("cnpj") ?? "")), kind = String(form.get("kind") ?? "documento");
  if (!isValidCnpj(cnpj)) return Response.json({ message: "Informe um CNPJ válido." }, { status: 422 });
  if (!(documentKinds as readonly string[]).includes(kind) || kind === "parecer") return Response.json({ message: "Tipo de documento inválido." }, { status: 422 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length || files.length > MAX_FILES) return Response.json({ message: `Selecione de 1 a ${MAX_FILES} arquivos.` }, { status: 422 });
  // Um tipo por arquivo, na mesma ordem; sem tipo informado entra como "outro".
  const types = form.getAll("types").map(String);
  if (types.some(t => !isDocumentType(t))) return Response.json({ message: "Tipo de documento desconhecido." }, { status: 422 });
  const company = (await listCompanies(scopeFor(actor)).catch(() => [])).find(c => c.cnpj === cnpj)?.name ?? `CNPJ ${cnpj}`;
  const saved: { id: string; name: string }[] = [], rejected: string[] = [];
  for (const [index, file] of files.entries()) {
    const docType = types[index] ?? "outro", fileKind = docType === "comprovante" ? "comprovante" : kind;
    const content = Buffer.from(await file.arrayBuffer()), mime = detectMime(content);
    if (file.size > MAX || !mime) { rejected.push(file.name); continue; }
    const name = (file.name || "documento").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 150);
    const id = await archiveDocument({ externalId: `web-${randomUUID()}`, cnpj, company, name, kind: fileKind, createdAt: new Date().toISOString(), mime, source: actor.name, docType, ownerId: ownerFor(actor) }, content);
    await auditDocument(actor.name, "upload", id);
    saved.push({ id, name });
  }
  return Response.json({ saved, rejected, message: rejected.length ? `${rejected.length} arquivo(s) não aceito(s): só PDF, JPG ou PNG até 3 MB.` : "" }, { status: saved.length ? 201 : 422, headers: { "Cache-Control": "no-store" } });
}

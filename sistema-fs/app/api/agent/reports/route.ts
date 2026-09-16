import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { agentActor } from '@/lib/documentos/access';
import { auditDocument } from '@/lib/documentos/store';
import { archiveCanonicalReport } from '@/lib/diagnostico/store';
import { boundedBody } from '@/lib/comercial/security';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const actor = agentActor(request);
  if (!actor) return new Response(null, { status: 401 });
  try {
    const body = JSON.parse((await boundedBody(request, 512 * 1024)).toString("utf8"));
    const logo = await readFile(join(process.cwd(), 'public/brand/fs-horizontal.png'));
    const id = await archiveCanonicalReport(body.externalId, body.report, logo);
    await auditDocument(actor, 'archive-canonical-report', id);
    return Response.json({ id, reportUrl: `/diagnostico/${id}`, pdfUrl: `/api/documentos/${id}` }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof Error && error.message === 'ARCHIVE_CONFLICT' ? 409 : error instanceof Error && error.message === 'BODY_LIMIT' ? 413 : 422;
    return Response.json({ message: 'Não foi possível emitir o parecer FS. Confira o contrato de dados e a versão; nenhuma consulta fiscal foi executada.' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

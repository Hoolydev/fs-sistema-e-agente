import { createHash } from 'node:crypto';
import { query } from '@/lib/comercial/store';
import { archiveDocument, setupDocuments } from '@/lib/documentos/store';
import { validateReport } from './model';
import { generateDiagnosticPdf } from './pdf';

export function validateCanonicalReport(input: unknown) {
  const report = validateReport(input);
  if (report.mode !== 'real' || !report.opinion || !['rfb', 'pgfn'].every(id => report.sources.some(s => s.id === id)) || !report.sources.some(s => ['rfb', 'pgfn'].includes(s.id) && s.status === 'coletado')) throw new Error('REAL_EVIDENCE_REQUIRED');
  if (report.debts.some(d => d.sourceId !== d.origin.toLowerCase())) throw new Error('SOURCE_MISMATCH');
  if (report.sources.some(s => s.status === 'pendente') && !report.pending.length) throw new Error('PENDING_REQUIRED');
  return report;
}

export async function savedReport(documentId: string) {
  if (!/^doc_[a-zA-Z0-9-]{1,80}$/.test(documentId)) return null;
  await setupDocuments();
  const [row] = await query('SELECT payload FROM fs_diagnostic_reports WHERE document_id=$1', [documentId.slice(4)]);
  return row ? validateCanonicalReport(JSON.parse(String(row.payload))) : null;
}

// Both the screen and immutable PDF are emitted from this exact validated payload.
// Retry reuses the document; an interrupted payload insert can be reconciled safely.
export async function archiveCanonicalReport(externalId: string, input: unknown, logo: Uint8Array) {
  const report = validateCanonicalReport(input);
  if (typeof externalId !== 'string' || !/^[a-zA-Z0-9._-]{1,150}$/.test(externalId)) throw new Error('INVALID_EXTERNAL_ID');
  const payload = JSON.stringify(report), hash = createHash('sha256').update(payload).digest('hex');
  await setupDocuments();
  const [existing] = await query('SELECT d.id,r.input_sha256 FROM fs_documents d JOIN fs_diagnostic_reports r ON r.document_id=d.id WHERE d.external_id=$1', [externalId]);
  if (existing) {
    if (existing.input_sha256 !== hash) throw new Error('ARCHIVE_CONFLICT');
    return `doc_${existing.id}`;
  }
  const content = Buffer.from(generateDiagnosticPdf(report, logo));
  if (content.length > 3 * 1024 * 1024) throw new Error('PDF_TOO_LARGE');
  const id = await archiveDocument({ externalId, cnpj: report.company.cnpj, company: report.company.name, name: `Parecer FS ${report.company.cnpj} v${report.version}.pdf`, kind: 'parecer', createdAt: report.generatedAt }, content);
  await query('INSERT INTO fs_diagnostic_reports (document_id,payload,input_sha256) VALUES ($1,$2,$3) ON CONFLICT(document_id) DO NOTHING', [id.slice(4), payload, hash]);
  const [stored] = await query('SELECT input_sha256 FROM fs_diagnostic_reports WHERE document_id=$1', [id.slice(4)]);
  if (stored.input_sha256 !== hash) throw new Error('ARCHIVE_CONFLICT');
  return id;
}

import type { StoredDocument } from './store';
import { normalizeCnpj } from '../diagnostico/model';

export type CompanyDocuments = { cnpj: string; name: string; documents: StoredDocument[] };
export function groupDocuments(items: StoredDocument[]): CompanyDocuments[] {
  const groups = new Map<string, CompanyDocuments>();
  for (const doc of [...items].sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))) {
    const cnpj = normalizeCnpj(doc.cnpj);
    let group = groups.get(cnpj);
    if (!group) { group = { cnpj, name: doc.company, documents: [] }; groups.set(cnpj, group); }
    group.documents.push(doc);
    if (/^CNPJ\s/i.test(group.name) && !/^CNPJ\s/i.test(doc.company)) group.name = doc.company;
  }
  return [...groups.values()];
}
export function preferredDocument(group: CompanyDocuments, selectedId?: string) {
  return group.documents.find(d => d.id === selectedId) ?? group.documents.find(d => d.kind === 'parecer') ?? group.documents[0];
}

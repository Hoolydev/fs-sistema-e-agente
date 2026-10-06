// Checklist de documentação por empresa (lista da equipe FS, 01/10/2026). Sem imports de servidor: usado também na tela.
export const documentTypes = [
  { id: "cartao_cnpj", label: "Cartão CNPJ", required: true },
  { id: "documento_pessoal", label: "Documento pessoal", required: true },
  { id: "contrato_social", label: "Contrato social", required: true },
  { id: "procuracao", label: "Procuração assinada", required: true },
  { id: "traslado_cessao", label: "Traslado / cessão", required: true },
  { id: "certidao_ouricuri", label: "Certidão Ouricuri", required: true },
  { id: "certidao_transito", label: "Certidão de trânsito", required: true },
  { id: "situacao_fiscal", label: "Relatório de situação fiscal (RFB)", required: false },
  { id: "comprovante", label: "Comprovante de pagamento", required: false },
  { id: "outro", label: "Outro documento", required: false },
] as const;
export type DocumentTypeId = (typeof documentTypes)[number]["id"];
export const requiredDocumentTypes = documentTypes.filter(t => t.required);
export const documentTypeLabel = (id: string | null | undefined) => documentTypes.find(t => t.id === id)?.label ?? (id === "parecer" ? "Parecer FS" : "Documento");
export const isDocumentType = (id: string): id is DocumentTypeId => documentTypes.some(t => t.id === id);
// Situação do checklist: quais tipos obrigatórios já têm arquivo.
export function documentChecklist(docs: { docType?: string | null; kind: string }[]) {
  const present = new Set(docs.map(d => d.docType ?? (d.kind === "comprovante" ? "comprovante" : null)).filter(Boolean));
  return requiredDocumentTypes.map(t => ({ ...t, done: present.has(t.id) }));
}

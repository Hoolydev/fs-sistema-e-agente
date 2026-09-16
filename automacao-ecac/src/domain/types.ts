export const documentTypes = [
  "diagnostico_fiscal",
  "situacao_fiscal",
  "dctfweb",
  "caixa_postal",
] as const;

export type DocumentType = (typeof documentTypes)[number];

export interface InboundMessage {
  messageId: string;
  from: string;
  timestamp: Date;
  type: string;
  text?: string;
}

export interface ParsedRequest {
  cnpj?: string;
  period?: string;
  documentType?: DocumentType;
}

export interface RpaRequest {
  // Persisted in BullMQ before a potentially billable API collection starts.
  serproAttemptStarted?: boolean;
  requestId: string;
  sourceMessageId: string;
  requesterPhone: string;
  cnpj: string;
  period: string;
  documentType: DocumentType;
}

export interface RpaResult {
  deliveryNote?: string;
  localPath: string;
  filename: string;
  mimeType: string;
  sha256: string;
  obtainedAt: string;
}

export type RequestStatus =
  | "received"
  | "awaiting_data"
  | "queued"
  | "running"
  | "validating"
  | "sending"
  | "completed"
  | "human_intervention"
  | "failed";

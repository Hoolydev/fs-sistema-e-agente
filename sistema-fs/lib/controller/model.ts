import { z } from "zod";
import { isValidCnpj, normalizeCnpj } from "../diagnostico/model";

// Controller — etapa de gestão de processos. Campos espelham a planilha da equipe:
// EMPRESA | CNPJ | OBJETO | STATUS ADM./HABILITAÇÃO | DTA PROTOCOLO | CONTAGEM | Nº DO PROCESSO ADM | ÚLTIMA ATUALIZAÇÃO | STATUS | OBS
export const reviewStates = ["pendente", "aprovado", "ajustes"] as const;
export type ReviewState = (typeof reviewStates)[number];
export const reviewLabels: Record<ReviewState, string> = { pendente: "Aguardando revisão", aprovado: "Revisado", ajustes: "Ajustes solicitados" };
export const admStatusOptions = ["NÃO INICIADO", "PROTOCOLADO"];
export const dispatchOptions = ["NÃO TEM DESPACHO", "TEM DESPACHO", "ARQUIVADO"];
export const objectOptions = ["HABILITAÇÃO DE CRÉDITO"];
// Na planilha, CONTAGEM = data do protocolo + 31 dias.
export const DEADLINE_DAYS = 31;

const printable = (s: string) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s);
const clean = (max: number) => z.string().trim().max(max).refine(printable);
const label = (max: number) => z.string().trim().min(1).max(max).refine(printable).transform(s => s.replace(/\s+/g, " ").toUpperCase());
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s));
const optionalDay = z.union([day, z.literal(""), z.null()]).transform(v => v || null);
export const processSchema = z.object({
  company: label(200),
  cnpj: z.string().max(18).transform(normalizeCnpj).refine(isValidCnpj, "CNPJ inválido"),
  object: label(120),
  admStatus: label(60),
  protocolDate: optionalDay,
  deadline: optionalDay,
  processNumber: clean(40).transform(s => s.replace(/\s+/g, "")),
  updatedOn: optionalDay,
  dispatchStatus: label(60),
  notes: clean(1000),
});
export type ProcessInput = z.infer<typeof processSchema>;
export const processFields = Object.keys(processSchema.shape) as (keyof ProcessInput)[];
export const fieldLabels: Record<keyof ProcessInput, string> = {
  company: "Empresa", cnpj: "CNPJ", object: "Objeto", admStatus: "Status adm. / habilitação", protocolDate: "Data do protocolo", deadline: "Prazo (contagem)",
  processNumber: "Nº do processo adm.", updatedOn: "Última atualização", dispatchStatus: "Status", notes: "Observações",
};
export type ControllerProcess = ProcessInput & {
  id: string; reviewState: ReviewState; reviewNote: string;
  createdBy: string; createdAt: string; updatedBy: string; updatedAt: string; reviewedBy: string | null; reviewedAt: string | null;
};
export type AuditEntry = { id: string; actor: string; action: string; detail: string; createdAt: string };
export const decisionSchema = z.object({ decision: z.enum(["aprovar", "ajustes"]), note: clean(500).default(""), version: z.string().max(40) })
  .refine(d => d.decision === "aprovar" || d.note.length >= 3, "Descreva o ajuste solicitado.");

export function addDays(isoDay: string, days: number) { const d = new Date(`${isoDay}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export const today = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
export function daysUntil(isoDay: string | null, from = today()) { return isoDay ? Math.round((Date.parse(`${isoDay}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) : null; }
export const formatDay = (isoDay: string | null) => isoDay ? isoDay.split("-").reverse().join("/") : "—";
// Prazo ainda corre apenas para processo protocolado, sem despacho e não arquivado.
export const awaitingDispatch = (p: Pick<ProcessInput, "dispatchStatus">) => p.dispatchStatus === "NÃO TEM DESPACHO";
export function changedFields(before: ProcessInput, after: ProcessInput) { return processFields.filter(k => (before[k] ?? "") !== (after[k] ?? "")); }
export const searchKey = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

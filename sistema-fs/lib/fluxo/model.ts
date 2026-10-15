import { z } from "zod";
import { isValidCnpj, normalizeCnpj } from "../diagnostico/model";

// Fluxograma de etapas do cliente (outubro/2026): Comercial → Cadastro → Controller → Jurídico.
// O CNPJ identifica o cliente e fica em uma única área e subetapa por vez.
export const sectors = ["comercial", "cadastro", "controller", "juridico"] as const;
export type Sector = (typeof sectors)[number];
export const sectorLabels: Record<Sector, string> = { comercial: "Comercial", cadastro: "Cadastro", controller: "Controller", juridico: "Jurídico" };
// Tela do sistema onde cada área trabalha.
export const sectorScreens: Record<Sector, string> = { comercial: "/comercial", cadastro: "/administrativo", controller: "/controller", juridico: "/juridico" };
// approval: subetapa de aprovação; quem não aprova na área pode levar o cartão até ela, mas não tirá-lo dela nem passar adiante.
export type Substage = { id: string; label: string; hint?: string; approval?: boolean };
export const substages: Record<Sector, Substage[]> = {
  // Mesmos ids das etapas do funil do Comercial (lib/comercial/model.ts).
  comercial: [
    { id: "novos-contatos", label: "Novos contatos" },
    { id: "qualificacao", label: "Em qualificação" },
    { id: "proposta", label: "Proposta enviada" },
    { id: "negociacao", label: "Negociação" },
  ],
  cadastro: [
    { id: "pendente-documentacao", label: "Pendente de documentação" },
    { id: "documentacao-completa", label: "Documentação completa" },
  ],
  controller: [
    { id: "aguardando-protocolo", label: "Aguardando protocolo" },
    { id: "analise-chefia-protocolo", label: "Análise Chefia", hint: "antes do protocolo" },
    { id: "pendente-receita", label: "Pendente Receita" },
    { id: "tem-despacho", label: "Tem Despacho" },
    { id: "analise-chefia-despacho", label: "Análise Chefia", hint: "após o despacho" },
  ],
  juridico: [
    { id: "pre-analise", label: "Pré-análise" },
    { id: "analise-chefia", label: "Análise da chefia", approval: true },
    { id: "ajuizado", label: "Ajuizado" },
  ],
};
export const isSector = (value: unknown): value is Sector => typeof value === "string" && (sectors as readonly string[]).includes(value);
export const substageOf = (sector: Sector, id: string) => substages[sector].find(s => s.id === id);
export const substageLabel = (sector: Sector, id: string) => { const s = substageOf(sector, id); return s ? `${s.label}${s.hint ? ` (${s.hint})` : ""}` : id; };
export const firstSubstage = (sector: Sector) => substages[sector][0]!.id;
export const lastSubstage = (sector: Sector) => substages[sector].at(-1)!.id;
export const nextSector = (sector: Sector): Sector | null => sectors[sectors.indexOf(sector) + 1] ?? null;
export const previousSector = (sector: Sector): Sector | null => sectors[sectors.indexOf(sector) - 1] ?? null;
// Setores de cada pessoa, gravados como texto separado por vírgula; só valores conhecidos.
export const parseSectors = (value: string | null | undefined): Sector[] => [...new Set((value ?? "").split(",").map(v => v.trim()).filter(isSector))];

export type FlowCard = {
  cnpj: string; company: string; sector: Sector; substage: string;
  enteredAt: string; substageAt: string; updatedAt: string; updatedBy: string; ownerId: string | null;
};
export type FlowHistory = { id: string; fromSector: Sector | null; fromSubstage: string | null; toSector: Sector; toSubstage: string; actor: string; note: string; createdAt: string };

const cnpj = z.string().max(18).transform(normalizeCnpj).refine(isValidCnpj, "CNPJ inválido");
const note = z.string().trim().max(500).refine(s => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s)).default("");
export const moveSchema = z.object({ cnpj, substage: z.string().min(1).max(60), version: z.string().max(40) });
// Mudar de área: "proximo" exige a última subetapa concluída; "anterior" devolve à área anterior com justificativa.
export const advanceSchema = z.object({ cnpj, version: z.string().max(40), direction: z.enum(["proximo", "anterior"]).default("proximo"), note })
  .refine(d => d.direction === "proximo" || d.note.length >= 3, "Explique por que o cliente volta para a área anterior.");
export const sectorsSchema = z.object({ userId: z.string().min(1).max(100), sectors: z.array(z.enum(sectors)).max(sectors.length) });
// Tempo na subetapa em texto curto ("hoje", "há 3 dias").
export function since(iso: string, now = Date.now()) {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "hoje" : days === 1 ? "há 1 dia" : `há ${days} dias`;
}
// Movimento que exige quem aprova na área: sair da subetapa de aprovação (ou de depois dela) ou ir além dela.
export function needsApproval(sector: Sector, from: string, to: string) {
  const list = substages[sector], gate = list.findIndex(s => s.approval);
  if (gate < 0) return false;
  const a = list.findIndex(s => s.id === from), b = list.findIndex(s => s.id === to);
  return a >= gate || b > gate;
}
// Cartão já na subetapa de aprovação (ou depois): só quem aprova na área move.
export function atOrPastApproval(sector: Sector, id: string) {
  const list = substages[sector], gate = list.findIndex(s => s.approval);
  return gate >= 0 && list.findIndex(s => s.id === id) >= gate;
}

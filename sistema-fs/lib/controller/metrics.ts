import { awaitingDispatch, daysUntil, today, type ControllerProcess } from "./model";

type Countable = Pick<ControllerProcess, "company" | "cnpj" | "admStatus" | "protocolDate" | "deadline" | "dispatchStatus" | "notes" | "reviewState" | "updatedOn">;
const tally = (values: string[]) => [...values.reduce((map, v) => map.set(v, (map.get(v) ?? 0) + 1), new Map<string, number>())].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
// Indicadores calculados somente a partir dos registros do Controller; sem registro, o indicador é zero de verdade.
export function controllerMetrics(processes: Countable[], now = today()) {
  const open = processes.filter(awaitingDispatch);
  const months = new Map<string, number>();
  for (const p of processes) if (p.protocolDate) months.set(p.protocolDate.slice(0, 7), (months.get(p.protocolDate.slice(0, 7)) ?? 0) + 1);
  return {
    total: processes.length,
    companies: new Set(processes.map(p => p.cnpj)).size,
    awaiting: open.length,
    dispatched: processes.filter(p => p.dispatchStatus === "TEM DESPACHO").length,
    archived: processes.filter(p => p.dispatchStatus === "ARQUIVADO").length,
    // Contagem encerrada sem despacho da Receita.
    overdue: open.filter(p => (daysUntil(p.deadline, now) ?? 0) < 0).length,
    dueSoon: open.filter(p => { const d = daysUntil(p.deadline, now); return d !== null && d >= 0 && d <= 7; }).length,
    pendingReview: processes.filter(p => p.reviewState === "pendente").length,
    adjustments: processes.filter(p => p.reviewState === "ajustes").length,
    lastUpdate: processes.map(p => p.updatedOn ?? "").sort().at(-1) || null,
    byDispatch: tally(processes.map(p => p.dispatchStatus)),
    byAdmStatus: tally(processes.map(p => p.admStatus)),
    byNotes: tally(processes.map(p => p.notes.trim().toUpperCase() || "SEM OBSERVAÇÃO")),
    byMonth: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })),
  };
}
export type ControllerMetrics = ReturnType<typeof controllerMetrics>;
// Processos sem despacho ordenados pela contagem mais próxima (vencidas primeiro).
export function deadlineQueue<T extends Countable>(processes: T[]) { return processes.filter(p => awaitingDispatch(p) && p.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!)); }

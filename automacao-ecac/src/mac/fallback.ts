import type { AppConfig } from "../config.js";
import type { MacJob } from "../domain/types.js";
import type { AppLogger } from "../logger.js";
import type { PendingRequestStore } from "../orchestrator/pending-request-store.js";
import type { WhatsAppGateway } from "../whatsapp/client.js";
import { formatCnpj } from "../orchestrator/service.js";
import type { MacJobQueue } from "./queue.js";

// Quando a análise trava no Mac, o solicitante pode trocar pela consulta do Serpro (cobrada), sempre mediante SIM.
// Etapas do Mac que significam "travou": falha, coleta incompleta, login pendente ou empresa não autorizada no Mac.
export const MAC_STUCK_STATUSES = ["falhou", "coleta_incompleta", "aguardando_login", "aguardando_permissao"];
// Pedido que ainda pode virar Serpro: não entregue, não cancelado e, se encerrado, encerrado por falha.
export const serproEligible = (job: MacJob) => !job.deliveredAt && job.state !== "cancelled" && (job.state !== "done" || MAC_STUCK_STATUSES.includes(job.status));
export interface FallbackDeps { config: AppConfig; queue: MacJobQueue; pending: PendingRequestStore; whatsapp: WhatsAppGateway; logger: AppLogger }

// Oferece uma única vez por pedido. Devolve true quando a oferta foi enviada.
export async function offerSerpro(deps: FallbackDeps, job: MacJob, reason: string, now = Date.now()) {
  const { config, queue, pending, whatsapp, logger } = deps;
  if (config.FISCAL_DATA_PROVIDER !== "serpro" || job.fallbackOfferedAt || !serproEligible(job)) return false;
  job.fallbackOfferedAt = new Date(now).toISOString(); await queue.save(job);
  await pending.set(job.requesterPhone, { kind: "serpro-fallback", macJobId: job.id, parsed: { cnpj: job.cnpj, period: new Date(now).toISOString().slice(0, 7), documentType: "diagnostico_fiscal" } }, 24 * 3600);
  const keep = job.state === "done" ? "NÃO para deixar com a equipe" : "NÃO para continuar esperando o Mac";
  await whatsapp.sendText(job.requesterPhone, `Pedido ${job.id} (${job.razao || formatCnpj(job.cnpj)}) ${reason}. Posso fazer a consulta pelo Serpro agora? Ela traz a Situação Fiscal da Receita pelo Integra Contador (consulta cobrada; exige procuração da empresa para a FS); o relatório detalhado da PGFN fica de fora. Responda SIM para fazer pelo Serpro ou ${keep}.`)
    .catch((error: unknown) => logger.warn({ err: error, jobId: job.id }, "fallback offer failed"));
  return true;
}

// Varredura periódica: pedido esperando o Mac além do prazo, ou já com o Mac e sem nenhuma etapa nova há muito tempo.
export async function offerSerproFallback(config: AppConfig, queue: MacJobQueue, pending: PendingRequestStore, whatsapp: WhatsAppGateway, logger: AppLogger, now = Date.now()) {
  const deps = { config, queue, pending, whatsapp, logger };
  let offered = 0;
  for (const job of await queue.list()) {
    if (job.fallbackOfferedAt) continue;
    if (job.state === "pending" && config.MAC_FALLBACK_AFTER_MS && now - Date.parse(job.createdAt) >= config.MAC_FALLBACK_AFTER_MS) {
      if (await offerSerpro(deps, job, `está há mais de ${Math.round(config.MAC_FALLBACK_AFTER_MS / 3_600_000)} h aguardando o Mac da FS`, now)) offered += 1;
    } else if (job.state === "inflight" && config.MAC_STALL_AFTER_MS && now - Date.parse(job.statusAt ?? job.leasedAt ?? job.createdAt) >= config.MAC_STALL_AFTER_MS) {
      if (await offerSerpro(deps, job, `está parado no Mac da FS há mais de ${Math.round(config.MAC_STALL_AFTER_MS / 60_000)} min sem avançar`, now)) offered += 1;
    }
  }
  return offered;
}
export function startFallbackWatch(config: AppConfig, queue: MacJobQueue, pending: PendingRequestStore, whatsapp: WhatsAppGateway, logger: AppLogger) {
  const timer = setInterval(() => void offerSerproFallback(config, queue, pending, whatsapp, logger).catch((error: unknown) => logger.warn({ err: error }, "fallback watch failed")), 60 * 1000);
  return () => clearInterval(timer);
}

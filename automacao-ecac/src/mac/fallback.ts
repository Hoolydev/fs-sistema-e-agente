import type { AppConfig } from "../config.js";
import type { AppLogger } from "../logger.js";
import type { PendingRequestStore } from "../orchestrator/pending-request-store.js";
import type { WhatsAppGateway } from "../whatsapp/client.js";
import { formatCnpj } from "../orchestrator/service.js";
import type { MacJobQueue } from "./queue.js";

// Pedido parado na fila (Mac desligado ou sem login) além do prazo: oferece a consulta preliminar pelo Serpro, cobrada, mediante SIM.
export async function offerSerproFallback(config: AppConfig, queue: MacJobQueue, pending: PendingRequestStore, whatsapp: WhatsAppGateway, logger: AppLogger, now = Date.now()) {
  if (!config.MAC_FALLBACK_AFTER_MS || config.FISCAL_DATA_PROVIDER !== "serpro") return 0;
  let offered = 0;
  for (const job of await queue.list()) {
    if (job.state !== "pending" || job.fallbackOfferedAt || now - Date.parse(job.createdAt) < config.MAC_FALLBACK_AFTER_MS) continue;
    const hours = Math.round(config.MAC_FALLBACK_AFTER_MS / 3_600_000);
    job.fallbackOfferedAt = new Date(now).toISOString(); await queue.save(job);
    await pending.set(job.requesterPhone, { kind: "serpro-fallback", macJobId: job.id, parsed: { cnpj: job.cnpj, period: new Date(now).toISOString().slice(0, 7), documentType: "diagnostico_fiscal" } }, 24 * 3600);
    await whatsapp.sendText(job.requesterPhone, `Pedido ${job.id} (${job.razao || formatCnpj(job.cnpj)}) está há mais de ${hours} h aguardando o Mac da FS. Posso fazer a consulta preliminar pelo Serpro (dívida ativa + cadastro, consulta cobrada; a Situação Fiscal RFB fica pendente)? Responda SIM para fazer agora ou NÃO para continuar esperando o Mac.`).catch((error: unknown) => logger.warn({ err: error, jobId: job.id }, "fallback offer failed"));
    offered += 1;
  }
  return offered;
}
export function startFallbackWatch(config: AppConfig, queue: MacJobQueue, pending: PendingRequestStore, whatsapp: WhatsAppGateway, logger: AppLogger) {
  const timer = setInterval(() => void offerSerproFallback(config, queue, pending, whatsapp, logger).catch((error: unknown) => logger.warn({ err: error }, "fallback watch failed")), 5 * 60 * 1000);
  return () => clearInterval(timer);
}

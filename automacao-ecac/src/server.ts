import { SystemDocumentClient } from "./system/documents.js";
import { existsSync } from "node:fs";
import process from "node:process";
import { Redis } from "ioredis";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { OrchestratorService } from "./orchestrator/service.js";
import { RedisPendingRequestStore } from "./orchestrator/pending-request-store.js";
import { BullMqRequestPublisher, redisConnectionFromUrl } from "./queue/request-queue.js";
import { createWhatsAppGateway } from "./whatsapp/client.js";
import { SystemPlatform } from "./system/platform.js";
import { RedisMacJobQueue } from "./mac/queue.js";
import { startFallbackWatch } from "./mac/fallback.js";
import { startNotificationPoller } from "./notifications/poller.js";
import { BullMqSitfisPublisher } from "./sistema/sitfis.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MacJob } from "./domain/types.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const publisher = new BullMqRequestPublisher(redisConnectionFromUrl(config.REDIS_URL));
const stateRedis = new Redis(redisConnectionFromUrl(config.REDIS_URL));
const whatsapp = createWhatsAppGateway(config, logger);
const pendingRequests = new RedisPendingRequestStore(stateRedis);
const systemConfigured = Boolean(config.FS_SYSTEM_URL && config.FS_SYSTEM_API_TOKEN);
const documents = systemConfigured ? new SystemDocumentClient(config, whatsapp) : undefined;
const platform = systemConfigured ? new SystemPlatform(config) : undefined;
// Fila do Mac só existe com o token do conector configurado; sem ele, pedidos seguem pelo worker (Serpro/RPA).
const macQueue = config.MAC_BRIDGE_TOKEN ? new RedisMacJobQueue(stateRedis) : undefined;
const orchestrator = new OrchestratorService({ config, queue: publisher, whatsapp, pendingRequests, logger, ...(documents ? { archive: documents } : {}), ...(platform ? { platform } : {}), ...(macQueue ? { macQueue } : {}) });
const macArchive = documents ? {
  // Parecer vindo do Mac entra no acervo pelo mesmo caminho dos pareceres do worker (protocolo = id do pedido).
  async archivePdf(job: MacJob, content: Buffer, filename: string) {
    const folder = await mkdtemp(join(tmpdir(), "fs-mac-archive-")), localPath = join(folder, filename);
    try {
      await writeFile(localPath, content, { mode: 0o600 });
      await documents.archive({ requestId: job.id, sourceMessageId: job.id, requesterPhone: job.requesterPhone, cnpj: job.cnpj, period: job.createdAt.slice(0, 7), documentType: "diagnostico_fiscal" }, { localPath, filename, mimeType: "application/pdf", sha256: job.sha256 ?? "", obtainedAt: new Date().toISOString() });
    } finally { await rm(folder, { recursive: true, force: true }).catch(() => {}); }
  },
} : undefined;
// SITFIS só com o sistema configurado e o Integra Contador ativo neste agente.
const sitfis = systemConfigured && config.SERPRO_ENABLED ? new BullMqSitfisPublisher(redisConnectionFromUrl(config.REDIS_URL)) : undefined;
const app = await buildApp({ config, logger, orchestrator, ...(sitfis ? { sitfis } : {}), ...(macQueue ? { mac: { queue: macQueue, whatsapp, ...(platform ? { platform } : {}), ...(macArchive ? { archive: macArchive } : {}) } } : {}) });
const stopPoller = platform ? startNotificationPoller(platform, whatsapp, logger, config.NOTIFICATIONS_POLL_MS) : undefined;
const stopFallback = macQueue ? startFallbackWatch(config, macQueue, pendingRequests, whatsapp, logger) : undefined;

app.addHook("onClose", async () => {
  stopPoller?.(); stopFallback?.(); await sitfis?.close();
  await publisher.close();
  await stateRedis.quit();
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down api");
  await app.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: "0.0.0.0", port: config.PORT });

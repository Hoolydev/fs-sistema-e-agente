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

if (existsSync(".env")) process.loadEnvFile(".env");

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const publisher = new BullMqRequestPublisher(redisConnectionFromUrl(config.REDIS_URL));
const stateRedis = new Redis(redisConnectionFromUrl(config.REDIS_URL));
const whatsapp = createWhatsAppGateway(config, logger);
const pendingRequests = new RedisPendingRequestStore(stateRedis);
const orchestrator = new OrchestratorService(
  config,
  publisher,
  whatsapp,
  pendingRequests,
  logger,
  config.FS_SYSTEM_URL && config.FS_SYSTEM_API_TOKEN ? new SystemDocumentClient(config, whatsapp) : undefined,
);
const app = await buildApp({ config, logger, orchestrator });

app.addHook("onClose", async () => {
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

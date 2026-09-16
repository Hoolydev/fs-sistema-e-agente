import { SystemDocumentClient } from "./system/documents.js";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import process from "node:process";
import { Worker, UnrecoverableError } from "bullmq";
import { loadConfig } from "./config.js";
import type { RpaRequest } from "./domain/types.js";
import { createLogger } from "./logger.js";
import { OpenAIFiscalAnalysisGateway } from "./llm/openai-analysis.js";
import { REQUEST_QUEUE, redisConnectionFromUrl } from "./queue/request-queue.js";
import { HumanInterventionRequired, type EcacAutomation } from "./rpa/automation.js";
import { EcacPlaywrightAutomation } from "./rpa/ecac-playwright.js";
import { SerproFiscalAutomation } from "./serpro/automation.js";
import { assertSerproConfiguration, SerproError, SerproSitfisClient } from "./serpro/client.js";
import { MockEcacAutomation } from "./rpa/mock-automation.js";
import {
  LocalCertificateProvider,
  VaultCertificateProvider,
  type CertificateProvider,
} from "./security/certificate-provider.js";
import {
  LocalDocumentStore,
  S3DocumentStore,
  type DocumentStore,
} from "./storage/document-store.js";
import { createWhatsAppGateway } from "./whatsapp/client.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const whatsapp = createWhatsAppGateway(config, logger);
const certificateProvider: CertificateProvider =
  config.CERTIFICATE_PROVIDER === "vault"
    ? new VaultCertificateProvider()
    : new LocalCertificateProvider(config);
const fiscalAnalysis = new OpenAIFiscalAnalysisGateway(config);
const automation: EcacAutomation =
  config.FISCAL_DATA_PROVIDER === "serpro"
    ? new SerproFiscalAutomation(new SerproSitfisClient(config, certificateProvider), fiscalAnalysis)
    : config.RPA_MODE === "ecac"
    ? new EcacPlaywrightAutomation(
        config,
        certificateProvider,
        fiscalAnalysis,
        logger,
        async (request) => {
          await whatsapp.sendText(
            request.requesterPhone,
            `A solicitação ${request.requestId} está aguardando a resolução manual do CAPTCHA na sessão remota do e-CAC. Após a confirmação, o processamento continuará automaticamente.`,
          );
        },
      )
    : new MockEcacAutomation();
const store: DocumentStore =
  config.DOCUMENT_STORAGE_MODE === "s3"
    ? new S3DocumentStore(config)
    : new LocalDocumentStore(config.LOCAL_DOCUMENT_DIR);

const worker = new Worker<RpaRequest, { status: string; storageKey?: string }>(
  REQUEST_QUEUE,
  async (job) => {
    logger.info({ jobId: job.id, requestId: job.data.requestId }, "rpa job started");
    await job.updateProgress(10);
    let temporaryPath: string | undefined;
    try {
      if (config.FISCAL_DATA_PROVIDER === "serpro") {
        assertSerproConfiguration(config);
        if (job.data.serproAttemptStarted) {
          throw new SerproError("attempt_already_started", "Esta solicitação já iniciou uma consulta Serpro. A equipe precisa revisar antes de repetir.");
        }
        // Durable guard: retries or a stalled worker must not silently repeat billable calls.
        await job.updateData({ ...job.data, serproAttemptStarted: true });
      }
      const result = await automation.obtainDocument(job.data);
      temporaryPath = result.localPath;
      await job.updateProgress(70);
      const stored = await store.save(job.data, result);
      if (config.FS_SYSTEM_URL && config.FS_SYSTEM_API_TOKEN && (config.FISCAL_DATA_PROVIDER === "serpro" || config.RPA_MODE !== "mock")) {
        try { await new SystemDocumentClient(config, whatsapp).archive(job.data, result); }
        catch { throw new UnrecoverableError("Documento preservado no armazenamento do agente, mas o envio ao acervo falhou. Reconciliar pelo protocolo sem repetir a análise."); }
      }
      await job.updateProgress(85);
      await whatsapp.sendDocument(
        job.data.requesterPhone,
        result.localPath,
        result.filename,
        `Documento solicitado. Protocolo ${job.data.requestId}. ${result.deliveryNote ?? ""}`.trim(),
      );
      await job.updateProgress(100);
      logger.info(
        { jobId: job.id, requestId: job.data.requestId, storageKey: stored.key },
        "rpa job completed",
      );
      return { status: "completed", storageKey: stored.key };
    } catch (error) {
      if (config.FISCAL_DATA_PROVIDER === "serpro") {
        const code = error instanceof SerproError ? error.code : "processing_failed";
        const message = error instanceof SerproError ? error.message
          : "Não foi possível concluir o relatório ou a entrega. A equipe precisa revisar esta solicitação.";
        logger.warn({ jobId: job.id, code }, "Serpro request stopped without automatic retry");
        await whatsapp.sendText(job.data.requesterPhone, `Solicitação ${job.data.requestId}: ${message}`)
          .catch(() => logger.warn({ jobId: job.id }, "Failed to notify Serpro request status"));
        throw new UnrecoverableError(`Serpro: ${code}`);
      }
      if (error instanceof HumanInterventionRequired) {
        logger.warn(
          { jobId: job.id, requestId: job.data.requestId, reason: error.reason },
          "rpa job requires human intervention",
        );
        await whatsapp.sendText(
          job.data.requesterPhone,
          `A solicitação ${job.data.requestId} precisa de análise da equipe. Você será avisado quando ela continuar.`,
        );
        return { status: "human_intervention" };
      }
      throw error;
    } finally {
      if (temporaryPath) {
        await rm(temporaryPath, { force: true }).catch((error: unknown) => {
          logger.warn({ err: error, jobId: job.id }, "temporary document cleanup failed");
        });
      }
    }
  },
  {
    connection: redisConnectionFromUrl(config.REDIS_URL),
    concurrency: config.FISCAL_DATA_PROVIDER === "serpro" || config.ECAC_CDP_URL ? 1 : 2,
    lockDuration:
      config.RPA_JOB_TIMEOUT_MS + config.HUMAN_INTERVENTION_TIMEOUT_MS + 30_000,
  },
);

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, err: error }, "rpa job failed");
});
worker.on("error", (error) => logger.error({ err: error }, "worker error"));

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down worker");
  await worker.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

logger.info({ provider: config.FISCAL_DATA_PROVIDER, serproEnabled: config.SERPRO_ENABLED, mode: config.RPA_MODE }, "rpa worker started");

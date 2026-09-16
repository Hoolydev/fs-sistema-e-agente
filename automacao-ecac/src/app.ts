import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import rawBody from "fastify-raw-body";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { AppLogger } from "./logger.js";
import type { OrchestratorService } from "./orchestrator/service.js";
import { extractInboundMessages, extractZApiInboundMessages } from "./whatsapp/payload.js";
import { verifyMetaSignature } from "./whatsapp/signature.js";

const verificationQuery = z.object({
  "hub.mode": z.string(),
  "hub.verify_token": z.string(),
  "hub.challenge": z.string(),
});

export interface AppDependencies {
  config: AppConfig;
  logger: AppLogger;
  orchestrator: Pick<OrchestratorService, "handle">;
  readiness?: () => Promise<boolean>;
}

export async function buildApp(dependencies: AppDependencies) {
  const { config, logger, orchestrator } = dependencies;
  const app = Fastify({ loggerInstance: logger });
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: false,
    runFirst: true,
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_request, reply) => {
    const ready = (await dependencies.readiness?.()) ?? true;
    return reply.code(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready" });
  });

  app.get("/webhooks/whatsapp", async (request, reply) => {
    if (config.WHATSAPP_PROVIDER !== "meta") {
      return reply.code(404).send({ error: "provider_disabled" });
    }
    const parsed = verificationQuery.safeParse(request.query);
    if (
      !parsed.success ||
      parsed.data["hub.mode"] !== "subscribe" ||
      parsed.data["hub.verify_token"] !== config.WHATSAPP_VERIFY_TOKEN
    ) {
      return reply.code(403).send({ error: "verification_failed" });
    }
    return reply.type("text/plain").send(parsed.data["hub.challenge"]);
  });

  app.post(
    "/webhooks/whatsapp",
    { config: { rawBody: true } },
    async (request, reply) => {
      if (config.WHATSAPP_PROVIDER !== "meta") {
        return reply.code(404).send({ error: "provider_disabled" });
      }
      const raw = request.rawBody;
      const signature = headerValue(request.headers["x-hub-signature-256"]);
      if (!raw || !verifyMetaSignature(Buffer.from(raw), signature, config.WHATSAPP_APP_SECRET)) {
        request.log.warn("invalid whatsapp webhook signature");
        return reply.code(401).send({ error: "invalid_signature" });
      }

      const messages = extractInboundMessages(request.body);
      reply.code(200).send({ received: true });

      for (const message of messages) {
        void orchestrator.handle(message).catch((error: unknown) => {
          request.log.error({ err: error, messageId: message.messageId }, "inbound message failed");
        });
      }
    },
  );

  app.post<{ Params: { token: string } }>(
    "/webhooks/zapi/:token",
    { logLevel: "silent" },
    async (request, reply) => {
      if (config.WHATSAPP_PROVIDER !== "zapi") {
        return reply.code(404).send({ error: "provider_disabled" });
      }
      if (!secureEquals(request.params.token, config.ZAPI_WEBHOOK_TOKEN)) {
        return reply.code(401).send({ error: "invalid_webhook_token" });
      }

      const messages = extractZApiInboundMessages(request.body, config.ZAPI_INSTANCE_ID);
      if (messages.length === 0 && !hasExpectedZApiInstance(request.body, config.ZAPI_INSTANCE_ID)) {
        return reply.code(401).send({ error: "invalid_instance" });
      }
      reply.code(200).send({ received: true });
      dispatchMessages(messages, orchestrator, logger);
    },
  );

  app.post<{ Params: { token: string } }>(
    "/webhooks/zapi/:token/disconnected",
    { logLevel: "silent" },
    async (request, reply) => {
      if (config.WHATSAPP_PROVIDER !== "zapi") {
        return reply.code(404).send({ error: "provider_disabled" });
      }
      if (!secureEquals(request.params.token, config.ZAPI_WEBHOOK_TOKEN)) {
        return reply.code(401).send({ error: "invalid_webhook_token" });
      }
      if (!hasExpectedZApiInstance(request.body, config.ZAPI_INSTANCE_ID)) {
        return reply.code(401).send({ error: "invalid_instance" });
      }

      const payload = request.body as { error?: string; disconnected?: boolean; type?: string };
      if (payload.type === "DisconnectedCallback" || payload.disconnected) {
        logger.error({ reason: payload.error }, "z-api whatsapp session disconnected");
      }
      return reply.code(200).send({ received: true });
    },
  );

  return app;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function secureEquals(received: string, expected: string): boolean {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function hasExpectedZApiInstance(payload: unknown, expectedInstanceId: string): boolean {
  if (!expectedInstanceId || typeof payload !== "object" || payload === null) return false;
  return (payload as { instanceId?: unknown }).instanceId === expectedInstanceId;
}

function dispatchMessages(
  messages: ReturnType<typeof extractInboundMessages>,
  orchestrator: Pick<OrchestratorService, "handle">,
  logger: AppLogger,
): void {
  for (const message of messages) {
    void orchestrator.handle(message).catch((error: unknown) => {
      logger.error({ err: error, messageId: message.messageId }, "inbound message failed");
    });
  }
}

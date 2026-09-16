import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";

const config = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  WHATSAPP_VERIFY_TOKEN: "verify-token",
  WHATSAPP_APP_SECRET: "app-secret-value",
  WHATSAPP_DRY_RUN: "true",
  META_GRAPH_API_VERSION: "v25.0",
  DATABASE_URL: "postgres://ecac:ecac@localhost:5432/ecac",
  REDIS_URL: "redis://localhost:6379",
  ECAC_LOGIN_URL: "https://example.gov.br/login",
});

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("WhatsApp webhook", () => {
  it("answers Meta verification challenge", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=12345",
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("12345");
  });

  it("rejects an invalid webhook signature", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: { "x-hub-signature-256": `sha256=${"0".repeat(64)}` },
      payload: { object: "whatsapp_business_account" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("accepts a correctly signed webhook", async () => {
    const app = await createTestApp();
    const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const signature = createHmac("sha256", config.WHATSAPP_APP_SECRET).update(raw).digest("hex");
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${signature}`,
      },
      payload: raw,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
  });
});

describe("Z-API webhook", () => {
  const zapiConfig = loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    WHATSAPP_PROVIDER: "zapi",
    WHATSAPP_DRY_RUN: "true",
    ZAPI_INSTANCE_ID: "instance-123",
    ZAPI_WEBHOOK_TOKEN: "webhook-token-with-enough-entropy",
    DATABASE_URL: "postgres://ecac:ecac@localhost:5432/ecac",
    REDIS_URL: "redis://localhost:6379",
    ECAC_LOGIN_URL: "https://example.gov.br/login",
  });

  it("accepts a valid callback and dispatches the message", async () => {
    const handled: string[] = [];
    const app = await buildApp({
      config: zapiConfig,
      logger: createLogger("silent"),
      orchestrator: {
        handle: async (message) => {
          handled.push(message.messageId);
        },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: `/webhooks/zapi/${zapiConfig.ZAPI_WEBHOOK_TOKEN}`,
      payload: {
        instanceId: "instance-123",
        messageId: "zapi-message-1",
        phone: "5562999999999",
        fromMe: false,
        momment: 1_788_900_000_000,
        type: "ReceivedCallback",
        text: { message: "situação fiscal" },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(handled).toEqual(["zapi-message-1"]);
  });

  it("rejects an invalid webhook token", async () => {
    const app = await buildApp({
      config: zapiConfig,
      logger: createLogger("silent"),
      orchestrator: { handle: async () => undefined },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/zapi/token-invalido",
      payload: { instanceId: "instance-123" },
    });
    expect(response.statusCode).toBe(401);
  });
});

async function createTestApp() {
  const app = await buildApp({
    config,
    logger: createLogger("silent"),
    orchestrator: { handle: async () => undefined },
  });
  apps.push(app);
  return app;
}

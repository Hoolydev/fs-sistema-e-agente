import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { startNotificationPoller } from "../src/notifications/poller.js";
import type { Platform } from "../src/system/platform.js";
import type { WhatsAppGateway } from "../src/whatsapp/client.js";

const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", DATABASE_URL: "postgres://x:x@localhost:5432/x", REDIS_URL: "redis://localhost:6379", ECAC_LOGIN_URL: "https://example.gov.br/login", FS_SYSTEM_URL: "https://sistema.test", FS_SYSTEM_API_TOKEN: "sys-token" });

describe("avisos sem manter o banco acordado", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("rota /sistema/avisos exige o token do sistema e dispara a entrega", async () => {
    let triggered = 0;
    const app = await buildApp({ config, logger: createLogger("silent"), orchestrator: { handle: async () => {} }, notifications: { trigger: () => { triggered += 1; } } });
    expect((await app.inject({ method: "POST", url: "/sistema/avisos" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/sistema/avisos", headers: { authorization: "Bearer sys-token" } })).statusCode).toBe(202);
    expect(triggered).toBe(1);
    await app.close();
  });

  it("leitura de segurança só em horário comercial, a cada 30 min, e uma vez a partir das 08:00", async () => {
    vi.useFakeTimers();
    let calls = 0, clock = new Date("2026-10-19T05:00:00-03:00");
    const platform = { notifications: async () => { calls += 1; return []; }, acknowledge: async () => {} } as unknown as Platform;
    const poller = startNotificationPoller(platform, {} as WhatsAppGateway, createLogger("silent"), 1_800_000, () => clock);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1); // ao iniciar
    const at = async (iso: string) => { clock = new Date(iso); poller.check(); await vi.advanceTimersByTimeAsync(0); };
    await at("2026-10-19T05:40:00-03:00"); await at("2026-10-19T06:59:00-03:00");
    expect(calls).toBe(1); // madrugada: banco hiberna
    await at("2026-10-19T07:00:00-03:00"); expect(calls).toBe(2);
    await at("2026-10-19T07:20:00-03:00"); expect(calls).toBe(2);
    await at("2026-10-19T08:00:00-03:00"); expect(calls).toBe(3); // resumo diário
    await at("2026-10-19T08:10:00-03:00"); expect(calls).toBe(3);
    await at("2026-10-19T08:31:00-03:00"); expect(calls).toBe(4);
    poller.trigger(); await vi.advanceTimersByTimeAsync(0); expect(calls).toBe(5); // aviso novo: entrega na hora
    await at("2026-10-19T21:30:00-03:00"); await at("2026-10-19T23:30:00-03:00"); expect(calls).toBe(5);
    await at("2026-10-20T08:01:00-03:00"); expect(calls).toBe(6);
    poller.stop();
  });
});

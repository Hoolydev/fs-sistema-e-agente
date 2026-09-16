import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { ZApiWhatsAppGateway } from "../src/whatsapp/client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const config = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  WHATSAPP_PROVIDER: "zapi",
  WHATSAPP_DRY_RUN: "false",
  ZAPI_BASE_URL: "https://api.z-api.io",
  ZAPI_INSTANCE_ID: "instance-123",
  ZAPI_INSTANCE_TOKEN: "instance-token",
  ZAPI_CLIENT_TOKEN: "client-token",
  ZAPI_WEBHOOK_TOKEN: "webhook-token",
  DATABASE_URL: "postgres://ecac:ecac@localhost:5432/ecac",
  REDIS_URL: "redis://localhost:6379",
  ECAC_LOGIN_URL: "https://example.gov.br/login",
});

describe("ZApiWhatsAppGateway", () => {
  it("sends text with the required authentication header", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ messageId: "sent-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new ZApiWhatsAppGateway(config, createLogger("silent"));

    await expect(gateway.sendText("5562999999999", "Olá")).resolves.toBe("sent-1");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toContain("/instances/instance-123/token/instance-token/send-text");
    expect((init as RequestInit).headers).toMatchObject({ "Client-Token": "client-token" });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      phone: "5562999999999",
      message: "Olá",
    });
  });

  it("sends a PDF as Base64 without publishing a document URL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zapi-document-"));
    const path = join(directory, "parecer.pdf");
    await writeFile(path, Buffer.from("%PDF-test"));
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: "document-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new ZApiWhatsAppGateway(config, createLogger("silent"));

    try {
      await expect(
        gateway.sendDocument("5562999999999", path, "parecer.pdf", "Parecer concluído"),
      ).resolves.toBe("document-1");
      const [, init] = fetchMock.mock.calls[0] ?? [];
      const body = JSON.parse(String((init as RequestInit).body));
      expect(body.document).toMatch(/^data:application\/pdf;base64,/);
      expect(body.fileName).toBe("parecer.pdf");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

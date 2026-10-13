import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { EvolutionWhatsAppGateway } from "../src/whatsapp/client.js";
import { brazilianMobile, extractEvolutionInboundMessages } from "../src/whatsapp/payload.js";

const config = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  WHATSAPP_PROVIDER: "evolution",
  WHATSAPP_DRY_RUN: "false",
  EVOLUTION_BASE_URL: "http://fs-evolution-api-1:8080/",
  EVOLUTION_API_KEY: "evo-key",
  EVOLUTION_INSTANCE: "fs-agente",
  EVOLUTION_WEBHOOK_TOKEN: "evolution-webhook-token-with-entropy",
  DATABASE_URL: "postgres://ecac:ecac@localhost:5432/ecac",
  REDIS_URL: "redis://localhost:6379",
  ECAC_LOGIN_URL: "https://example.gov.br/login",
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const upsert = (data: Record<string, unknown>, instance = "fs-agente") => ({ event: "messages.upsert", instance, data: { messageTimestamp: 1_788_900_000, ...data } });

describe("EvolutionWhatsAppGateway", () => {
  it("envia texto com a apikey e devolve o id da mensagem", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => json({ key: { id: "EVO1" } }, 201));
    const gateway = new EvolutionWhatsAppGateway(config, createLogger("silent"), fetchMock as unknown as typeof fetch);
    await expect(gateway.sendText("5562999999999", "Olá")).resolves.toBe("EVO1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://fs-evolution-api-1:8080/message/sendText/fs-agente");
    expect(init?.headers).toMatchObject({ apikey: "evo-key" });
    expect(JSON.parse(String(init?.body))).toEqual({ number: "5562999999999", text: "Olá" });
  });

  it("envia PDF em Base64 como documento", async () => {
    const dir = await mkdtemp(join(tmpdir(), "evo-doc-"));
    const path = join(dir, "parecer.pdf");
    await writeFile(path, Buffer.from("%PDF-test"));
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => json({ key: { id: "EVO2" } }, 201));
    const gateway = new EvolutionWhatsAppGateway(config, createLogger("silent"), fetchMock as unknown as typeof fetch);
    await expect(gateway.sendDocument("5562999999999", path, "Parecer.pdf", "Segue")).resolves.toBe("EVO2");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/message/sendMedia/fs-agente");
    expect(JSON.parse(String(init?.body))).toMatchObject({ mediatype: "document", mimetype: "application/pdf", fileName: "Parecer.pdf", caption: "Segue", media: Buffer.from("%PDF-test").toString("base64") });
    await expect(gateway.sendDocument("5562999999999", path, "x.exe", "")).rejects.toThrow(/Extensão/);
  });

  it("não chama a Evolution em modo de teste", async () => {
    const fetchMock = vi.fn();
    const gateway = new EvolutionWhatsAppGateway({ ...config, WHATSAPP_DRY_RUN: true }, createLogger("silent"), fetchMock as unknown as typeof fetch);
    await expect(gateway.sendText("5562999999999", "Olá")).resolves.toMatch(/^dry-run-/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("baixa a mídia recebida pelo id e confere tipo e tamanho", async () => {
    const pdf = Buffer.from("%PDF-1.4 comprovante");
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => json({ base64: pdf.toString("base64"), mimetype: "application/pdf" }));
    const gateway = new EvolutionWhatsAppGateway(config, createLogger("silent"), fetchMock as unknown as typeof fetch);
    const media = await gateway.fetchMedia("evolution-media:3EB0ABCDEF123456", 1024);
    expect(media).toEqual({ content: pdf, mime: "application/pdf" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/chat/getBase64FromMediaMessage/fs-agente");
    expect(JSON.parse(String(init?.body))).toEqual({ message: { key: { id: "3EB0ABCDEF123456" } }, convertToMp4: false });
    await expect(gateway.fetchMedia("evolution-media:3EB0ABCDEF123456", 5)).rejects.toMatchObject({ code: "too_large" });
    await expect(gateway.fetchMedia("https://evil.example/x", 1024)).rejects.toMatchObject({ code: "download_failed" });
    const exe = vi.fn(async () => json({ base64: Buffer.from("MZ executável").toString("base64") }));
    await expect(new EvolutionWhatsAppGateway(config, createLogger("silent"), exe as unknown as typeof fetch).fetchMedia("evolution-media:3EB0ABCDEF123456", 1024)).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("extractEvolutionInboundMessages", () => {
  it("lê texto, foto e documento com legenda", () => {
    expect(extractEvolutionInboundMessages(upsert({ key: { id: "A1", remoteJid: "5562999999999@s.whatsapp.net", fromMe: false }, message: { conversation: "situação fiscal" } }), "fs-agente"))
      .toEqual([{ messageId: "A1", from: "5562999999999", timestamp: new Date(1_788_900_000_000), type: "text", text: "situação fiscal" }]);
    const [image] = extractEvolutionInboundMessages(upsert({ key: { id: "A2", remoteJid: "5562999999999@s.whatsapp.net" }, message: { imageMessage: { mimetype: "image/jpeg", caption: "CNPJ 01.573.657/0001-00" } } }), "fs-agente");
    expect(image).toMatchObject({ type: "image", media: { url: "evolution-media:A2", caption: "CNPJ 01.573.657/0001-00" } });
    const [doc] = extractEvolutionInboundMessages(upsert({ key: { id: "A3", remoteJid: "5562999999999@s.whatsapp.net" }, message: { documentWithCaptionMessage: { message: { documentMessage: { fileName: "comp.pdf", mimetype: "application/pdf", caption: "Honorio" } } } } }), "fs-agente");
    expect(doc).toMatchObject({ type: "document", media: { url: "evolution-media:A3", fileName: "comp.pdf", caption: "Honorio" } });
  });

  it("usa o número real quando o WhatsApp manda o identificador LID e completa o nono dígito", () => {
    const [m] = extractEvolutionInboundMessages(upsert({ key: { id: "B1", remoteJid: "123456789012345@lid", remoteJidAlt: "556299244600@s.whatsapp.net" }, message: { extendedTextMessage: { text: "oi" } } }), "fs-agente");
    expect(m?.from).toBe("5562999244600");
    expect(brazilianMobile("556232120000")).toBe("556232120000");
    expect(extractEvolutionInboundMessages(upsert({ key: { id: "B2", remoteJid: "123456789012345@lid" }, message: { conversation: "oi" } }), "fs-agente")).toEqual([]);
  });

  it("ignora grupos, status, mensagens próprias, outra instância e outros eventos", () => {
    const text = { conversation: "oi" };
    expect(extractEvolutionInboundMessages(upsert({ key: { id: "C1", remoteJid: "120363000000@g.us" }, message: text }), "fs-agente")).toEqual([]);
    expect(extractEvolutionInboundMessages(upsert({ key: { id: "C2", remoteJid: "status@broadcast" }, message: text }), "fs-agente")).toEqual([]);
    expect(extractEvolutionInboundMessages(upsert({ key: { id: "C3", remoteJid: "5562999999999@s.whatsapp.net", fromMe: true }, message: text }), "fs-agente")).toEqual([]);
    expect(extractEvolutionInboundMessages(upsert({ key: { id: "C4", remoteJid: "5562999999999@s.whatsapp.net" }, message: text }, "outra"), "fs-agente")).toEqual([]);
    expect(extractEvolutionInboundMessages({ event: "connection.update", instance: "fs-agente", data: { state: "open" } }, "fs-agente")).toEqual([]);
  });
});

describe("Webhook da Evolution", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
  const make = async (cfg = config) => {
    const handled: string[] = [];
    const app = await buildApp({ config: cfg, logger: createLogger("silent"), orchestrator: { handle: async (m) => { handled.push(m.messageId); } } });
    apps.push(app);
    return { app, handled };
  };
  const payload = upsert({ key: { id: "W1", remoteJid: "5562999999999@s.whatsapp.net" }, message: { conversation: "oi" } });

  it("aceita o token certo e entrega a mensagem ao orquestrador", async () => {
    const { app, handled } = await make();
    const response = await app.inject({ method: "POST", url: `/webhooks/evolution/${config.EVOLUTION_WEBHOOK_TOKEN}`, payload });
    expect(response.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(handled).toEqual(["W1"]);
  });

  it("recusa token errado, outra instância e provedor desligado", async () => {
    const { app } = await make();
    expect((await app.inject({ method: "POST", url: "/webhooks/evolution/errado", payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: `/webhooks/evolution/${config.EVOLUTION_WEBHOOK_TOKEN}`, payload: { ...payload, instance: "outra" } })).statusCode).toBe(401);
    const { app: zapi } = await make({ ...config, WHATSAPP_PROVIDER: "zapi" });
    expect((await zapi.inject({ method: "POST", url: `/webhooks/evolution/${config.EVOLUTION_WEBHOOK_TOKEN}`, payload })).statusCode).toBe(404);
  });
});

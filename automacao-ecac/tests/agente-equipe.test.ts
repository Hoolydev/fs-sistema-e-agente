import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { InboundMessage, RpaRequest } from "../src/domain/types.js";
import { createLogger } from "../src/logger.js";
import { offerSerproFallback } from "../src/mac/fallback.js";
import { InMemoryMacJobQueue, LEASE_MS } from "../src/mac/queue.js";
import { InMemoryPendingRequestStore } from "../src/orchestrator/pending-request-store.js";
import { OrchestratorService } from "../src/orchestrator/service.js";
import { deliverNotifications } from "../src/notifications/poller.js";
import type { RequestPublisher } from "../src/queue/request-queue.js";
import type { Platform, PendingNotification, TeamMember } from "../src/system/platform.js";
import type { WhatsAppGateway } from "../src/whatsapp/client.js";
import { extractZApiInboundMessages } from "../src/whatsapp/payload.js";

const fernando: TeamMember = { id: "u1", name: "Fernando", role: "admin", phone: "5562900000001", tasks: ["comprovantes", "analises", "avisos"] };
const samuel: TeamMember = { id: "u2", name: "Samuel", role: "operador", phone: "5562900000003", tasks: [] };
const leonardo: TeamMember = { id: "u3", name: "Leonardo", role: "advogado", phone: "5562900000002", tasks: ["avisos"] };
class FakePlatform implements Platform {
  receipts: unknown[] = []; acks: [string, boolean][] = []; queue: PendingNotification[] = [];
  async team() { return [fernando, samuel, leonardo]; }
  async member(phone: string) { return (await this.team()).find((m) => m.phone === phone) ?? null; }
  async companies(q: string) { return q.replace(/\D/g, "") === "51646813000194" || /rbe/i.test(q) ? [{ cnpj: "51646813000194", name: "RBE ENERGIA LTDA" }] : []; }
  async archiveReceipt(input: { cnpj: string; company: string; mime: string; note: string; content: Buffer }) { this.receipts.push(input); return { id: "doc_1", company: input.company }; }
  async notifications() { return this.queue; }
  async acknowledge(id: string, sent: boolean) { this.acks.push([id, sent]); this.queue = this.queue.filter((n) => n.id !== id); }
}
class FakeWhatsApp implements WhatsAppGateway { texts: [string, string][] = []; docs: string[] = []; async sendText(to: string, body: string) { this.texts.push([to, body]); return "m"; } async sendDocument(to: string) { this.docs.push(to); return "d"; } }
class FakePublisher implements RequestPublisher { requests: RpaRequest[] = []; async publish(message: InboundMessage, parsed: Parameters<RequestPublisher["publish"]>[1]) { const r: RpaRequest = { requestId: "serpro-1", sourceMessageId: message.messageId, requesterPhone: message.from, ...parsed }; this.requests.push(r); return r; } }
const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", WHATSAPP_DRY_RUN: "true", AUTHORIZED_PHONE_NUMBERS: "5562999999999", DATABASE_URL: "postgres://x:x@localhost:5432/x", REDIS_URL: "redis://localhost:6379", ECAC_LOGIN_URL: "https://example.gov.br/login", FISCAL_DATA_PROVIDER: "serpro", MAC_BRIDGE_TOKEN: "mac-token", MAC_FALLBACK_AFTER_MS: "7200000" });
const text = (from: string, body: string, id = `m-${Math.random()}`): InboundMessage => ({ messageId: id, from, timestamp: new Date(), type: "text", text: body });
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const fetcher = (async (url: string | URL | Request) => String(url).includes("big") ? new Response(Buffer.alloc(4 * 1024 * 1024), { status: 200 }) : String(url).includes("html") ? new Response("<html>", { status: 200 }) : new Response(png, { status: 200 })) as unknown as typeof fetch;
function build() {
  const platform = new FakePlatform(), whatsapp = new FakeWhatsApp(), publisher = new FakePublisher(), macQueue = new InMemoryMacJobQueue(), pending = new InMemoryPendingRequestStore();
  const service = new OrchestratorService({ config, queue: publisher, whatsapp, pendingRequests: pending, logger: createLogger("silent"), platform, macQueue, fetcher });
  return { platform, whatsapp, publisher, macQueue, pending, service };
}

describe("Z-API: fotos e arquivos", () => {
  it("extrai imagem e documento com legenda; ignora URL sem https", () => {
    const base = { type: "ReceivedCallback", instanceId: "inst", messageId: "1", phone: "5562900000001", momment: 1700000000000 };
    expect(extractZApiInboundMessages({ ...base, image: { imageUrl: "https://z-api/x.jpg", mimeType: "image/jpeg", caption: "RBE" } }, "inst")[0]).toMatchObject({ type: "image", media: { url: "https://z-api/x.jpg", caption: "RBE" } });
    expect(extractZApiInboundMessages({ ...base, document: { documentUrl: "https://z-api/x.pdf", mimeType: "application/pdf", fileName: "pix.pdf" } }, "inst")[0]).toMatchObject({ type: "document", media: { fileName: "pix.pdf" } });
    expect(extractZApiInboundMessages({ ...base, image: { imageUrl: "http://inseguro/x.jpg" } }, "inst")[0]?.type).toBe("unsupported");
  });
});
describe("atribuições por pessoa", () => {
  it("número fora da equipe é recusado; número da allowlist antiga ainda pede análise", async () => {
    const { service, whatsapp, pending } = build();
    await service.handle(text("5562000000000", "análise da empresa 51.646.813/0001-94"));
    expect(whatsapp.texts.at(-1)![1]).toContain("não está cadastrado");
    await service.handle(text("5562999999999", "faça uma análise da empresa 51.646.813/0001-94"));
    expect((await pending.get("5562999999999"))?.kind).toBe("analysis");
  });
  it("comprovante: só quem tem a atribuição; com legenda arquiva direto e avisa", async () => {
    const { service, whatsapp, platform } = build();
    const media = { url: "https://z-api/x.jpg", mimeType: "image/jpeg", caption: "RBE" };
    await service.handle({ messageId: "s1", from: samuel.phone, timestamp: new Date(), type: "image", media });
    expect(whatsapp.texts.at(-1)![1]).toContain("não está autorizado a enviar comprovantes"); expect(platform.receipts).toHaveLength(0);
    await service.handle({ messageId: "f1", from: fernando.phone, timestamp: new Date(), type: "image", media });
    expect(platform.receipts).toHaveLength(1); expect(platform.receipts[0]).toMatchObject({ cnpj: "51646813000194", company: "RBE ENERGIA LTDA", mime: "image/png", note: "RBE" });
    expect(whatsapp.texts.at(-1)![1]).toContain("Comprovante guardado no sistema para RBE ENERGIA LTDA");
  });
  it("comprovante sem empresa: pergunta, aceita CNPJ depois e permite descartar; arquivo grande ou inválido é recusado", async () => {
    const { service, whatsapp, platform, pending } = build();
    await service.handle({ messageId: "f2", from: fernando.phone, timestamp: new Date(), type: "document", media: { url: "https://z-api/x.pdf", mimeType: "application/pdf" } });
    expect(whatsapp.texts.at(-1)![1]).toContain("De qual empresa"); expect((await pending.get(fernando.phone))?.kind).toBe("receipt");
    await service.handle(text(fernando.phone, "Empresa Desconhecida"));
    expect(whatsapp.texts.at(-1)![1]).toContain("Não encontrei essa empresa");
    await service.handle(text(fernando.phone, "51646813000194"));
    expect(platform.receipts).toHaveLength(1); expect(await pending.get(fernando.phone)).toBeUndefined();
    await service.handle({ messageId: "f3", from: fernando.phone, timestamp: new Date(), type: "image", media: { url: "https://z-api/x.jpg", mimeType: "image/jpeg" } });
    await service.handle(text(fernando.phone, "não"));
    expect(whatsapp.texts.at(-1)![1]).toContain("descartado");
    await service.handle({ messageId: "f4", from: fernando.phone, timestamp: new Date(), type: "image", media: { url: "https://z-api/big.jpg", mimeType: "image/jpeg", caption: "RBE" } });
    expect(whatsapp.texts.at(-1)![1]).toContain("passa de 3 MB");
    await service.handle({ messageId: "f5", from: fernando.phone, timestamp: new Date(), type: "image", media: { url: "https://z-api/html.jpg", mimeType: "image/jpeg", caption: "RBE" } });
    expect(whatsapp.texts.at(-1)![1]).toContain("PDF, JPG ou PNG"); expect(platform.receipts).toHaveLength(1);
  });
  it("análise: quem não tem a atribuição é orientado; quem tem confirma e entra na fila do Mac", async () => {
    const { service, whatsapp, macQueue, publisher } = build();
    await service.handle(text(leonardo.phone, "faça uma análise da empresa 51.646.813/0001-94"));
    expect(whatsapp.texts.at(-1)![1]).toContain("não está autorizado a pedir análises");
    await service.handle(text(fernando.phone, "faça uma análise da empresa 51.646.813/0001-94", "msg-7"));
    expect(whatsapp.texts.at(-1)![1]).toContain("executada no Mac da FS");
    await service.handle(text(fernando.phone, "sim"));
    const jobs = await macQueue.list();
    expect(jobs).toHaveLength(1); expect(jobs[0]).toMatchObject({ id: "wa-msg-7", cnpj: "51646813000194", razao: "RBE ENERGIA LTDA", requesterPhone: fernando.phone, state: "pending" });
    expect(publisher.requests).toHaveLength(0); expect(whatsapp.texts.at(-1)![1]).toContain("fila do Mac");
  });
});
describe("fila do Mac e reserva Serpro", () => {
  it("reserva um pedido por vez e libera reserva vencida", async () => {
    const queue = new InMemoryMacJobQueue();
    const a = await queue.create({ cnpj: "51646813000194", razao: "RBE", requesterPhone: "1", requesterName: "F", operation: "analisar" }, "a");
    await queue.create({ cnpj: "51646813000194", razao: "RBE", requesterPhone: "1", requesterName: "F", operation: "analisar" }, "b");
    expect(await queue.create({ cnpj: "x", razao: "", requesterPhone: "1", requesterName: "F", operation: "analisar" }, "a")).toBe(a);
    const now = Date.now();
    expect((await queue.claim(now))?.id).toBe("a"); expect(await queue.claim(now + 1000)).toBeUndefined();
    expect((await queue.claim(now + LEASE_MS + 1))?.id).toBe("a"); expect((await queue.get("b"))?.state).toBe("pending");
  });
  it("pedido parado além do prazo recebe oferta Serpro; SIM cancela o Mac e publica no worker; NÃO mantém", async () => {
    const { service, whatsapp, macQueue, pending, publisher } = build();
    const job = await macQueue.create({ cnpj: "51646813000194", razao: "RBE", requesterPhone: fernando.phone, requesterName: "Fernando", operation: "analisar" }, "j1");
    expect(await offerSerproFallback(config, macQueue, pending, whatsapp, createLogger("silent"), Date.parse(job.createdAt) + 60_000)).toBe(0);
    expect(await offerSerproFallback(config, macQueue, pending, whatsapp, createLogger("silent"), Date.parse(job.createdAt) + 3 * 3_600_000)).toBe(1);
    expect(await offerSerproFallback(config, macQueue, pending, whatsapp, createLogger("silent"), Date.parse(job.createdAt) + 4 * 3_600_000)).toBe(0);
    expect(whatsapp.texts.at(-1)![1]).toContain("consulta cobrada");
    await service.handle(text(fernando.phone, "não"));
    expect(whatsapp.texts.at(-1)![1]).toContain("continua aguardando o Mac"); expect((await macQueue.get("j1"))?.state).toBe("pending");
    await pending.set(fernando.phone, { kind: "serpro-fallback", macJobId: "j1", parsed: { cnpj: "51646813000194", period: "2026-09", documentType: "diagnostico_fiscal" } });
    await service.handle(text(fernando.phone, "sim"));
    expect((await macQueue.get("j1"))?.state).toBe("cancelled"); expect(publisher.requests).toHaveLength(1); expect(whatsapp.texts.at(-1)![1]).toContain("Serpro iniciada");
  });
  it("endpoints do Mac: bearer obrigatório, etapas avisam uma vez, resultado arquiva, entrega e avisa revisores", async () => {
    const { platform, whatsapp, macQueue } = build();
    const archived: string[] = [];
    const app = await buildApp({ config, logger: createLogger("silent"), orchestrator: { handle: async () => {} }, mac: { queue: macQueue, whatsapp, platform, archive: { archivePdf: async (job, content) => { archived.push(`${job.id}:${content.length}`); } } } });
    await macQueue.create({ cnpj: "51646813000194", razao: "RBE ENERGIA LTDA", requesterPhone: fernando.phone, requesterName: "Fernando", operation: "analisar" }, "j2");
    expect((await app.inject({ method: "POST", url: "/mac/claim" })).statusCode).toBe(401);
    const auth = { authorization: "Bearer mac-token" };
    const claim = await app.inject({ method: "POST", url: "/mac/claim", headers: auth });
    expect(claim.json()).toMatchObject({ requestId: "j2", cnpj: "51646813000194", requesterPhone: fernando.phone });
    expect((await app.inject({ method: "POST", url: "/mac/claim", headers: auth })).statusCode).toBe(204);
    await app.inject({ method: "POST", url: "/mac/jobs/j2/status", headers: auth, payload: { status: "aguardando_login", note: "x" } });
    await app.inject({ method: "POST", url: "/mac/jobs/j2/status", headers: auth, payload: { status: "aguardando_login" } });
    expect(whatsapp.texts.filter(([, b]) => b.includes("login no e-CAC"))).toHaveLength(1);
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4 "), Buffer.alloc(200, 1)]).toString("base64");
    expect((await app.inject({ method: "POST", url: "/mac/jobs/j2/result", headers: auth, payload: { pdfBase64: Buffer.from("nope".repeat(40)).toString("base64") } })).statusCode).toBe(422);
    const result = await app.inject({ method: "POST", url: "/mac/jobs/j2/result", headers: auth, payload: { pdfBase64: pdf, filename: "Parecer RBE.pdf", coletaEm: "30/09/2026" } });
    expect(result.json()).toMatchObject({ delivered: true });
    expect(archived).toEqual(["j2:209"]); expect(whatsapp.docs).toEqual([fernando.phone]);
    expect(whatsapp.texts.some(([to, b]) => to === leonardo.phone && b.includes("Parecer de RBE ENERGIA LTDA pronto"))).toBe(true);
    expect((await app.inject({ method: "POST", url: "/mac/jobs/j2/result", headers: auth, payload: { pdfBase64: pdf } })).json()).toMatchObject({ deduped: true });
    expect((await macQueue.get("j2"))?.state).toBe("done");
    await app.close();
  });
});
describe("caixa de avisos", () => {
  it("entrega cada aviso e confirma; falha fica registrada sem travar os demais", async () => {
    const platform = new FakePlatform();
    platform.queue = [{ id: "n1", kind: "prazos", phone: "5562900000001", recipient: "Fernando", message: "Resumo" }, { id: "n2", kind: "revisao", phone: "falha", recipient: "X", message: "Y" }, { id: "n3", kind: "decisao", phone: "5562900000003", recipient: "Samuel", message: "Z" }];
    const whatsapp = new FakeWhatsApp(); whatsapp.sendText = async (to, body) => { if (to === "falha") throw new Error("z-api indisponível"); whatsapp.texts.push([to, body]); return "m"; };
    expect(await deliverNotifications(platform, whatsapp, createLogger("silent"))).toBe(2);
    expect(platform.acks).toEqual([["n1", true], ["n2", false], ["n3", true]]); expect(whatsapp.texts.map(([to]) => to)).toEqual(["5562900000001", "5562900000003"]);
  });
});

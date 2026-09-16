import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { SerproSitfisClient, decodeSerproPdf, type SerproHttpRequest } from "../src/serpro/client.js";
import { assertPdfTaxpayer, SerproFiscalAutomation, SITFIS_SCOPE, withSitfisScope } from "../src/serpro/automation.js";
import { renderHtml } from "../src/report/fiscal-report.js";
import type { FiscalAnalysis } from "../src/llm/openai-analysis.js";

const taxpayer = "51646813000194";
const contractor = "47733961000179";
const pdf = Buffer.from("%PDF-1.7\nSynthetic protocol test only\n%%EOF");
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const payload = (status: number, dados: unknown, cnpj = taxpayer) => ({ status, body: {
  status, contribuinte: { numero: cnpj, tipo: 2 }, dados: JSON.stringify(dados),
} });

async function setup(responses = [payload(200, { protocoloRelatorio: "sensitive-protocol", tempoEspera: 3000 }), payload(200, { pdf: pdf.toString("base64") })], env: NodeJS.ProcessEnv = {}) {
  const directory = await mkdtemp(join(tmpdir(), "serpro-tests-")); directories.push(directory);
  await writeFile(join(directory, "key"), "fake-key\n"); await writeFile(join(directory, "secret"), "fake-secret\n");
  const config = loadConfig({ DATABASE_URL: "postgres://localhost/ecac", REDIS_URL: "redis://localhost:6379",
    ECAC_LOGIN_URL: "https://cav.receita.fazenda.gov.br", SERPRO_ENABLED: "true",
    SERPRO_CONTRACTOR_CNPJ: contractor, SERPRO_AUTHOR_CNPJ: contractor,
    SERPRO_CONSUMER_KEY_FILE: join(directory, "key"), SERPRO_CONSUMER_SECRET_FILE: join(directory, "secret"), ...env });
  const requests: SerproHttpRequest[] = [];
  const transport = vi.fn(async (r: SerproHttpRequest) => {
    requests.push(r);
    if (r.url.endsWith("/authenticate")) return { status: 200, body: { access_token: "fake-access", jwt_token: "fake-jwt", expires_in: 3600 } };
    const next = responses.shift(); if (!next) throw new Error("Unexpected extra request"); return next;
  });
  const certificate = { pfx: Buffer.from([1, 2, 3]), passphrase: "fake-password" };
  const certificates = { getForCnpj: vi.fn(async () => certificate) };
  let time = 0;
  const wait = vi.fn(async (ms: number) => { time += ms; });
  return { client: new SerproSitfisClient(config, certificates, transport, wait, () => time), requests, transport, wait, certificates, certificate };
}

describe("Serpro SITFIS official API contract", () => {
  it("authenticates with contractor PFX and both tokens, polls in milliseconds and preserves taxpayer", async () => {
    const s = await setup([payload(200, { protocoloRelatorio: "opaque", tempoEspera: 3000 }),
      payload(202, { tempoEspera: 7000 }), payload(200, { pdf: pdf.toString("base64") })]);
    expect(await s.client.obtainSituationPdf(taxpayer)).toEqual(pdf);
    expect(s.certificates.getForCnpj).toHaveBeenCalledWith(contractor);
    expect(s.certificate.pfx).toEqual(Buffer.alloc(3));
    expect(s.requests[0]).toMatchObject({ headers: { "role-type": "TERCEIROS", authorization: `Basic ${Buffer.from("fake-key:fake-secret").toString("base64")}` }, body: "grant_type=client_credentials" });
    expect(s.requests[1]?.headers).toMatchObject({ authorization: "Bearer fake-access", jwt_token: "fake-jwt" });
    expect(JSON.parse(s.requests[1]!.body)).toEqual({ contratante: { numero: contractor, tipo: 2 },
      autorPedidoDados: { numero: contractor, tipo: 2 }, contribuinte: { numero: taxpayer, tipo: 2 },
      pedidoDados: { idSistema: "SITFIS", idServico: "SOLICITARPROTOCOLO91", versaoSistema: "2.0", dados: "" } });
    expect(JSON.parse(s.requests[2]!.body).pedidoDados.dados).toBe(JSON.stringify({ protocoloRelatorio: "opaque" }));
    expect(s.wait.mock.calls.map(call => call[0])).toEqual([3000, 7000]);
    expect(s.requests.filter(r => r.url.endsWith("/Apoiar"))).toHaveLength(1);
  });
  it("does not contact Serpro before activation", async () => {
    const s = await setup(undefined, { SERPRO_ENABLED: "false" });
    await expect(s.client.obtainSituationPdf(taxpayer)).rejects.toMatchObject({ code: "not_enabled" });
    expect(s.transport).not.toHaveBeenCalled();
  });
  it("blocks a different author before network access until delegation is implemented", async () => {
    const s = await setup(undefined, { SERPRO_AUTHOR_CNPJ: "68725889000108" });
    await expect(s.client.obtainSituationPdf(taxpayer)).rejects.toMatchObject({ code: "delegation_not_supported" });
    expect(s.transport).not.toHaveBeenCalled();
  });
  it("rejects response from another taxpayer", async () => {
    const s = await setup([payload(200, { protocoloRelatorio: "opaque" }, contractor)]);
    await expect(s.client.obtainSituationPdf(taxpayer)).rejects.toMatchObject({ code: "taxpayer_mismatch" });
  });
  it.each([401, 403, 429, 500, 503])("does not automatically replay rejected requests (%s)", async status => {
    const s = await setup([payload(status, {})]);
    await expect(s.client.obtainSituationPdf(taxpayer)).rejects.toThrow();
    expect(s.requests.filter(r => r.url.endsWith("/Apoiar"))).toHaveLength(1);
    expect(s.requests.filter(r => r.url.endsWith("/Emitir"))).toHaveLength(0);
  });
  it("bounds polling without requesting another protocol", async () => {
    const s = await setup([payload(200, { protocoloRelatorio: "opaque" }), ...Array.from({ length: 2 }, () => payload(202, { tempoEspera: 1000 }))], { SERPRO_MAX_POLL_ATTEMPTS: "2" });
    await expect(s.client.obtainSituationPdf(taxpayer)).rejects.toMatchObject({ code: "processing_timeout" });
    expect(s.requests.filter(r => r.url.endsWith("/Emitir"))).toHaveLength(2);
  });
  it("does not poll earlier when the advised wait exceeds the deadline", async () => {
    const s = await setup([payload(200, { protocoloRelatorio: "opaque", tempoEspera: 999999 })]);
    await expect(s.client.obtainSituationPdf(taxpayer)).rejects.toMatchObject({ code: "processing_timeout" });
    expect(s.wait).not.toHaveBeenCalled();
  });
  it("rejects missing protocol instead of silently restarting", async () => {
    const s = await setup([payload(200, { tempoEspera: 3000 })]);
    await expect(s.client.obtainSituationPdf(taxpayer)).rejects.toMatchObject({ code: "protocol_unavailable" });
  });
  it.each(["", "<html>error</html>", Buffer.from("Not a PDF").toString("base64"), Buffer.from("%PDF-1.7 incomplete").toString("base64")])("rejects invalid PDF content", value => {
    expect(() => decodeSerproPdf(value)).toThrow();
  });
});

const analysis: FiscalAnalysis = { schemaVersion: "1.0", cnpj: taxpayer, executiveSummary: "Teste sintético.", riskLevel: "medium", findings: [], recommendations: [], gaps: [], caveats: [] };
const request = { requestId: "test-only", sourceMessageId: "test-only", requesterPhone: "0000000000000", cnpj: taxpayer, period: "2026-09", documentType: "diagnostico_fiscal" as const };
describe("SITFIS report safeguards", () => {
  it("rejects missing or mismatched taxpayer in PDF text", () => {
    expect(() => assertPdfTaxpayer("CNPJ: 47.733.961/0001-79", taxpayer)).toThrow();
    expect(() => assertPdfTaxpayer(`Cliente mencionado: ${taxpayer}`, taxpayer)).toThrow();
    expect(() => assertPdfTaxpayer("CNPJ: 51.646.813/0001-94", taxpayer)).not.toThrow();
  });
  it("keeps partial scope on the cover and gaps even if the model omits it", () => {
    const scoped = withSitfisScope(analysis);
    const html = renderHtml({ cnpj: taxpayer, companyName: "TESTE", analysis: scoped, sources: [], destination: "unused", scopeNotice: SITFIS_SCOPE });
    expect(html.split('<main class="content">')[0]).toContain(SITFIS_SCOPE);
    expect(scoped.gaps).toContain("Pendente: relatório consolidado detalhado da PGFN/Regularize.");
    expect(html).not.toContain("coletados no e-CAC e no Regularize/PGFN");
  });
  it("feeds only the verified RFB source into the model and labels delivery as partial", async () => {
    const model = { analyze: vi.fn(async () => analysis) };
    const render = vi.fn(async (input: { destination: string }) => { await writeFile(input.destination, pdf); });
    const describe = vi.fn(async () => ({ sourceId: "situacao_fiscal_rfb" as const, title: "Synthetic", path: "unused", text: "CNPJ: 51.646.813/0001-94\nRazão Social: EMPRESA TESTE", pages: 1, sha256: "test", obtainedAt: new Date().toISOString() }));
    const automation = new SerproFiscalAutomation({ obtainSituationPdf: async () => pdf }, model, render, describe);
    const result = await automation.obtainDocument(request);
    try {
      expect(result.deliveryNote).toBe(SITFIS_SCOPE);
      expect(result.filename).toContain("Parcial");
      expect(model.analyze.mock.calls[0]).toBeDefined();
      expect(render.mock.calls[0]![0]).toMatchObject({ scopeNotice: SITFIS_SCOPE });
    } finally { await rm(result.localPath, { force: true }); }
  });
  it("never sends mismatched source data to the model", async () => {
    const model = { analyze: vi.fn(async () => analysis) };
    const describe = vi.fn(async () => ({ sourceId: "situacao_fiscal_rfb" as const, title: "Synthetic", path: "unused", text: "CNPJ: 47.733.961/0001-79", pages: 1, sha256: "test", obtainedAt: new Date().toISOString() }));
    const automation = new SerproFiscalAutomation({ obtainSituationPdf: async () => pdf }, model, vi.fn(), describe);
    await expect(automation.obtainDocument(request)).rejects.toMatchObject({ code: "pdf_taxpayer_mismatch" });
    expect(model.analyze).not.toHaveBeenCalled();
  });
});

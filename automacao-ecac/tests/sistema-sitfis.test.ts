import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { processSitfisJob, type SitfisJob } from "../src/sistema/sitfis.js";

const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", DATABASE_URL: "postgres://x:x@localhost:5432/x", REDIS_URL: "redis://localhost:6379", ECAC_LOGIN_URL: "https://example.gov.br/login", FS_SYSTEM_URL: "https://sistema.test", FS_SYSTEM_API_TOKEN: "sys-token" });
const job: SitfisJob = { requestId: "sitfis-11111111-2222-3333-4444-555555555555", cnpj: "51646813000194" };
const pdf = Buffer.from("%PDF-1.4 sitfis %%EOF");

describe("rota /sistema/sitfis", () => {
  it("exige o token do sistema, valida o pedido e enfileira uma vez", async () => {
    const published: SitfisJob[] = [];
    const app = await buildApp({ config, logger: createLogger("silent"), orchestrator: { handle: async () => {} }, sitfis: { publish: async j => { published.push(j); } } });
    expect((await app.inject({ method: "POST", url: "/sistema/sitfis", payload: job })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/sistema/sitfis", headers: { authorization: "Bearer outro" }, payload: job })).statusCode).toBe(401);
    const auth = { authorization: "Bearer sys-token" };
    expect((await app.inject({ method: "POST", url: "/sistema/sitfis", headers: auth, payload: { ...job, cnpj: "51646813000195" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/sistema/sitfis", headers: auth, payload: { ...job, extra: 1 } })).statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: "/sistema/sitfis", headers: auth, payload: job });
    expect(ok.statusCode).toBe(202); expect(published).toEqual([job]);
    await app.close();
  });
  it("sem Integra Contador configurado responde 503 sem enfileirar", async () => {
    const app = await buildApp({ config, logger: createLogger("silent"), orchestrator: { handle: async () => {} } });
    expect((await app.inject({ method: "POST", url: "/sistema/sitfis", headers: { authorization: "Bearer sys-token" }, payload: job })).statusCode).toBe(503);
    await app.close();
  });
});
describe("processamento do pedido", () => {
  const deps = (overrides: Partial<Parameters<typeof processSitfisJob>[1]> = {}) => {
    const posted: { meta: Record<string, unknown>; file: boolean; text: string | null }[] = [];
    const dataDir = mkdtempSync(join(tmpdir(), "sitfis-"));
    return { posted, dataDir, deps: { obtainPdf: async () => pdf, extractText: async () => "texto do SITFIS", dataDir, wait: async () => {}, errorCode: (e: unknown) => (e as { code?: string }).code ?? "processing_failed",
      post: async (form: FormData) => { posted.push({ meta: JSON.parse(String(form.get("metadata"))), file: form.get("file") instanceof Blob, text: form.get("text") as string | null }); return new Response("{}", { status: 200 }); }, ...overrides } };
  };
  it("consulta uma vez, guarda cópia local e entrega PDF, hash e texto", async () => {
    let calls = 0; const { posted, dataDir, deps: d } = deps({ obtainPdf: async () => { calls += 1; return pdf; } });
    expect(await processSitfisJob(job, d)).toEqual({ status: "delivered" });
    expect(calls).toBe(1); expect(posted).toHaveLength(1);
    expect(posted[0]!.meta).toMatchObject({ requestId: job.requestId, cnpj: job.cnpj, ok: true }); expect(posted[0]!.meta.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(posted[0]!.file).toBe(true); expect(posted[0]!.text).toBe("texto do SITFIS");
    expect(readFileSync(join(dataDir, job.requestId, "situacao-fiscal.pdf")).equals(pdf)).toBe(true);
  });
  it("falha da Receita é reportada com o código, sem nova consulta", async () => {
    let calls = 0; const { posted, deps: d } = deps({ obtainPdf: async () => { calls += 1; throw Object.assign(new Error("negado"), { code: "access_denied" }); } });
    expect(await processSitfisJob(job, d)).toEqual({ status: "failure_reported", code: "access_denied" });
    expect(calls).toBe(1); expect(posted[0]!.meta).toMatchObject({ ok: false, code: "access_denied" }); expect(posted[0]!.file).toBe(false);
  });
  it("sistema fora do ar: tenta entregar de novo sem repetir a consulta e preserva o PDF", async () => {
    let calls = 0, attempts = 0; const { dataDir, deps: d } = deps({ obtainPdf: async () => { calls += 1; return pdf; }, post: async () => { attempts += 1; if (attempts < 3) throw new Error("offline"); return new Response("{}", { status: 200 }); } });
    expect(await processSitfisJob(job, d)).toEqual({ status: "delivered" }); expect(calls).toBe(1); expect(attempts).toBe(3);
    const { dataDir: dir2, deps: down } = deps({ post: async () => { throw new Error("offline"); } });
    await expect(processSitfisJob(job, down)).rejects.toThrow("system_delivery_failed");
    expect(existsSync(join(dir2, job.requestId, "situacao-fiscal.pdf"))).toBe(true); expect(dataDir).toBeTruthy();
  });
});

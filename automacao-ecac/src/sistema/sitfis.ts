import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Queue } from "bullmq";
import type { RedisOptions } from "ioredis";
import { z } from "zod";
import { isValidCnpj } from "../orchestrator/parser.js";

// Situação Fiscal (SITFIS) pedida pelo sistema FS para empresas com procuração. O sistema não tem o certificado da FS:
// a consulta (cobrada) roda no worker, uma única vez por pedido, e o resultado volta para o sistema.
export const SITFIS_QUEUE = "sistema-sitfis";
export const sitfisRequestSchema = z.object({ requestId: z.string().regex(/^sitfis-[a-f0-9-]{36}$/), cnpj: z.string().regex(/^\d{14}$/).refine(isValidCnpj) }).strict();
export type SitfisJob = z.infer<typeof sitfisRequestSchema> & { started?: boolean };
export function bearerMatches(header: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`), received = Buffer.from(header ?? "");
  return token.length > 0 && expected.length === received.length && timingSafeEqual(expected, received);
}
export interface SitfisPublisher { publish(job: SitfisJob): Promise<void> }
export class BullMqSitfisPublisher implements SitfisPublisher {
  private readonly queue: Queue<SitfisJob>;
  constructor(connection: RedisOptions) { this.queue = new Queue<SitfisJob>(SITFIS_QUEUE, { connection }); }
  // jobId = requestId: o mesmo pedido nunca entra duas vezes na fila; sem novas tentativas automáticas (consulta cobrada).
  async publish(job: SitfisJob) { await this.queue.add("sitfis", job, { jobId: job.requestId, attempts: 1, removeOnComplete: { age: 7 * 86_400 }, removeOnFail: { age: 30 * 86_400 } }); }
  async close() { await this.queue.close(); }
}
export interface SitfisJobDependencies {
  obtainPdf(cnpj: string): Promise<Buffer>;
  extractText(pdfPath: string, cnpj: string): Promise<string>;
  post(body: FormData): Promise<Response>;
  dataDir: string;
  wait?: (ms: number) => Promise<unknown>;
  errorCode(error: unknown): string;
}
const metadata = (job: SitfisJob, extra: Record<string, unknown>) => JSON.stringify({ requestId: job.requestId, cnpj: job.cnpj, ...extra });
// Entrega ao sistema com algumas tentativas (a entrega é gratuita; a consulta não se repete).
async function deliver(deps: SitfisJobDependencies, build: () => FormData) {
  const wait = deps.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try { const response = await deps.post(build()); if (response.ok || response.status === 404 || response.status === 422) return response.status; } catch { /* nova tentativa */ }
    if (attempt < 4) await wait(attempt * 5_000);
  }
  throw new Error("system_delivery_failed");
}
export async function processSitfisJob(job: SitfisJob, deps: SitfisJobDependencies): Promise<{ status: "delivered" | "failure_reported"; code?: string }> {
  const folder = join(deps.dataDir, job.requestId);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  let pdf: Buffer, text: string;
  try {
    pdf = await deps.obtainPdf(job.cnpj);
    // Cópia local antes de qualquer entrega: um PDF pago nunca se perde por falha de rede.
    const path = join(folder, "situacao-fiscal.pdf");
    await writeFile(path, pdf, { mode: 0o600 });
    text = await deps.extractText(path, job.cnpj);
    await writeFile(join(folder, "source-text.txt"), text, { mode: 0o600 });
  } catch (error) {
    const code = deps.errorCode(error);
    await deliver(deps, () => { const form = new FormData(); form.set("metadata", metadata(job, { ok: false, code })); return form; });
    return { status: "failure_reported", code };
  }
  const sha256 = createHash("sha256").update(pdf).digest("hex"), collectedAt = new Date().toISOString();
  await deliver(deps, () => {
    const form = new FormData();
    form.set("metadata", metadata(job, { ok: true, sha256, collectedAt }));
    form.set("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "situacao-fiscal.pdf");
    form.set("text", text);
    return form;
  });
  return { status: "delivered" };
}

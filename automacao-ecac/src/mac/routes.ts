import { createHash, timingSafeEqual } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { MacJob } from "../domain/types.js";
import type { AppLogger } from "../logger.js";
import type { Platform } from "../system/platform.js";
import type { WhatsAppGateway } from "../whatsapp/client.js";
import { formatCnpj } from "../orchestrator/service.js";
import type { MacJobQueue } from "./queue.js";

// Endpoints privados do conector do Mac (mesmos caminhos da antiga ponte): o Mac busca pedidos, relata etapas e devolve o parecer.
// Alcançados só pelo túnel SSH do Mac para 127.0.0.1:3000; nunca pelo Traefik.
export interface MacArchive { archivePdf(job: MacJob, content: Buffer, filename: string): Promise<void> }
export interface MacRouteDependencies { config: AppConfig; logger: AppLogger; queue: MacJobQueue; whatsapp: WhatsAppGateway; platform?: Platform; archive?: MacArchive }
const statusBody = z.object({ status: z.string().max(40), note: z.string().max(500).optional(), state: z.string().max(20).optional() });
const resultBody = z.object({ pdfBase64: z.string().min(100), filename: z.string().max(160).optional(), razao: z.string().max(200).optional(), sha256: z.string().max(64).optional(), note: z.string().max(500).optional(), coletaEm: z.string().max(40).optional() });
export const statusMessages: Record<string, string> = {
  aguardando_mac: "Seu pedido foi reservado pelo Mac da FS e começa em instantes.",
  aguardando_login: "O operador precisa concluir o login no e-CAC no Mac da FS; assim que a sessão abrir, seu pedido continua sozinho.",
  aguardando_permissao: "Esta empresa ainda não está autorizada para consulta automática no Mac. Fale com a FS.",
  coletando: "Coleta em andamento no e-CAC (Receita Federal, PGFN, SISPAR).",
  gerando_parecer: "Fontes coletadas. Gerando o parecer.",
  coleta_incompleta: "A coleta ficou incompleta e não liberei um parecer parcial. A equipe vai revisar.",
  falhou: "Não consegui concluir esta solicitação. A equipe foi avisada.",
};
export async function registerMacRoutes(app: FastifyInstance, deps: MacRouteDependencies) {
  const { config, logger, queue, whatsapp } = deps;
  const authorized = (header: string | undefined) => {
    const expected = Buffer.from(`Bearer ${config.MAC_BRIDGE_TOKEN}`), received = Buffer.from(header ?? "");
    return config.MAC_BRIDGE_TOKEN.length > 0 && expected.length === received.length && timingSafeEqual(expected, received);
  };
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/mac/")) return;
    if (!authorized(request.headers.authorization)) return reply.code(401).send({ error: "unauthorized" });
  });
  app.post("/mac/claim", async (_request, reply) => {
    const job = await queue.claim();
    if (!job) return reply.code(204).send();
    return { requestId: job.id, cnpj: job.cnpj, razao: job.razao, requesterPhone: job.requesterPhone, operation: job.operation, correctionOf: null, mode: null, observacao: null };
  });
  app.get<{ Params: { id: string } }>("/mac/jobs/:id", async (request, reply) => (await queue.get(request.params.id)) ?? reply.code(404).send({ error: "not_found" }));
  app.post<{ Params: { id: string } }>("/mac/jobs/:id/status", async (request, reply) => {
    const job = await queue.get(request.params.id);
    if (!job) return reply.code(404).send({ error: "not_found" });
    const body = statusBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_status" });
    job.status = body.data.status; job.note = body.data.note ?? job.note;
    if (body.data.status === "enviado") { job.state = "done"; job.deliveredAt ??= new Date().toISOString(); }
    else if (["falhou", "coleta_incompleta", "aguardando_permissao"].includes(body.data.status)) job.state = "done";
    await queue.save(job);
    // Cada etapa relevante avisa o solicitante uma única vez.
    const message = statusMessages[body.data.status];
    if (message && job.notifiedStatus !== body.data.status) {
      job.notifiedStatus = body.data.status; await queue.save(job);
      await whatsapp.sendText(job.requesterPhone, `Pedido ${job.id} (${job.razao || formatCnpj(job.cnpj)}): ${message}`).catch((error: unknown) => logger.warn({ err: error, jobId: job.id }, "mac status notice failed"));
    }
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/mac/jobs/:id/result", async (request, reply) => {
    const job = await queue.get(request.params.id);
    if (!job) return reply.code(404).send({ error: "not_found" });
    if (job.deliveredAt) return { ok: true, deduped: true };
    const body = resultBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "missing_pdf" });
    const content = Buffer.from(body.data.pdfBase64, "base64");
    if (content.subarray(0, 5).toString() !== "%PDF-") return reply.code(422).send({ error: "invalid_pdf" });
    const sha256 = createHash("sha256").update(content).digest("hex");
    if (body.data.sha256 && body.data.sha256 !== sha256) return reply.code(422).send({ error: "sha256_mismatch" });
    job.razao = body.data.razao || job.razao; job.filename = String(body.data.filename || `Parecer FS ${job.cnpj}.pdf`).replace(/[\/\\\r\n]/g, " "); job.sha256 = sha256;
    // Arquiva no sistema antes de entregar: o acervo é a fonte; falha no arquivamento não entrega e fica para reconciliação.
    if (deps.archive) {
      try { await deps.archive.archivePdf(job, content, job.filename); }
      catch (error) { logger.error({ err: error, jobId: job.id }, "mac result archive failed"); job.status = "revisao_necessaria"; job.note = "Parecer recebido do Mac, mas o arquivamento no sistema falhou; reconciliar pelo id do pedido."; await queue.save(job); return reply.code(502).send({ error: "archive_failed" }); }
    }
    const folder = await mkdtemp(join(tmpdir(), "fs-mac-"));
    try {
      const path = join(folder, "parecer.pdf"); await writeFile(path, content, { mode: 0o600 });
      await whatsapp.sendDocument(job.requesterPhone, path, job.filename, `Parecer de ${job.razao || formatCnpj(job.cnpj)} (CNPJ ${formatCnpj(job.cnpj)}), coletado no e-CAC${body.data.coletaEm ? ` em ${body.data.coletaEm}` : ""}. Pedido ${job.id}.${body.data.note ? ` Observação: ${body.data.note}` : ""}`);
    } finally { await rm(folder, { recursive: true, force: true }); }
    job.state = "done"; job.status = "enviado"; job.deliveredAt = new Date().toISOString(); await queue.save(job);
    // Revisores com a atribuição de avisos ficam sabendo que há um parecer novo.
    for (const member of (await deps.platform?.team().catch(() => [])) ?? []) {
      if (member.tasks.includes("avisos") && member.role !== "operador" && member.phone !== job.requesterPhone) await whatsapp.sendText(member.phone, `Parecer de ${job.razao || formatCnpj(job.cnpj)} pronto, pedido por ${job.requesterName} pelo WhatsApp; já está no acervo do sistema.`).catch(() => {});
    }
    logger.info({ jobId: job.id }, "mac job delivered");
    return { ok: true, delivered: true };
  });
}

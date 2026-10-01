import { randomUUID } from "node:crypto";
import { storedDocumentQuery, type DocumentArchive } from "../system/documents.js";
import type { Platform, TeamMember } from "../system/platform.js";
import type { AppConfig } from "../config.js";
import { normalizePhoneNumber } from "../config.js";
import type { InboundMedia, InboundMessage, ParsedRequest } from "../domain/types.js";
import type { AppLogger } from "../logger.js";
import type { MacJobQueue } from "../mac/queue.js";
import type { RequestPublisher } from "../queue/request-queue.js";
import type { WhatsAppGateway } from "../whatsapp/client.js";
import { acceptedMedia, downloadMedia, MediaError } from "../whatsapp/media.js";
import { describeMissingFields, isValidCnpj, parseRequest } from "./parser.js";
import type { PendingRequestStore } from "./pending-request-store.js";

export interface OrchestratorDependencies {
  config: AppConfig;
  queue: RequestPublisher;
  whatsapp: WhatsAppGateway;
  pendingRequests: PendingRequestStore;
  logger: AppLogger;
  archive?: DocumentArchive;
  platform?: Platform;
  macQueue?: MacJobQueue;
  fetcher?: typeof fetch;
}
// Quem fala com o agente é identificado pela equipe cadastrada no sistema; a allowlist do .env fica só como transição.
type Caller = TeamMember & { legacy?: boolean };

export class OrchestratorService {
  private readonly config: AppConfig;
  private readonly queue: RequestPublisher;
  private readonly whatsapp: WhatsAppGateway;
  private readonly pendingRequests: PendingRequestStore;
  private readonly logger: AppLogger;
  private readonly archive: DocumentArchive | undefined;
  private readonly platform: Platform | undefined;
  private readonly macQueue: MacJobQueue | undefined;
  private readonly fetcher: typeof fetch;
  constructor(deps: OrchestratorDependencies);
  constructor(config: AppConfig, queue: RequestPublisher, whatsapp: WhatsAppGateway, pendingRequests: PendingRequestStore, logger: AppLogger, archive?: DocumentArchive);
  constructor(first: OrchestratorDependencies | AppConfig, queue?: RequestPublisher, whatsapp?: WhatsAppGateway, pendingRequests?: PendingRequestStore, logger?: AppLogger, archive?: DocumentArchive) {
    const deps: OrchestratorDependencies = "config" in first && "queue" in first ? first : { config: first as AppConfig, queue: queue!, whatsapp: whatsapp!, pendingRequests: pendingRequests!, logger: logger!, ...(archive ? { archive } : {}) };
    this.config = deps.config; this.queue = deps.queue; this.whatsapp = deps.whatsapp; this.pendingRequests = deps.pendingRequests; this.logger = deps.logger;
    this.archive = deps.archive; this.platform = deps.platform; this.macQueue = deps.macQueue; this.fetcher = deps.fetcher ?? fetch;
  }

  async identify(phone: string): Promise<Caller | null> {
    const member = await this.platform?.member(phone).catch((error: unknown) => { this.logger.warn({ err: error }, "team lookup failed"); return null; });
    if (member) return member;
    // Transição: número da allowlist antiga segue podendo pedir análise e consultar o acervo, sem comprovantes nem avisos.
    return this.config.authorizedPhoneNumbers.has(phone) ? { id: `legacy:${phone}`, name: "Equipe FS", role: "operador", phone, tasks: ["analises"], legacy: true } : null;
  }

  async handle(message: InboundMessage): Promise<void> {
    const phone = normalizePhoneNumber(message.from);
    const caller = await this.identify(phone);
    if (!caller) {
      this.logger.warn({ messageId: message.messageId, phone }, "unauthorized whatsapp contact");
      await this.whatsapp.sendText(phone, "Este número não está cadastrado na equipe FS. Peça ao administrador para incluir seu WhatsApp em Configurações → Equipe.");
      return;
    }
    if (message.media) { await this.handleMedia(caller, message, message.media); return; }
    if (message.type !== "text" || !message.text) {
      await this.whatsapp.sendText(phone, caller.tasks.includes("comprovantes") ? "Envie texto, ou uma foto/PDF de comprovante com a empresa na legenda." : "Envie a solicitação em texto. Exemplo: faça uma análise da empresa 51.646.813/0001-94.");
      return;
    }
    const text = message.text;
    const pending = await this.pendingRequests.get(phone);
    // Comprovante aguardando a empresa: a próxima mensagem deve identificá-la.
    if (pending?.kind === "receipt") {
      if (normalizeAnswer(text) === "no") { await this.pendingRequests.clear(phone); await this.whatsapp.sendText(phone, "Comprovante descartado. Envie novamente quando quiser."); return; }
      const company = await this.resolveCompany(text);
      if (!company) { await this.whatsapp.sendText(phone, "Não encontrei essa empresa no Controller. Informe o CNPJ (14 dígitos) ou responda NÃO para descartar o comprovante."); return; }
      await this.pendingRequests.clear(phone);
      await this.archiveReceipt(caller, pending.media, company, pending.sourceMessage.messageId);
      return;
    }
    const storedQuery = storedDocumentQuery(text);
    if (storedQuery !== null) { await this.pendingRequests.clear(phone); await this.deliverStored(phone, text, storedQuery); return; }
    const answer = normalizeAnswer(text);
    if (answer === "yes") { await this.confirm(caller, message, pending); return; }
    if (answer === "no") {
      await this.pendingRequests.clear(phone);
      await this.whatsapp.sendText(phone, pending?.kind === "serpro-fallback" ? "Certo, o pedido continua aguardando o Mac." : "Solicitação cancelada. Você pode enviar uma nova quando quiser.");
      return;
    }
    const parsed = parseRequest(text);
    const missing = describeMissingFields(parsed);
    if (missing.length > 0) {
      await this.whatsapp.sendText(phone, `Para continuar, informe: ${formatList(missing)}. Exemplo: faça uma análise da empresa 51.646.813/0001-94.`);
      return;
    }
    if (!caller.tasks.includes("analises")) {
      await this.whatsapp.sendText(phone, "Seu WhatsApp não está autorizado a pedir análises. Você pode consultar pareceres já elaborados: me manda a análise da empresa X. Para novas análises, use o botão Analisar CNPJ no sistema ou fale com o administrador.");
      return;
    }
    const complete = parsed as Required<ParsedRequest>;
    const via = this.macQueue ? "mac" : "serpro";
    await this.pendingRequests.set(phone, { kind: "analysis", sourceMessage: message, parsed: complete, via });
    await this.whatsapp.sendText(phone, `Confirme a solicitação: ${labelFor(complete.documentType)} do CNPJ ${formatCnpj(complete.cnpj)}, competência ${formatPeriod(complete.period)}${via === "mac" ? ", executada no Mac da FS" : ""}. Responda SIM para executar ou NÃO para cancelar.`);
  }

  private async confirm(caller: Caller, message: InboundMessage, pending: Awaited<ReturnType<PendingRequestStore["get"]>>) {
    const phone = caller.phone;
    if (!pending || pending.kind === "receipt") { await this.whatsapp.sendText(phone, "Não encontrei uma solicitação aguardando confirmação. Envie novamente documento, CNPJ e competência."); return; }
    await this.pendingRequests.clear(phone);
    if (pending.kind === "serpro-fallback") {
      const job = await this.macQueue?.get(pending.macJobId);
      if (!job || job.state !== "pending") { await this.whatsapp.sendText(phone, "Esse pedido já foi atendido ou cancelado; nenhuma consulta Serpro foi iniciada."); return; }
      job.state = "cancelled"; job.status = "cancelado"; job.note = "Substituído pela consulta Serpro a pedido do solicitante."; await this.macQueue!.save(job);
      const request = await this.queue.publish(message, pending.parsed);
      await this.whatsapp.sendText(phone, `Consulta preliminar pelo Serpro iniciada (cobrada). Protocolo ${request.requestId}. Aviso quando o parecer estiver pronto.`);
      return;
    }
    if (pending.via === "mac" && this.macQueue) {
      const company = (await this.resolveCompany(pending.parsed.cnpj))?.name ?? `Empresa ${pending.parsed.cnpj}`;
      // Idempotência: o id do pedido deriva da mensagem original, não da confirmação.
      const job = await this.macQueue.create({ cnpj: pending.parsed.cnpj, razao: company, requesterPhone: phone, requesterName: caller.name, operation: "analisar" }, `wa-${pending.sourceMessage.messageId}`.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80));
      await this.whatsapp.sendText(phone, `Pedido ${job.id} na fila do Mac da FS para ${company}. Aviso aqui a cada etapa e envio o parecer quando ficar pronto.`);
      return;
    }
    const request = await this.queue.publish(message, pending.parsed);
    await this.whatsapp.sendText(phone, `Solicitação confirmada. Protocolo ${request.requestId}. Vou iniciar a busca e aviso quando o arquivo estiver pronto.`);
  }

  private async handleMedia(caller: Caller, message: InboundMessage, media: InboundMedia) {
    const phone = caller.phone;
    if (!caller.tasks.includes("comprovantes")) { await this.whatsapp.sendText(phone, "Seu WhatsApp não está autorizado a enviar comprovantes de pagamento. Fale com o administrador do sistema."); return; }
    if (!this.platform) { await this.whatsapp.sendText(phone, "A conexão com o sistema não está configurada; o comprovante não foi guardado."); return; }
    const company = media.caption ? await this.resolveCompany(media.caption) : null;
    if (!company) {
      await this.pendingRequests.set(phone, { kind: "receipt", sourceMessage: message, media }, 1800);
      await this.whatsapp.sendText(phone, "Recebi o comprovante. De qual empresa é? Responda com o CNPJ ou o nome como está no Controller (ou NÃO para descartar).");
      return;
    }
    await this.archiveReceipt(caller, media, company, message.messageId);
  }

  private async archiveReceipt(caller: Caller, media: InboundMedia, company: { cnpj: string; name: string }, messageId: string) {
    const phone = caller.phone;
    try {
      const { content, mime } = await downloadMedia(media.url, this.config.MEDIA_MAX_BYTES, this.fetcher);
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `Comprovante ${company.cnpj} ${stamp} ${randomUUID().slice(0, 8)}.${acceptedMedia[mime]}`;
      const result = await this.platform!.archiveReceipt({ externalId: `wa-comprovante-${messageId}`.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 150), cnpj: company.cnpj, company: company.name, filename, mime, note: (media.caption ?? "").slice(0, 300), content }, phone);
      await this.whatsapp.sendText(phone, `Comprovante guardado no sistema para ${result.company} (CNPJ ${formatCnpj(company.cnpj)}). Os revisores foram avisados.`);
    } catch (error) {
      const code = error instanceof MediaError ? error.code : error instanceof Error ? error.message : "";
      this.logger.warn({ code, phone }, "receipt not archived");
      await this.whatsapp.sendText(phone, code === "too_large" ? "O arquivo passa de 3 MB. Envie uma foto menor ou o PDF compactado." : code === "unsupported" ? "Aceito comprovantes em PDF, JPG ou PNG." : code === "receipt_duplicate" ? "Esse comprovante já estava guardado no sistema." : "Não consegui guardar o comprovante agora. Tente novamente em instantes.");
    }
  }

  // Empresa pelo CNPJ ou pelo nome, conferida no Controller do sistema.
  private async resolveCompany(text: string): Promise<{ cnpj: string; name: string } | null> {
    const digits = text.match(/\b(?:\d[./\s-]?){12}\d{2}\b/)?.[0]?.replace(/\D/g, "");
    if (digits && isValidCnpj(digits)) {
      const known = await this.platform?.companies(digits).catch(() => []) ?? [];
      return known.find((c) => c.cnpj === digits) ?? { cnpj: digits, name: `CNPJ ${digits}` };
    }
    const name = text.replace(/^(empresa|cliente)\s+/i, "").trim();
    if (name.length < 3 || !this.platform) return null;
    const matches = await this.platform.companies(name).catch(() => []);
    return matches.length === 1 ? matches[0]! : null;
  }

  private async deliverStored(phone: string, text: string, storedQuery: string) {
    if (!this.archive) { await this.whatsapp.sendText(phone, "A conexão com o acervo do sistema ainda não foi configurada. Não iniciei uma nova análise."); return; }
    if (storedQuery.length < 3) { await this.whatsapp.sendText(phone, "Informe o nome da empresa ou o CNPJ para localizar o parecer já elaborado."); return; }
    try {
      const matches = await this.archive.search(storedQuery, phone);
      const companies = new Map(matches.map((d) => [d.cnpj, d.company]));
      if (companies.size > 1) { await this.whatsapp.sendText(phone, `Encontrei mais de uma empresa. Informe o CNPJ para selecionar o documento correto: ${[...companies].slice(0, 5).map(([cnpj, name]) => `${name} (${cnpj})`).join("; ")}.`); return; }
      const isOpinion = /an[aá]lise|parecer|diagn[oó]stico|relat[oó]rio/i.test(text);
      const candidates = matches.filter((d) => !isOpinion || d.kind === "parecer").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (!candidates.length) { await this.whatsapp.sendText(phone, "Não encontrei um parecer já elaborado para essa empresa no sistema. Nenhuma nova análise foi iniciada. Você pode solicitar uma nova análise informando o CNPJ."); return; }
      if (!isOpinion && candidates.length > 1) { await this.whatsapp.sendText(phone, `Há ${candidates.length} documentos desta empresa. Para o parecer mais recente, peça: me manda a análise do CNPJ ${candidates[0]!.cnpj}. Outros anexos podem ser abertos no acervo do sistema.`); return; }
      await this.archive.deliver(candidates[0]!, phone);
    } catch { await this.whatsapp.sendText(phone, "Não consegui acessar o acervo agora. Tente novamente em instantes. Não iniciei uma nova análise."); }
  }
}
export function normalizeAnswer(value: string): "yes" | "no" | undefined {
  const normalized = value.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/^(sim|confirmo|pode executar)$/.test(normalized)) return "yes";
  if (/^(nao|cancelar|cancela)$/.test(normalized)) return "no";
  return undefined;
}
function labelFor(type: Required<ParsedRequest>["documentType"]): string {
  return { diagnostico_fiscal: "o diagnóstico fiscal federal", situacao_fiscal: "a situação fiscal", dctfweb: "a DCTFWeb", caixa_postal: "as mensagens da caixa postal" }[type];
}
export function formatCnpj(value: string): string { return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); }
function formatPeriod(value: string): string { const [year, month] = value.split("-"); return `${month}/${year}`; }
function formatList(values: string[]): string { return values.length < 2 ? values[0] ?? "os dados necessários" : `${values.slice(0, -1).join(", ")} e ${values.at(-1)}`; }

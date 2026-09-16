import { storedDocumentQuery, type DocumentArchive } from "../system/documents.js";
import type { AppConfig } from "../config.js";
import { normalizePhoneNumber } from "../config.js";
import type { InboundMessage, ParsedRequest } from "../domain/types.js";
import type { AppLogger } from "../logger.js";
import type { RequestPublisher } from "../queue/request-queue.js";
import type { WhatsAppGateway } from "../whatsapp/client.js";
import { describeMissingFields, parseRequest } from "./parser.js";
import type { PendingRequestStore } from "./pending-request-store.js";

export class OrchestratorService {
  constructor(
    private readonly config: AppConfig,
    private readonly queue: RequestPublisher,
    private readonly whatsapp: WhatsAppGateway,
    private readonly pendingRequests: PendingRequestStore,
    private readonly logger: AppLogger,
    private readonly archive?: DocumentArchive,
  ) {}

  async handle(message: InboundMessage): Promise<void> {
    const phone = normalizePhoneNumber(message.from);
    if (!this.config.authorizedPhoneNumbers.has(phone)) {
      this.logger.warn({ messageId: message.messageId, phone }, "unauthorized whatsapp contact");
      await this.whatsapp.sendText(
        phone,
        "Este número ainda não está autorizado a solicitar documentos. Fale com a FS Soluções Tributárias.",
      );
      return;
    }

    if (message.type !== "text" || !message.text) {
      await this.whatsapp.sendText(
        phone,
        "Envie a solicitação em texto. Exemplo: faça uma análise da empresa 51.646.813/0001-94.",
      );
      return;
    }

    const storedQuery = storedDocumentQuery(message.text);
    if (storedQuery !== null) {
      await this.pendingRequests.clear(phone);
      if (!this.archive) { await this.whatsapp.sendText(phone, "A conexão com o acervo do sistema ainda não foi configurada. Não iniciei uma nova análise."); return; }
      if (storedQuery.length < 3) { await this.whatsapp.sendText(phone, "Informe o nome da empresa ou o CNPJ para localizar o parecer já elaborado."); return; }
      try {
        const matches = await this.archive.search(storedQuery, phone);
        const companies = new Map(matches.map(d => [d.cnpj, d.company]));
        if (companies.size > 1) { await this.whatsapp.sendText(phone, `Encontrei mais de uma empresa. Informe o CNPJ para selecionar o documento correto: ${[...companies].slice(0, 5).map(([cnpj, name]) => `${name} (${cnpj})`).join("; ")}.`); return; }
        const isOpinion = /an[aá]lise|parecer|diagn[oó]stico|relat[oó]rio/i.test(message.text);
        const candidates = matches.filter(d => !isOpinion || d.kind === "parecer").sort((a,b) => b.createdAt.localeCompare(a.createdAt));
        if (!candidates.length) { await this.whatsapp.sendText(phone, "Não encontrei um parecer já elaborado para essa empresa no sistema. Nenhuma nova análise foi iniciada. Você pode solicitar uma nova análise informando o CNPJ."); return; }
        if (!isOpinion && candidates.length > 1) { await this.whatsapp.sendText(phone, `Há ${candidates.length} documentos desta empresa. Para o parecer mais recente, peça: me manda a análise do CNPJ ${candidates[0]!.cnpj}. Outros anexos podem ser abertos no acervo do sistema.`); return; }
        await this.archive.deliver(candidates[0]!, phone);
      } catch { await this.whatsapp.sendText(phone, "Não consegui acessar o acervo agora. Tente novamente em instantes. Não iniciei uma nova análise."); }
      return;
    }

    const answer = normalizeAnswer(message.text);
    if (answer === "yes") {
      const pending = await this.pendingRequests.get(phone);
      if (!pending) {
        await this.whatsapp.sendText(
          phone,
          "Não encontrei uma solicitação aguardando confirmação. Envie novamente documento, CNPJ e competência.",
        );
        return;
      }
      await this.pendingRequests.clear(phone);
      const request = await this.queue.publish(message, pending.parsed);
      await this.whatsapp.sendText(
        phone,
        `Solicitação confirmada. Protocolo ${request.requestId}. Vou iniciar a busca e aviso quando o arquivo estiver pronto.`,
      );
      return;
    }

    if (answer === "no") {
      await this.pendingRequests.clear(phone);
      await this.whatsapp.sendText(phone, "Solicitação cancelada. Você pode enviar uma nova quando quiser.");
      return;
    }

    const parsed = parseRequest(message.text);
    const missing = describeMissingFields(parsed);
    if (missing.length > 0) {
      await this.whatsapp.sendText(
        phone,
        `Para continuar, informe: ${formatList(missing)}. Exemplo: faça uma análise da empresa 51.646.813/0001-94.`,
      );
      return;
    }

    const complete = parsed as Required<ParsedRequest>;
    await this.pendingRequests.set(phone, { sourceMessage: message, parsed: complete });
    await this.whatsapp.sendText(
      phone,
      `Confirme a solicitação: ${labelFor(complete.documentType)} do CNPJ ${formatCnpj(complete.cnpj)}, competência ${formatPeriod(complete.period)}. Responda SIM para executar ou NÃO para cancelar.`,
    );
  }
}

function normalizeAnswer(value: string): "yes" | "no" | undefined {
  const normalized = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/^(sim|confirmo|pode executar)$/.test(normalized)) return "yes";
  if (/^(nao|cancelar|cancela)$/.test(normalized)) return "no";
  return undefined;
}

function labelFor(type: Required<ParsedRequest>["documentType"]): string {
  return {
    diagnostico_fiscal: "o diagnóstico fiscal federal",
    situacao_fiscal: "a situação fiscal",
    dctfweb: "a DCTFWeb",
    caixa_postal: "as mensagens da caixa postal",
  }[type];
}

function formatCnpj(value: string): string {
  return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function formatPeriod(value: string): string {
  const [year, month] = value.split("-");
  return `${month}/${year}`;
}

function formatList(values: string[]): string {
  if (values.length < 2) return values[0] ?? "os dados necessários";
  return `${values.slice(0, -1).join(", ")} e ${values.at(-1)}`;
}

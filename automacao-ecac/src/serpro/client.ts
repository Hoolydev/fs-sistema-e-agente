import { readFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { setTimeout as sleep } from "node:timers/promises";
import type { AppConfig } from "../config.js";
import { isValidCnpj } from "../orchestrator/parser.js";
import type { CertificateMaterial, CertificateProvider } from "../security/certificate-provider.js";

const AUTH_URL = "https://autenticacao.sapi.serpro.gov.br/authenticate";
const API_URL = "https://gateway.apiserpro.serpro.gov.br/integra-contador/v1";
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

export class SerproError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SerproError";
  }
}

export interface SerproHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
  certificate?: CertificateMaterial;
}
export interface SerproHttpResponse { status: number; body: unknown }
export type SerproTransport = (input: SerproHttpRequest) => Promise<SerproHttpResponse>;

// Fixed HTTPS destinations, normal TLS validation, no redirects and no response-body logging.
export const serproHttpsTransport: SerproTransport = (input) => new Promise((resolve, reject) => {
  if (![AUTH_URL, `${API_URL}/Apoiar`, `${API_URL}/Emitir`].includes(input.url)) {
    reject(new SerproError("destination", "Destino Serpro inválido."));
    return;
  }
  const req = httpsRequest(input.url, {
    method: "POST",
    headers: { ...input.headers, "content-length": String(Buffer.byteLength(input.body)) },
    ...(input.certificate ? {
      pfx: input.certificate.pfx,
      passphrase: input.certificate.passphrase,
    } : {}),
    signal: AbortSignal.timeout(input.timeoutMs),
  }, (res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) {
        req.destroy(new SerproError("response_size", "Resposta Serpro excede o limite permitido."));
      } else chunks.push(chunk);
    });
    res.on("error", () => reject(new SerproError("network", "A conexão com o Serpro foi interrompida.")));
    res.on("end", () => {
      const status = res.statusCode ?? 0;
      // Error responses can contain identifying information or HTML. Never propagate them.
      if (status !== 200 && status !== 202) { resolve({ status, body: {} }); return; }
      try { resolve({ status, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
      catch { reject(new SerproError("response_format", "Resposta Serpro não contém JSON válido.")); }
    });
  });
  req.on("error", () => reject(new SerproError("network", "Falha de conexão, certificado ou prazo na comunicação com o Serpro.")));
  req.end(input.body);
});

export function assertSerproConfiguration(config: AppConfig): void {
  if (!config.SERPRO_ENABLED) throw new SerproError("not_enabled", "A consulta pela API aguarda contratação e ativação do Integra Contador.");
  if (!isValidCnpj(config.SERPRO_CONTRACTOR_CNPJ) || !isValidCnpj(config.SERPRO_AUTHOR_CNPJ)) {
    throw new SerproError("configuration", "Configure os CNPJs do contratante e do autor da consulta no Serpro.");
  }
  if (config.SERPRO_AUTHOR_CNPJ !== config.SERPRO_CONTRACTOR_CNPJ) {
    throw new SerproError("delegation_not_supported", "Esta etapa exige contratante e autor com o mesmo CNPJ. A delegação entre empresas ainda precisa ser implementada.");
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SerproError("response_format", "Estrutura de resposta Serpro inválida.");
  return value as Record<string, unknown>;
}
function dataRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") throw new SerproError("response_format", "Campo dados do Serpro inválido.");
  try { return record(JSON.parse(value)); }
  catch { throw new SerproError("response_format", "Campo dados do Serpro não contém JSON válido."); }
}
function statusError(status: number): SerproError {
  if (status === 401 || status === 403) return new SerproError("access_denied", "Serpro recusou o acesso. Verifique contrato, certificado, credenciais e procuração.");
  return new SerproError("service_unavailable", `A consulta Serpro não foi concluída (status ${status}). A equipe precisa revisar antes de repetir.`);
}

export function decodeSerproPdf(value: unknown): Buffer {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_RESPONSE_BYTES ||
      value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new SerproError("invalid_pdf", "Serpro não retornou um PDF base64 válido.");
  }
  const pdf = Buffer.from(value, "base64");
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-" || !pdf.subarray(-1024).includes(Buffer.from("%%EOF"))) {
    throw new SerproError("invalid_pdf", "O relatório recebido está inválido ou incompleto.");
  }
  return pdf;
}

export class SerproSitfisClient {
  private tokens: { access: string; jwt: string; expiresAt: number } | undefined;
  constructor(
    private readonly config: AppConfig,
    private readonly certificates: CertificateProvider,
    private readonly transport: SerproTransport = serproHttpsTransport,
    private readonly wait: (ms: number) => Promise<unknown> = sleep,
    private readonly now: () => number = Date.now,
  ) {}

  async obtainSituationPdf(cnpj: string): Promise<Buffer> {
    assertSerproConfiguration(this.config);
    if (!isValidCnpj(cnpj)) throw new SerproError("invalid_cnpj", "CNPJ do contribuinte inválido.");
    // Apoiar is issued once. Ambiguous network failures never trigger a new paid collection.
    const initial = await this.call("Apoiar", "SOLICITARPROTOCOLO91", cnpj, "");
    if (initial.status !== 200) throw statusError(initial.status);
    const data = dataRecord(initial.body.dados);
    if (typeof data.protocoloRelatorio !== "string" || !data.protocoloRelatorio.trim()) {
      throw new SerproError("protocol_unavailable", "Serpro ainda não disponibilizou protocolo. A equipe precisa revisar antes de repetir a consulta.");
    }
    const deadline = this.now() + this.config.SERPRO_POLL_TIMEOUT_MS;
    let delay: unknown = data.tempoEspera ?? 1000;
    for (let attempt = 0; attempt < this.config.SERPRO_MAX_POLL_ATTEMPTS; attempt += 1) {
      if (typeof delay !== "number" || !Number.isFinite(delay) || delay < 0) {
        throw new SerproError("response_format", "Tempo de espera Serpro inválido.");
      }
      const delayMs = Math.max(1000, delay); // Official tempoEspera is in milliseconds.
      if (this.now() + delayMs >= deadline) break;
      await this.wait(delayMs);
      const remaining = deadline - this.now();
      if (remaining <= 0) break;
      const response = await this.call("Emitir", "RELATORIOSITFIS92", cnpj,
        JSON.stringify({ protocoloRelatorio: data.protocoloRelatorio }), remaining);
      if (response.status !== 200 && response.status !== 202) throw statusError(response.status);
      const emitted = dataRecord(response.body.dados);
      if (response.status === 200) return decodeSerproPdf(emitted.pdf);
      delay = emitted.tempoEspera ?? 5000;
    }
    throw new SerproError("processing_timeout", "O relatório segue em processamento no Serpro. A equipe precisa revisar antes de repetir a consulta.");
  }

  private async authenticate(): Promise<void> {
    if (this.tokens && this.tokens.expiresAt > this.now() + 30_000) return;
    let key: string, secret: string;
    try {
      [key, secret] = await Promise.all([
        readFile(this.config.SERPRO_CONSUMER_KEY_FILE, "utf8"),
        readFile(this.config.SERPRO_CONSUMER_SECRET_FILE, "utf8"),
      ]);
    } catch { throw new SerproError("credentials_missing", "As credenciais do contrato Serpro ainda não foram instaladas."); }
    if (!key.trim() || !secret.trim()) throw new SerproError("credentials_missing", "As credenciais do contrato Serpro estão vazias.");
    let certificate: CertificateMaterial;
    try { certificate = await this.certificates.getForCnpj(this.config.SERPRO_CONTRACTOR_CNPJ); }
    catch { throw new SerproError("certificate_missing", "O certificado do contratante Serpro não está disponível."); }
    try {
      const result = await this.transport({
        url: AUTH_URL,
        headers: {
          authorization: `Basic ${Buffer.from(`${key.trim()}:${secret.trim()}`).toString("base64")}`,
          "role-type": "TERCEIROS", "content-type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials", certificate,
        timeoutMs: this.config.SERPRO_REQUEST_TIMEOUT_MS,
      });
      if (result.status !== 200) throw statusError(result.status);
      const body = record(result.body);
      if (typeof body.access_token !== "string" || !body.access_token || typeof body.jwt_token !== "string" || !body.jwt_token ||
          typeof body.expires_in !== "number" || !Number.isFinite(body.expires_in) || body.expires_in <= 0) {
        throw new SerproError("authentication_format", "A autenticação Serpro não retornou os tokens esperados.");
      }
      this.tokens = { access: body.access_token, jwt: body.jwt_token, expiresAt: this.now() + body.expires_in * 1000 };
    } finally { certificate.pfx.fill(0); }
  }

  private async call(endpoint: "Apoiar" | "Emitir", service: string, cnpj: string, dados: string,
    remainingMs = this.config.SERPRO_REQUEST_TIMEOUT_MS): Promise<{ status: number; body: Record<string, unknown> }> {
    await this.authenticate();
    const response = await this.transport({
      url: `${API_URL}/${endpoint}`,
      headers: { authorization: `Bearer ${this.tokens!.access}`, jwt_token: this.tokens!.jwt, "content-type": "application/json" },
      body: JSON.stringify({
        contratante: { numero: this.config.SERPRO_CONTRACTOR_CNPJ, tipo: 2 },
        autorPedidoDados: { numero: this.config.SERPRO_AUTHOR_CNPJ, tipo: 2 },
        contribuinte: { numero: cnpj, tipo: 2 },
        pedidoDados: { idSistema: "SITFIS", idServico: service, versaoSistema: "2.0", dados },
      }),
      timeoutMs: Math.min(this.config.SERPRO_REQUEST_TIMEOUT_MS, remainingMs),
    });
    if (response.status !== 200 && response.status !== 202) {
      if (response.status === 401) this.tokens = undefined;
      throw statusError(response.status);
    }
    const body = record(response.body);
    if (typeof body.status !== "number" || !Number.isInteger(body.status)) throw new SerproError("response_format", "Status interno Serpro inválido.");
    if (body.status !== 200 && body.status !== 202) throw statusError(body.status);
    const taxpayer = record(body.contribuinte);
    if (taxpayer.numero !== cnpj || taxpayer.tipo !== 2) throw new SerproError("taxpayer_mismatch", "A resposta Serpro pertence a outro contribuinte.");
    return { status: body.status, body };
  }
}

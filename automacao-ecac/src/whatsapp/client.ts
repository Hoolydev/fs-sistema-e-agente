import { extname } from "node:path";
import { readFile } from "node:fs/promises";
import type { AppConfig } from "../config.js";
import type { AppLogger } from "../logger.js";
import { detectMime, MediaError } from "./media.js";

interface GraphResponse {
  messages?: Array<{ id: string }>;
  id?: string;
  error?: { message: string; type: string; code: number };
}

interface ZApiResponse {
  zaapId?: string;
  messageId?: string;
  id?: string;
  error?: string;
}

export interface WhatsAppGateway {
  sendText(to: string, body: string): Promise<string>;
  sendDocument(to: string, path: string, filename: string, caption: string): Promise<string>;
  // Provedores cuja mídia recebida não tem link público baixam o arquivo por aqui (Evolution).
  fetchMedia?(url: string, maxBytes: number): Promise<{ content: Buffer; mime: string }>;
}

export class MetaWhatsAppGateway implements WhatsAppGateway {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger,
  ) {}

  async sendText(to: string, body: string): Promise<string> {
    if (this.config.WHATSAPP_DRY_RUN) {
      this.logger.info({ to, body }, "whatsapp dry-run text");
      return `dry-run-${Date.now()}`;
    }
    const response = await this.graphRequest(`/${this.config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body },
      }),
    });
    return this.requireMessageId(response);
  }

  async sendDocument(to: string, path: string, filename: string, caption: string): Promise<string> {
    if (this.config.WHATSAPP_DRY_RUN) {
      this.logger.info({ to, path, filename, caption }, "whatsapp dry-run document");
      return `dry-run-${Date.now()}`;
    }

    const mediaId = await this.uploadMedia(path, filename);
    const response = await this.graphRequest(`/${this.config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "document",
        document: { id: mediaId, filename, caption },
      }),
    });
    return this.requireMessageId(response);
  }

  private async uploadMedia(path: string, filename: string): Promise<string> {
    const content = await readFile(path);
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("type", "application/pdf");
    form.set("file", new Blob([new Uint8Array(content)], { type: "application/pdf" }), filename);
    const response = await this.graphRequest(`/${this.config.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: "POST",
      body: form,
    });
    if (!response.id) throw new Error("Meta não retornou o identificador da mídia");
    return response.id;
  }

  private async graphRequest(path: string, init: RequestInit): Promise<GraphResponse> {
    if (!this.config.WHATSAPP_ACCESS_TOKEN || !this.config.WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error("Credenciais do WhatsApp não configuradas");
    }
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.config.WHATSAPP_ACCESS_TOKEN}`);
    const response = await fetch(
      `https://graph.facebook.com/${this.config.META_GRAPH_API_VERSION}${path}`,
      { ...init, headers },
    );
    const data = (await response.json()) as GraphResponse;
    if (!response.ok || data.error) {
      throw new Error(`Falha na API da Meta: ${data.error?.message ?? response.statusText}`);
    }
    return data;
  }

  private requireMessageId(response: GraphResponse): string {
    const id = response.messages?.[0]?.id;
    if (!id) throw new Error("Meta não retornou o identificador da mensagem");
    return id;
  }
}

export class ZApiWhatsAppGateway implements WhatsAppGateway {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger,
  ) {}

  async sendText(to: string, body: string): Promise<string> {
    if (this.config.WHATSAPP_DRY_RUN) {
      this.logger.info({ to, body }, "z-api dry-run text");
      return `dry-run-${Date.now()}`;
    }

    const response = await this.request("send-text", {
      phone: to,
      message: body,
    });
    return this.requireMessageId(response);
  }

  async sendDocument(to: string, path: string, filename: string, caption: string): Promise<string> {
    if (this.config.WHATSAPP_DRY_RUN) {
      this.logger.info({ to, path, filename, caption }, "z-api dry-run document");
      return `dry-run-${Date.now()}`;
    }

    const extension = extname(filename).slice(1).toLowerCase() || "pdf";
    if (!/^[a-z0-9]{1,10}$/.test(extension)) {
      throw new Error("Extensão de documento inválida para envio pela Z-API");
    }
    const contents = await readFile(path);
    const response = await this.request(`send-document/${extension}`, {
      phone: to,
      document: `data:application/pdf;base64,${contents.toString("base64")}`,
      fileName: filename,
      caption,
    });
    return this.requireMessageId(response);
  }

  private async request(path: string, body: Record<string, unknown>): Promise<ZApiResponse> {
    const { ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = this.config;
    if (!ZAPI_INSTANCE_ID || !ZAPI_INSTANCE_TOKEN || !ZAPI_CLIENT_TOKEN) {
      throw new Error("Credenciais da Z-API não configuradas");
    }

    const baseUrl = this.config.ZAPI_BASE_URL.replace(/\/$/, "");
    const response = await fetch(
      `${baseUrl}/instances/${encodeURIComponent(ZAPI_INSTANCE_ID)}/token/${encodeURIComponent(ZAPI_INSTANCE_TOKEN)}/${path}`,
      {
        method: "POST",
        headers: {
          "Client-Token": ZAPI_CLIENT_TOKEN,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const data = (await response.json().catch(() => ({}))) as ZApiResponse;
    if (!response.ok || data.error) {
      throw new Error(`Falha na Z-API: ${data.error ?? response.statusText}`);
    }
    return data;
  }

  private requireMessageId(response: ZApiResponse): string {
    const id = response.messageId ?? response.id ?? response.zaapId;
    if (!id) throw new Error("Z-API não retornou o identificador da mensagem");
    return id;
  }
}

// Mídia recebida pela Evolution: o arquivo do WhatsApp é criptografado; a própria Evolution entrega o conteúdo pelo id da mensagem.
export const EVOLUTION_MEDIA_PREFIX = "evolution-media:";
const documentMimes: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
interface EvolutionResponse { key?: { id?: string }; base64?: string; message?: unknown; response?: { message?: unknown } }

export class EvolutionWhatsAppGateway implements WhatsAppGateway {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async sendText(to: string, body: string): Promise<string> {
    if (this.config.WHATSAPP_DRY_RUN) {
      this.logger.info({ to, body }, "evolution dry-run text");
      return `dry-run-${Date.now()}`;
    }
    return this.requireMessageId(await this.request(`message/sendText/${this.config.EVOLUTION_INSTANCE}`, { number: to, text: body }));
  }

  async sendDocument(to: string, path: string, filename: string, caption: string): Promise<string> {
    if (this.config.WHATSAPP_DRY_RUN) {
      this.logger.info({ to, path, filename, caption }, "evolution dry-run document");
      return `dry-run-${Date.now()}`;
    }
    const extension = extname(filename).slice(1).toLowerCase() || "pdf";
    const mimetype = documentMimes[extension];
    if (!mimetype) throw new Error("Extensão de documento inválida para envio pela Evolution");
    const contents = await readFile(path);
    return this.requireMessageId(await this.request(`message/sendMedia/${this.config.EVOLUTION_INSTANCE}`, {
      number: to, mediatype: "document", mimetype, media: contents.toString("base64"), fileName: filename, caption,
    }));
  }

  async fetchMedia(url: string, maxBytes: number): Promise<{ content: Buffer; mime: string }> {
    const id = url.startsWith(EVOLUTION_MEDIA_PREFIX) ? url.slice(EVOLUTION_MEDIA_PREFIX.length) : "";
    if (!/^[A-Za-z0-9]{6,64}$/.test(id)) throw new MediaError("download_failed");
    const data = await this.request(`chat/getBase64FromMediaMessage/${this.config.EVOLUTION_INSTANCE}`, { message: { key: { id } }, convertToMp4: false })
      .catch(() => { throw new MediaError("download_failed"); });
    const base64 = typeof data.base64 === "string" ? data.base64.replace(/^data:[^,]*,/, "") : "";
    if (!base64) throw new MediaError("download_failed");
    if (Math.floor(base64.length * 3 / 4) > maxBytes + 3) throw new MediaError("too_large");
    const content = Buffer.from(base64, "base64");
    if (content.length > maxBytes) throw new MediaError("too_large");
    const mime = detectMime(content);
    if (!mime) throw new MediaError("unsupported");
    return { content, mime };
  }

  private async request(path: string, body: Record<string, unknown>): Promise<EvolutionResponse> {
    const { EVOLUTION_BASE_URL, EVOLUTION_API_KEY } = this.config;
    if (!EVOLUTION_BASE_URL || !EVOLUTION_API_KEY) throw new Error("Credenciais da Evolution não configuradas");
    const response = await this.fetcher(`${EVOLUTION_BASE_URL.replace(/\/$/, "")}/${path}`, {
      method: "POST",
      headers: { apikey: EVOLUTION_API_KEY, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await response.json().catch(() => ({}))) as EvolutionResponse;
    if (!response.ok) {
      const detail = data.response?.message ?? data.message ?? response.statusText;
      throw new Error(`Falha na Evolution (${response.status}): ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 200)}`);
    }
    return data;
  }

  private requireMessageId(response: EvolutionResponse): string {
    const id = response.key?.id;
    if (!id) throw new Error("Evolution não retornou o identificador da mensagem");
    return id;
  }
}

export function createWhatsAppGateway(config: AppConfig, logger: AppLogger): WhatsAppGateway {
  if (config.WHATSAPP_PROVIDER === "evolution") return new EvolutionWhatsAppGateway(config, logger);
  return config.WHATSAPP_PROVIDER === "zapi"
    ? new ZApiWhatsAppGateway(config, logger)
    : new MetaWhatsAppGateway(config, logger);
}

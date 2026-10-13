import type { InboundMessage } from "../domain/types.js";

interface WhatsAppPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

export function extractInboundMessages(payload: unknown): InboundMessage[] {
  const body = payload as WhatsAppPayload;
  if (body.object !== "whatsapp_business_account") {
    return [];
  }

  const extracted: InboundMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      for (const message of change.value?.messages ?? []) {
        if (!message.id || !message.from || !message.timestamp || !message.type) continue;
        const timestampSeconds = Number(message.timestamp);
        if (!Number.isFinite(timestampSeconds)) continue;
        extracted.push({
          messageId: message.id,
          from: message.from,
          timestamp: new Date(timestampSeconds * 1000),
          type: message.type,
          ...(message.text?.body ? { text: message.text.body } : {}),
        });
      }
    }
  }
  return extracted;
}

interface ZApiPayload {
  instanceId?: string;
  messageId?: string;
  phone?: string;
  fromMe?: boolean;
  momment?: number;
  type?: string;
  isGroup?: boolean;
  isNewsletter?: boolean;
  isStatusReply?: boolean;
  broadcast?: boolean;
  text?: { message?: string };
  image?: { imageUrl?: string; mimeType?: string; caption?: string };
  document?: { documentUrl?: string; mimeType?: string; fileName?: string; title?: string; caption?: string };
}

export function extractZApiInboundMessages(
  payload: unknown,
  expectedInstanceId: string,
): InboundMessage[] {
  const message = payload as ZApiPayload;
  if (
    message.type !== "ReceivedCallback" ||
    !message.instanceId ||
    message.instanceId !== expectedInstanceId ||
    !message.messageId ||
    !message.phone ||
    !Number.isFinite(message.momment) ||
    message.fromMe ||
    message.isGroup ||
    message.isNewsletter ||
    message.isStatusReply ||
    message.broadcast
  ) {
    return [];
  }

  const moment = Number(message.momment);
  const timestampMs = moment < 1_000_000_000_000 ? moment * 1000 : moment;
  const base = { messageId: message.messageId, from: message.phone, timestamp: new Date(timestampMs) };
  if (message.text?.message) return [{ ...base, type: "text", text: message.text.message }];
  // Foto ou arquivo (comprovantes): só a URL é guardada; o conteúdo é baixado e validado depois.
  const image = message.image?.imageUrl, document = message.document?.documentUrl;
  if (image && /^https:\/\//.test(image)) return [{ ...base, type: "image", media: { url: image, mimeType: message.image?.mimeType ?? "image/jpeg", ...(message.image?.caption ? { caption: message.image.caption } : {}) } }];
  if (document && /^https:\/\//.test(document)) return [{ ...base, type: "document", media: { url: document, mimeType: message.document?.mimeType ?? "application/octet-stream", fileName: message.document?.fileName ?? message.document?.title ?? "documento", ...(message.document?.caption ? { caption: message.document.caption } : {}) } }];
  return [{ ...base, type: "unsupported" }];
}

// Evolution API (Baileys). Só conversas individuais recebidas; grupos, status, canais e mensagens próprias são ignorados.
interface EvolutionMediaMessage { caption?: string; mimetype?: string; fileName?: string; title?: string }
interface EvolutionPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: { id?: string; remoteJid?: string; remoteJidAlt?: string; senderPn?: string; fromMe?: boolean };
    messageTimestamp?: number | string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      imageMessage?: EvolutionMediaMessage;
      documentMessage?: EvolutionMediaMessage;
      documentWithCaptionMessage?: { message?: { documentMessage?: EvolutionMediaMessage } };
    };
  };
}
export const evolutionEvent = (payload: unknown) => String((payload as EvolutionPayload)?.event ?? "").toLowerCase().replace(/_/g, ".");
// Celular brasileiro antigo aparece no WhatsApp sem o nono dígito (55 + DDD + 8 dígitos); o cadastro da equipe usa 13 dígitos.
export function brazilianMobile(phone: string) {
  return /^55\d{2}[6-9]\d{7}$/.test(phone) ? `${phone.slice(0, 4)}9${phone.slice(4)}` : phone;
}
export function extractEvolutionInboundMessages(payload: unknown, expectedInstance: string): InboundMessage[] {
  const body = payload as EvolutionPayload;
  if (evolutionEvent(payload) !== "messages.upsert" || body.instance !== expectedInstance) return [];
  const data = body.data, key = data?.key;
  if (!data || !key?.id || key.fromMe || !key.remoteJid || /@(g\.us|broadcast|newsletter)$/.test(key.remoteJid)) return [];
  // Com o endereçamento LID, o número real vem em remoteJidAlt/senderPn.
  const jid = [key.remoteJid, key.remoteJidAlt, key.senderPn].find(v => typeof v === "string" && /^\d{8,15}@s\.whatsapp\.net$/.test(v));
  const seconds = Number(data.messageTimestamp);
  if (!jid || !Number.isFinite(seconds)) return [];
  const base = { messageId: key.id, from: brazilianMobile(jid.split("@")[0]!), timestamp: new Date(seconds < 1_000_000_000_000 ? seconds * 1000 : seconds) };
  const m = data.message ?? {};
  const text = m.conversation ?? m.extendedTextMessage?.text;
  if (text) return [{ ...base, type: "text", text }];
  const media = `evolution-media:${key.id}`;
  if (m.imageMessage) return [{ ...base, type: "image", media: { url: media, mimeType: m.imageMessage.mimetype ?? "image/jpeg", ...(m.imageMessage.caption ? { caption: m.imageMessage.caption } : {}) } }];
  const document = m.documentMessage ?? m.documentWithCaptionMessage?.message?.documentMessage;
  if (document) return [{ ...base, type: "document", media: { url: media, mimeType: document.mimetype ?? "application/octet-stream", fileName: document.fileName ?? document.title ?? "documento", ...(document.caption ? { caption: document.caption } : {}) } }];
  return [{ ...base, type: "unsupported" }];
}

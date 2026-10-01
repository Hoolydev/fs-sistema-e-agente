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

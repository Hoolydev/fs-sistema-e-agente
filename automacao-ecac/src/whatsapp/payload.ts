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
  return [
    {
      messageId: message.messageId,
      from: message.phone,
      timestamp: new Date(timestampMs),
      type: message.text?.message ? "text" : "unsupported",
      ...(message.text?.message ? { text: message.text.message } : {}),
    },
  ];
}

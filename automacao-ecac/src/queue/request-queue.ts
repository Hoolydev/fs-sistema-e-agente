import { createHash, randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import type { RedisOptions } from "ioredis";
import type { InboundMessage, ParsedRequest, RpaRequest } from "../domain/types.js";

export const REQUEST_QUEUE = "ecac-document-requests";

export interface RequestPublisher {
  publish(message: InboundMessage, parsed: Required<ParsedRequest>): Promise<RpaRequest>;
}

export class BullMqRequestPublisher implements RequestPublisher {
  private readonly queue: Queue<RpaRequest>;

  constructor(connection: RedisOptions) {
    this.queue = new Queue<RpaRequest>(REQUEST_QUEUE, { connection });
  }

  async publish(message: InboundMessage, parsed: Required<ParsedRequest>): Promise<RpaRequest> {
    const request: RpaRequest = {
      requestId: randomUUID(),
      sourceMessageId: message.messageId,
      requesterPhone: message.from,
      cnpj: parsed.cnpj,
      period: parsed.period,
      documentType: parsed.documentType,
    };
    const stableId = createHash("sha256")
      .update(`${message.messageId}:${parsed.cnpj}:${parsed.period}:${parsed.documentType}`)
      .digest("hex");
    await this.queue.add("obtain-document", request, {
      jobId: stableId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 5_000 },
      removeOnFail: { age: 604_800, count: 10_000 },
    });
    return request;
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function redisConnectionFromUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    db: Number.isInteger(db) ? db : 0,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

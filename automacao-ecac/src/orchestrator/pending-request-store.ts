import type { Redis } from "ioredis";
import type { InboundMessage, ParsedRequest } from "../domain/types.js";

export interface PendingRequest {
  sourceMessage: InboundMessage;
  parsed: Required<ParsedRequest>;
}

export interface PendingRequestStore {
  get(phone: string): Promise<PendingRequest | undefined>;
  set(phone: string, value: PendingRequest): Promise<void>;
  clear(phone: string): Promise<void>;
}

export class RedisPendingRequestStore implements PendingRequestStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds = 600,
  ) {}

  async get(phone: string): Promise<PendingRequest | undefined> {
    const serialized = await this.redis.get(this.key(phone));
    if (!serialized) return undefined;
    const value = JSON.parse(serialized) as Omit<PendingRequest, "sourceMessage"> & {
      sourceMessage: Omit<InboundMessage, "timestamp"> & { timestamp: string };
    };
    return {
      ...value,
      sourceMessage: {
        ...value.sourceMessage,
        timestamp: new Date(value.sourceMessage.timestamp),
      },
    };
  }

  async set(phone: string, value: PendingRequest): Promise<void> {
    await this.redis.set(this.key(phone), JSON.stringify(value), "EX", this.ttlSeconds);
  }

  async clear(phone: string): Promise<void> {
    await this.redis.del(this.key(phone));
  }

  private key(phone: string): string {
    return `pending-request:${phone}`;
  }
}

export class InMemoryPendingRequestStore implements PendingRequestStore {
  private readonly values = new Map<string, PendingRequest>();

  async get(phone: string): Promise<PendingRequest | undefined> {
    return this.values.get(phone);
  }

  async set(phone: string, value: PendingRequest): Promise<void> {
    this.values.set(phone, value);
  }

  async clear(phone: string): Promise<void> {
    this.values.delete(phone);
  }
}

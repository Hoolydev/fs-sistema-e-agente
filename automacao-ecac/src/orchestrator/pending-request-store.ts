import type { Redis } from "ioredis";
import type { InboundMedia, InboundMessage, ParsedRequest } from "../domain/types.js";

// Conversa em andamento com um número: análise aguardando SIM/NÃO, comprovante aguardando a empresa
// ou oferta de reserva Serpro para um pedido parado no Mac.
export type PendingRequest =
  | { kind: "analysis"; sourceMessage: InboundMessage; parsed: Required<ParsedRequest>; via: "mac" | "serpro" }
  | { kind: "receipt"; sourceMessage: InboundMessage; media: InboundMedia }
  | { kind: "serpro-fallback"; macJobId: string; parsed: Required<ParsedRequest> };
export interface PendingRequestStore {
  get(phone: string): Promise<PendingRequest | undefined>;
  set(phone: string, value: PendingRequest, ttlSeconds?: number): Promise<void>;
  clear(phone: string): Promise<void>;
}
const revive = (value: PendingRequest): PendingRequest => "sourceMessage" in value
  ? { ...value, sourceMessage: { ...value.sourceMessage, timestamp: new Date(value.sourceMessage.timestamp) } }
  : value;
export class RedisPendingRequestStore implements PendingRequestStore {
  constructor(private readonly redis: Redis, private readonly ttlSeconds = 600) {}
  async get(phone: string): Promise<PendingRequest | undefined> {
    const serialized = await this.redis.get(this.key(phone));
    return serialized ? revive(JSON.parse(serialized) as PendingRequest) : undefined;
  }
  async set(phone: string, value: PendingRequest, ttlSeconds = this.ttlSeconds): Promise<void> {
    await this.redis.set(this.key(phone), JSON.stringify(value), "EX", ttlSeconds);
  }
  async clear(phone: string): Promise<void> { await this.redis.del(this.key(phone)); }
  private key(phone: string): string { return `pending-request:${phone}`; }
}
export class InMemoryPendingRequestStore implements PendingRequestStore {
  private readonly values = new Map<string, PendingRequest>();
  async get(phone: string) { return this.values.get(phone); }
  async set(phone: string, value: PendingRequest) { this.values.set(phone, value); }
  async clear(phone: string) { this.values.delete(phone); }
}

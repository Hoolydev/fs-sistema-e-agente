import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import type { MacJob } from "../domain/types.js";

// Fila de pedidos para o Mac: um por vez, reserva com prazo, idempotência por id e estados observáveis.
export const LEASE_MS = 30 * 60 * 1000;
export interface MacJobQueue {
  create(input: Pick<MacJob, "cnpj" | "razao" | "requesterPhone" | "requesterName" | "operation">, id?: string): Promise<MacJob>;
  get(id: string): Promise<MacJob | undefined>;
  save(job: MacJob): Promise<void>;
  list(): Promise<MacJob[]>;
  // Próximo pedido pendente, reservado para o Mac; reserva vencida volta a ficar disponível.
  claim(now?: number): Promise<MacJob | undefined>;
}
export class InMemoryMacJobQueue implements MacJobQueue {
  readonly jobs = new Map<string, MacJob>();
  async create(input: Pick<MacJob, "cnpj" | "razao" | "requesterPhone" | "requesterName" | "operation">, id: string = randomUUID()) {
    const existing = this.jobs.get(id);
    if (existing) return existing;
    const job: MacJob = { ...input, id, state: "pending", status: "recebido", note: "", createdAt: new Date().toISOString() };
    this.jobs.set(id, job);
    return job;
  }
  async get(id: string) { return this.jobs.get(id); }
  async save(job: MacJob) { this.jobs.set(job.id, job); }
  async list() { return [...this.jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
  async claim(now = Date.now()) { return claimFrom(await this.list(), now, (job) => this.save(job)); }
}
async function claimFrom(jobs: MacJob[], now: number, save: (job: MacJob) => Promise<void>): Promise<MacJob | undefined> {
  const inflight = jobs.find((j) => j.state === "inflight");
  if (inflight) {
    if (now - Date.parse(inflight.leasedAt ?? inflight.createdAt) < LEASE_MS) return undefined;
    inflight.state = "pending"; inflight.note = "Reserva do Mac expirou; pedido voltou para a fila."; await save(inflight);
  }
  const next = jobs.filter((j) => j.state === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!next) return undefined;
  next.state = "inflight"; next.leasedAt = new Date(now).toISOString(); next.status = "aguardando_mac"; await save(next);
  return next;
}
export class RedisMacJobQueue implements MacJobQueue {
  constructor(private readonly redis: Redis) {}
  private key(id: string) { return `mac:job:${id}`; }
  async create(input: Pick<MacJob, "cnpj" | "razao" | "requesterPhone" | "requesterName" | "operation">, id: string = randomUUID()) {
    const job: MacJob = { ...input, id, state: "pending", status: "recebido", note: "", createdAt: new Date().toISOString() };
    const stored = await this.redis.set(this.key(id), JSON.stringify(job), "NX");
    if (stored !== "OK") return (await this.get(id))!;
    await this.redis.sadd("mac:jobs", id);
    return job;
  }
  async get(id: string) { const raw = await this.redis.get(this.key(id)); return raw ? (JSON.parse(raw) as MacJob) : undefined; }
  async save(job: MacJob) { await this.redis.set(this.key(job.id), JSON.stringify(job)); }
  async list() {
    const ids = await this.redis.smembers("mac:jobs");
    const jobs = (await Promise.all(ids.map((id) => this.get(id)))).filter((j): j is MacJob => !!j);
    return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async claim(now = Date.now()) {
    // Lock curto evita que dois ciclos de pull reservem o mesmo pedido.
    const lock = await this.redis.set("mac:claim-lock", "1", "PX", 5000, "NX");
    if (lock !== "OK") return undefined;
    try { return await claimFrom(await this.list(), now, (job) => this.save(job)); } finally { await this.redis.del("mac:claim-lock"); }
  }
}

import type { AppConfig } from "../config.js";

// Cliente das APIs privadas do sistema FS usadas pelo agente: equipe, empresas, comprovantes e caixa de avisos.
export type TeamTask = "comprovantes" | "analises" | "avisos";
export interface TeamMember { id: string; name: string; role: "admin" | "advogado" | "operador"; phone: string; tasks: TeamTask[] }
export interface Company { cnpj: string; name: string }
export interface PendingNotification { id: string; kind: string; phone: string; recipient: string; message: string }
export interface Platform {
  team(): Promise<TeamMember[]>;
  member(phone: string): Promise<TeamMember | null>;
  companies(query: string): Promise<Company[]>;
  archiveReceipt(input: { externalId: string; cnpj: string; company: string; filename: string; mime: string; note: string; content: Buffer }, phone: string): Promise<{ id: string; company: string }>;
  notifications(): Promise<PendingNotification[]>;
  acknowledge(id: string, sent: boolean, error?: string): Promise<void>;
}
export class SystemPlatform implements Platform {
  private cache: { at: number; members: TeamMember[] } | undefined;
  constructor(private readonly config: AppConfig, private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now) {}
  private url(path: string) {
    if (!this.config.FS_SYSTEM_URL || !this.config.FS_SYSTEM_API_TOKEN) throw new Error("system_not_configured");
    return `${this.config.FS_SYSTEM_URL.replace(/\/$/, "")}/api/agent${path}`;
  }
  private headers(phone?: string) { return { authorization: `Bearer ${this.config.FS_SYSTEM_API_TOKEN}`, ...(phone ? { "x-fs-requester-phone": phone } : {}) }; }
  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(this.url(path), { ...init, headers: { ...this.headers(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`system_${response.status}`);
    return response.json() as Promise<T>;
  }
  async team(): Promise<TeamMember[]> {
    if (this.cache && this.now() - this.cache.at < this.config.TEAM_CACHE_MS) return this.cache.members;
    const { members } = await this.json<{ members: TeamMember[] }>("/team");
    this.cache = { at: this.now(), members };
    return members;
  }
  async member(phone: string) { return (await this.team()).find((m) => m.phone === phone) ?? null; }
  async companies(query: string) { return (await this.json<{ companies: Company[] }>(`/companies?q=${encodeURIComponent(query)}`)).companies; }
  async archiveReceipt(input: { externalId: string; cnpj: string; company: string; filename: string; mime: string; note: string; content: Buffer }, phone: string) {
    const form = new FormData();
    form.set("metadata", JSON.stringify({ externalId: input.externalId, cnpj: input.cnpj, company: input.company, name: input.filename, kind: "comprovante", createdAt: new Date(this.now()).toISOString(), note: input.note }));
    form.set("file", new Blob([new Uint8Array(input.content)], { type: input.mime }), input.filename);
    const response = await this.fetcher(this.url("/documents"), { method: "POST", headers: this.headers(phone), body: form, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(response.status === 409 ? "receipt_duplicate" : `system_${response.status}`);
    return response.json() as Promise<{ id: string; company: string }>;
  }
  async notifications() { return (await this.json<{ notifications: PendingNotification[] }>("/notifications")).notifications; }
  async acknowledge(id: string, sent: boolean, error = "") {
    await this.json(`/notifications/${encodeURIComponent(id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sent, error }) });
  }
}

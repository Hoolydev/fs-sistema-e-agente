import { z } from "zod";
import { init, query } from "@/lib/comercial/store";
import type { Actor } from "@/lib/auth/server";
import { ownedBy, ownerFor, ownerClause, type Scope } from "@/lib/auth/scope";
import { isValidCnpj, normalizeCnpj } from "@/lib/diagnostico/model";

// Cadastro de empresas (Administrativo). É daqui que saem as empresas que entram no Controller; empresas que já
// estão em processos do Controller aparecem na lista mesmo sem cadastro explícito.
export const companySchema = z.object({
  name: z.string().trim().min(2).max(200).transform(s => s.replace(/\s+/g, " ").toUpperCase()),
  cnpj: z.string().max(18).transform(normalizeCnpj).refine(isValidCnpj, "CNPJ inválido"),
  notes: z.string().trim().max(500).default(""),
});
export type CompanyInput = z.infer<typeof companySchema>;
export type Company = { cnpj: string; name: string; notes: string; createdBy: string | null; createdAt: string | null; registered: boolean; ownerId: string | null };
let ready: Promise<void> | undefined;
export async function setupCompanies() {
  await init();
  if (!ready) ready = (async () => {
    await query("CREATE TABLE IF NOT EXISTS fs_companies (cnpj TEXT PRIMARY KEY, name TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_by_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    if (process.env.FS_CRM_DATABASE_URL || process.env.DATABASE_URL) await query("ALTER TABLE fs_companies ADD COLUMN IF NOT EXISTS owner_id TEXT"); else await query("ALTER TABLE fs_companies ADD COLUMN owner_id TEXT").catch(() => {});
  })().catch(e => { ready = undefined; throw e; });
  await ready;
}
export async function listCompanies(scope: Scope = null): Promise<Company[]> {
  await setupCompanies();
  const map = new Map<string, Company>(), owner = ownerClause(scope, "owner_id", 1);
  for (const r of await query(`SELECT cnpj,name,notes,created_by,created_at,owner_id FROM fs_companies WHERE 1=1${owner.sql}`, owner.values)) map.set(String(r.cnpj), { cnpj: String(r.cnpj), name: String(r.name), notes: String(r.notes ?? ""), createdBy: String(r.created_by), createdAt: String(r.created_at), registered: true, ownerId: r.owner_id ? String(r.owner_id) : null });
  for (const r of await query(`SELECT DISTINCT cnpj, company, owner_id FROM fs_controller_processes WHERE 1=1${owner.sql}`, owner.values).catch(() => [])) if (!map.has(String(r.cnpj))) map.set(String(r.cnpj), { cnpj: String(r.cnpj), name: String(r.company), notes: "", createdBy: null, createdAt: null, registered: false, ownerId: r.owner_id ? String(r.owner_id) : null });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export async function createCompany(input: CompanyInput, actor: Actor) {
  await setupCompanies();
  const at = new Date().toISOString();
  const inserted = await query("INSERT INTO fs_companies (cnpj,name,notes,created_by,created_by_id,created_at,updated_at,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(cnpj) DO NOTHING RETURNING cnpj", [input.cnpj, input.name, input.notes, actor.name, actor.id, at, at, ownerFor(actor)]);
  // O CNPJ pode já existir para outro dono; o externo não fica sabendo de quem é, só que não pode usar.
  if (!inserted.length) throw new Error("DUPLICATE_COMPANY");
  return (await listCompanies(scopeOf(actor))).find(c => c.cnpj === input.cnpj)!;
}
export async function updateCompany(cnpj: string, input: Pick<CompanyInput, "name" | "notes">, actor: Actor) {
  await setupCompanies();
  const scope = scopeOf(actor), current = (await listCompanies(scope)).find(c => c.cnpj === cnpj);
  if (!current || !ownedBy(scope, current.ownerId)) throw new Error("NOT_FOUND");
  const at = new Date().toISOString();
  // Empresa só conhecida pelo Controller passa a ter cadastro próprio ao ser editada.
  await query("INSERT INTO fs_companies (cnpj,name,notes,created_by,created_by_id,created_at,updated_at,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(cnpj) DO UPDATE SET name=excluded.name, notes=excluded.notes, updated_at=excluded.updated_at", [cnpj, input.name, input.notes, actor.name, actor.id, at, at, current.ownerId ?? ownerFor(actor)]);
  return (await listCompanies(scope)).find(c => c.cnpj === cnpj)!;
}
const scopeOf = (actor: Actor): Scope => actor.role === "externo" ? { ownerId: actor.id } : null;

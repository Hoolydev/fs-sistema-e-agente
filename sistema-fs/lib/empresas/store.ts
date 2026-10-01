import { z } from "zod";
import { init, query } from "@/lib/comercial/store";
import type { Actor } from "@/lib/auth/server";
import { isValidCnpj, normalizeCnpj } from "@/lib/diagnostico/model";

// Cadastro de empresas (Administrativo). É daqui que saem as empresas que entram no Controller; empresas que já
// estão em processos do Controller aparecem na lista mesmo sem cadastro explícito.
export const companySchema = z.object({
  name: z.string().trim().min(2).max(200).transform(s => s.replace(/\s+/g, " ").toUpperCase()),
  cnpj: z.string().max(18).transform(normalizeCnpj).refine(isValidCnpj, "CNPJ inválido"),
  notes: z.string().trim().max(500).default(""),
});
export type CompanyInput = z.infer<typeof companySchema>;
export type Company = { cnpj: string; name: string; notes: string; createdBy: string | null; createdAt: string | null; registered: boolean };
let ready: Promise<void> | undefined;
export async function setupCompanies() {
  await init();
  if (!ready) ready = (async () => {
    await query("CREATE TABLE IF NOT EXISTS fs_companies (cnpj TEXT PRIMARY KEY, name TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_by_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  })().catch(e => { ready = undefined; throw e; });
  await ready;
}
export async function listCompanies(): Promise<Company[]> {
  await setupCompanies();
  const map = new Map<string, Company>();
  for (const r of await query("SELECT cnpj,name,notes,created_by,created_at FROM fs_companies")) map.set(String(r.cnpj), { cnpj: String(r.cnpj), name: String(r.name), notes: String(r.notes ?? ""), createdBy: String(r.created_by), createdAt: String(r.created_at), registered: true });
  for (const r of await query("SELECT DISTINCT cnpj, company FROM fs_controller_processes").catch(() => [])) if (!map.has(String(r.cnpj))) map.set(String(r.cnpj), { cnpj: String(r.cnpj), name: String(r.company), notes: "", createdBy: null, createdAt: null, registered: false });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export async function createCompany(input: CompanyInput, actor: Actor) {
  await setupCompanies();
  const at = new Date().toISOString();
  const inserted = await query("INSERT INTO fs_companies (cnpj,name,notes,created_by,created_by_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(cnpj) DO NOTHING RETURNING cnpj", [input.cnpj, input.name, input.notes, actor.name, actor.id, at, at]);
  if (!inserted.length) throw new Error("DUPLICATE_COMPANY");
  return (await listCompanies()).find(c => c.cnpj === input.cnpj)!;
}
export async function updateCompany(cnpj: string, input: Pick<CompanyInput, "name" | "notes">, actor: Actor) {
  await setupCompanies();
  const at = new Date().toISOString();
  // Empresa só conhecida pelo Controller passa a ter cadastro próprio ao ser editada.
  await query("INSERT INTO fs_companies (cnpj,name,notes,created_by,created_by_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(cnpj) DO UPDATE SET name=$2, notes=$3, updated_at=$6", [cnpj, input.name, input.notes, actor.name, actor.id, at]);
  return (await listCompanies()).find(c => c.cnpj === cnpj)!;
}

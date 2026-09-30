import { randomUUID } from "node:crypto";
import { init, query } from "@/lib/comercial/store";
import { can } from "@/lib/auth/roles";
import type { Actor } from "@/lib/auth/server";
import { changedFields, fieldLabels, processFields, type AuditEntry, type ControllerProcess, type ProcessInput, type ReviewState } from "./model";

type Row = Record<string, unknown>;
const columns: Record<keyof ProcessInput, string> = { company: "company", cnpj: "cnpj", object: "object", admStatus: "adm_status", protocolDate: "protocol_date", deadline: "deadline", processNumber: "process_number", updatedOn: "updated_on", dispatchStatus: "dispatch_status", notes: "notes" };
let ready: Promise<void> | undefined;
export async function setupController() {
  await init();
  if (!ready) ready = (async () => {
    await query("CREATE TABLE IF NOT EXISTS fs_controller_processes (id TEXT PRIMARY KEY, company TEXT NOT NULL, cnpj TEXT NOT NULL, object TEXT NOT NULL, adm_status TEXT NOT NULL, protocol_date TEXT, deadline TEXT, process_number TEXT NOT NULL, updated_on TEXT, dispatch_status TEXT NOT NULL, notes TEXT NOT NULL, review_state TEXT NOT NULL, review_note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT)");
    await query("CREATE TABLE IF NOT EXISTS fs_controller_audit (id TEXT PRIMARY KEY, process_id TEXT NOT NULL, actor_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)");
    await query("CREATE INDEX IF NOT EXISTS fs_controller_audit_process ON fs_controller_audit (process_id, created_at)");
  })().catch(e => { ready = undefined; throw e; });
  await ready;
}
const text = (v: unknown) => v === null || v === undefined ? null : String(v);
const toProcess = (r: Row): ControllerProcess => ({
  id: String(r.id), company: String(r.company), cnpj: String(r.cnpj), object: String(r.object), admStatus: String(r.adm_status), protocolDate: text(r.protocol_date), deadline: text(r.deadline),
  processNumber: String(r.process_number), updatedOn: text(r.updated_on), dispatchStatus: String(r.dispatch_status), notes: String(r.notes),
  reviewState: r.review_state as ReviewState, reviewNote: String(r.review_note), createdBy: String(r.created_by), createdAt: String(r.created_at), updatedBy: String(r.updated_by), updatedAt: String(r.updated_at), reviewedBy: text(r.reviewed_by), reviewedAt: text(r.reviewed_at),
});
async function audit(processId: string, actor: Pick<Actor, "id" | "name">, action: string, detail: string, at: string) {
  await query("INSERT INTO fs_controller_audit (id,process_id,actor_id,actor,action,detail,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [randomUUID(), processId, actor.id, actor.name, action, detail, at]);
}
export async function listProcesses() { await setupController(); return (await query("SELECT * FROM fs_controller_processes ORDER BY company, created_at")).map(toProcess); }
export async function getProcess(id: string) { await setupController(); const [row] = await query("SELECT * FROM fs_controller_processes WHERE id=$1", [id]); return row ? toProcess(row) : null; }
export async function processHistory(id: string): Promise<AuditEntry[]> {
  await setupController();
  return (await query("SELECT id,actor,action,detail,created_at FROM fs_controller_audit WHERE process_id=$1 ORDER BY created_at DESC LIMIT 100", [id])).map(r => ({ id: String(r.id), actor: String(r.actor), action: String(r.action), detail: String(r.detail), createdAt: String(r.created_at) }));
}
// Regra de revisão: o que um revisor salva já sai revisado por ele; o que o perfil de inclusão salva aguarda revisão.
const stateFor = (actor: Actor, at: string) => can(actor.role, { processo: ["revisar"] })
  ? { reviewState: "aprovado" as ReviewState, reviewedBy: actor.name as string | null, reviewedAt: at as string | null }
  : { reviewState: "pendente" as ReviewState, reviewedBy: null, reviewedAt: null };
async function duplicate(processNumber: string, exceptId = "") {
  if (!processNumber) return false;
  return (await query("SELECT id FROM fs_controller_processes WHERE process_number=$1 AND id<>$2", [processNumber, exceptId])).length > 0;
}
export async function createProcess(input: ProcessInput, actor: Actor, origin = "Registro incluído") {
  await setupController();
  if (await duplicate(input.processNumber)) throw new Error("DUPLICATE_PROCESS");
  const id = randomUUID(), at = new Date().toISOString(), review = stateFor(actor, at);
  await query("INSERT INTO fs_controller_processes (id,company,cnpj,object,adm_status,protocol_date,deadline,process_number,updated_on,dispatch_status,notes,review_state,review_note,created_by,created_at,updated_by,updated_at,reviewed_by,reviewed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",
    [id, ...processFields.map(k => input[k]), review.reviewState, "", actor.name, at, actor.name, at, review.reviewedBy, review.reviewedAt]);
  await audit(id, actor, "incluiu", origin, at);
  return (await getProcess(id))!;
}
// `version` é o updatedAt lido pelo usuário: evita que duas pessoas sobrescrevam a alteração uma da outra.
export async function updateProcess(id: string, input: ProcessInput, version: string, actor: Actor) {
  await setupController();
  const current = await getProcess(id);
  if (!current) throw new Error("NOT_FOUND");
  if (current.updatedAt !== version) throw new Error("STALE");
  const changed = changedFields(current, input);
  if (!changed.length) return current;
  if (changed.includes("processNumber") && await duplicate(input.processNumber, id)) throw new Error("DUPLICATE_PROCESS");
  const at = new Date().toISOString(), review = stateFor(actor, at);
  const updated = await query(`UPDATE fs_controller_processes SET ${processFields.map((k, i) => `${columns[k]}=$${i + 1}`).join(",")},review_state=$11,review_note=$12,updated_by=$13,updated_at=$14,reviewed_by=$15,reviewed_at=$16 WHERE id=$17 AND updated_at=$18 RETURNING id`,
    [...processFields.map(k => input[k]), review.reviewState, "", actor.name, at, review.reviewedBy, review.reviewedAt, id, version]);
  if (!updated.length) throw new Error("STALE");
  await audit(id, actor, "editou", changed.map(k => `${fieldLabels[k]}: ${current[k] || "—"} → ${input[k] || "—"}`).join(" · "), at);
  return (await getProcess(id))!;
}
export async function reviewProcess(id: string, decision: "aprovar" | "ajustes", note: string, version: string, actor: Actor) {
  await setupController();
  const current = await getProcess(id);
  if (!current) throw new Error("NOT_FOUND");
  if (current.updatedAt !== version) throw new Error("STALE");
  const at = new Date().toISOString(), state: ReviewState = decision === "aprovar" ? "aprovado" : "ajustes";
  const updated = await query("UPDATE fs_controller_processes SET review_state=$1,review_note=$2,reviewed_by=$3,reviewed_at=$4,updated_at=$5 WHERE id=$6 AND updated_at=$7 RETURNING id", [state, decision === "ajustes" ? note : "", actor.name, at, at, id, version]);
  if (!updated.length) throw new Error("STALE");
  await audit(id, actor, decision === "aprovar" ? "aprovou" : "pediu ajustes", note, at);
  return (await getProcess(id))!;
}
export async function deleteProcess(id: string, actor: Actor) {
  await setupController();
  const current = await getProcess(id);
  if (!current) throw new Error("NOT_FOUND");
  const at = new Date().toISOString();
  // O histórico permanece: a exclusão fica registrada com os dados do registro removido.
  await audit(id, actor, "excluiu", `${current.company} · ${current.cnpj} · ${current.processNumber || "sem nº"}`, at);
  await query("DELETE FROM fs_controller_processes WHERE id=$1", [id]);
}

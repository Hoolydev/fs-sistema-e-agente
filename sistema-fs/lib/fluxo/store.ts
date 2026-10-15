import { randomUUID } from "node:crypto";
import { init, query } from "@/lib/comercial/store";
import { isReviewer } from "@/lib/auth/roles";
import type { Actor } from "@/lib/auth/server";
import { ownedBy, ownerClause, type Scope } from "@/lib/auth/scope";
import { enqueueNotification } from "@/lib/avisos/store";
import { createProcess, listProcesses, setupController } from "@/lib/controller/store";
import { setupCompanies } from "@/lib/empresas/store";
import { setupDocuments } from "@/lib/documentos/store";
import { documentChecklist } from "@/lib/documentos/tipos";
import { alertRecipients, teamDirectory } from "@/lib/equipe/team";
import { formatCnpj, normalizeCnpj } from "@/lib/diagnostico/model";
import {
  firstSubstage, lastSubstage, needsApproval, nextSector, parseSectors, previousSector, sectorLabels, sectors, substageLabel, substageOf,
  type FlowCard, type FlowHistory, type Sector,
} from "./model";

type Row = Record<string, unknown>;
const text = (v: unknown) => (v === null || v === undefined ? null : String(v));
const toCard = (r: Row): FlowCard => ({
  cnpj: String(r.cnpj), company: String(r.company), sector: r.sector as Sector, substage: String(r.substage),
  enteredAt: String(r.entered_at), substageAt: String(r.substage_at), updatedAt: String(r.updated_at), updatedBy: String(r.updated_by), ownerId: text(r.owner_id),
});
const system = { id: "sistema", name: "Sistema" };

let ready: Promise<void> | undefined;
export async function setupFlow() {
  await init();
  if (!ready) ready = (async () => {
    // cnpj é a chave: o mesmo cliente não fica em duas etapas ao mesmo tempo (regra de integridade do fluxograma).
    await query("CREATE TABLE IF NOT EXISTS fs_client_flow (cnpj TEXT PRIMARY KEY, company TEXT NOT NULL, sector TEXT NOT NULL, substage TEXT NOT NULL, entered_at TEXT NOT NULL, substage_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_by_id TEXT NOT NULL, owner_id TEXT)");
    await query("CREATE TABLE IF NOT EXISTS fs_client_flow_history (id TEXT PRIMARY KEY, cnpj TEXT NOT NULL, from_sector TEXT, from_substage TEXT, to_sector TEXT NOT NULL, to_substage TEXT NOT NULL, actor_id TEXT NOT NULL, actor TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL)");
    await query("CREATE INDEX IF NOT EXISTS fs_client_flow_history_cnpj ON fs_client_flow_history (cnpj, created_at)");
    await query("CREATE TABLE IF NOT EXISTS fs_user_sectors (user_id TEXT PRIMARY KEY, sectors TEXT NOT NULL, updated_at TEXT NOT NULL)");
  })().catch(e => { ready = undefined; throw e; });
  await ready;
}
async function record(cnpj: string, from: { sector: Sector; substage: string } | null, to: { sector: Sector; substage: string }, actor: { id: string; name: string }, note: string, at: string) {
  await query("INSERT INTO fs_client_flow_history (id,cnpj,from_sector,from_substage,to_sector,to_substage,actor_id,actor,note,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [randomUUID(), cnpj, from?.sector ?? null, from?.substage ?? null, to.sector, to.substage, actor.id, actor.name, note, at]);
}

// Situação do Controller convertida em subetapa, só para clientes que ainda não estão no fluxo.
export function controllerSubstage(p: { admStatus: string; dispatchStatus: string }) {
  if (p.dispatchStatus === "ARQUIVADO") return "analise-chefia-despacho";
  if (p.dispatchStatus === "TEM DESPACHO") return "tem-despacho";
  if (p.admStatus === "PROTOCOLADO") return "pendente-receita";
  return "aguardando-protocolo";
}
// Coloca no fluxo os clientes que já existem no sistema e ainda não têm etapa: quem tem processo vai para o Controller,
// quem só tem cadastro vai para o Cadastro e quem só é contato do site vai para o Comercial. Quem já está no fluxo não muda.
// Assinatura das fontes (quantidade e último registro de processos, empresas e contatos, e tamanho do fluxo):
// a sincronização completa só roda quando algo mudou, poupando consultas a cada abertura do quadro.
let lastSignature = "";
async function sourcesSignature() {
  const [r] = await query("SELECT (SELECT COUNT(*) FROM fs_controller_processes) AS p, (SELECT MAX(created_at) FROM fs_controller_processes) AS pm, (SELECT COUNT(*) FROM fs_companies) AS c, (SELECT MAX(created_at) FROM fs_companies) AS cm, (SELECT COUNT(*) FROM fs_crm_leads) AS l, (SELECT MAX(created_at) FROM fs_crm_leads) AS lm, (SELECT COUNT(*) FROM fs_client_flow) AS f");
  return [r.p, r.pm, r.c, r.cm, r.l, r.lm, r.f].map(v => String(v ?? "")).join("|");
}
export async function syncFlow() {
  await setupFlow();
  await Promise.all([setupController(), setupCompanies()]);
  const before = await sourcesSignature();
  if (before === lastSignature) return;
  await fullSync();
  lastSignature = await sourcesSignature();
}
async function fullSync() {
  const known = new Set((await query("SELECT cnpj FROM fs_client_flow")).map(r => String(r.cnpj)));
  const at = new Date().toISOString();
  const add = async (cnpj: string, company: string, sector: Sector, substage: string, ownerId: string | null, origin: string) => {
    if (!cnpj || known.has(cnpj)) return;
    known.add(cnpj);
    const inserted = await query("INSERT INTO fs_client_flow (cnpj,company,sector,substage,entered_at,substage_at,created_at,updated_at,updated_by,updated_by_id,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(cnpj) DO NOTHING RETURNING cnpj",
      [cnpj, company, sector, substage, at, at, at, at, system.name, system.id, ownerId]);
    if (inserted.length) await record(cnpj, null, { sector, substage }, system, origin, at);
  };
  const latest = new Map<string, Awaited<ReturnType<typeof listProcesses>>[number]>();
  for (const p of await listProcesses()) { const prev = latest.get(p.cnpj); if (!prev || p.updatedAt > prev.updatedAt) latest.set(p.cnpj, p); }
  for (const p of latest.values()) await add(p.cnpj, p.company, "controller", controllerSubstage(p), p.ownerId ?? null, "Entrou no fluxo a partir do processo do Controller.");
  await setupDocuments();
  const docs = await query("SELECT cnpj, doc_type, kind FROM fs_documents");
  for (const c of await query("SELECT cnpj, name, owner_id FROM fs_companies ORDER BY created_at")) {
    const cnpj = String(c.cnpj), complete = documentChecklist(docs.filter(d => String(d.cnpj) === cnpj).map(d => ({ docType: text(d.doc_type), kind: String(d.kind) }))).every(i => i.done);
    await add(cnpj, String(c.name), "cadastro", complete ? "documentacao-completa" : "pendente-documentacao", text(c.owner_id), "Entrou no fluxo a partir do cadastro de empresas.");
  }
  for (const l of await query("SELECT payload, stage FROM fs_crm_leads ORDER BY created_at DESC")) {
    try {
      const event = JSON.parse(String(l.payload)) as { company?: { cnpj?: string; name?: string } };
      const stage = String(l.stage);
      await add(normalizeCnpj(String(event.company?.cnpj ?? "")), String(event.company?.name ?? "Contato do site"), "comercial", substageOf("comercial", stage) ? stage : firstSubstage("comercial"), null, "Entrou no fluxo a partir do contato do site.");
    } catch {}
  }
}

export async function listFlow(sector: Sector, scope: Scope = null): Promise<FlowCard[]> {
  await syncFlow();
  const owner = ownerClause(scope, "owner_id", 2);
  return (await query(`SELECT * FROM fs_client_flow WHERE sector=$1${owner.sql} ORDER BY substage_at`, [sector, ...owner.values])).map(toCard);
}
export async function getCard(cnpj: string, scope: Scope = null) {
  await setupFlow();
  const [row] = await query("SELECT * FROM fs_client_flow WHERE cnpj=$1", [normalizeCnpj(cnpj)]);
  return row && ownedBy(scope, text(row.owner_id)) ? toCard(row) : null;
}
export async function flowHistory(cnpj: string): Promise<FlowHistory[]> {
  await setupFlow();
  return (await query("SELECT * FROM fs_client_flow_history WHERE cnpj=$1 ORDER BY created_at DESC LIMIT 100", [normalizeCnpj(cnpj)])).map(r => ({
    id: String(r.id), fromSector: (text(r.from_sector) as Sector | null), fromSubstage: text(r.from_substage), toSector: r.to_sector as Sector, toSubstage: String(r.to_substage), actor: String(r.actor), note: String(r.note), createdAt: String(r.created_at),
  }));
}

// Setores de cada pessoa. Quem não tem setor definido atua em todas as áreas (até o administrador configurar).
export async function userSectors(userId: string): Promise<Sector[]> {
  await setupFlow();
  const [row] = await query("SELECT sectors FROM fs_user_sectors WHERE user_id=$1", [userId]);
  return row ? parseSectors(String(row.sectors)) : [];
}
export async function allUserSectors(): Promise<Record<string, Sector[]>> {
  await setupFlow();
  return Object.fromEntries((await query("SELECT user_id, sectors FROM fs_user_sectors")).map(r => [String(r.user_id), parseSectors(String(r.sectors))]));
}
export async function setUserSectors(userId: string, list: Sector[]) {
  await setupFlow();
  const value = sectors.filter(s => list.includes(s)).join(","), at = new Date().toISOString();
  await query("INSERT INTO fs_user_sectors (user_id,sectors,updated_at) VALUES ($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET sectors=excluded.sectors, updated_at=excluded.updated_at", [userId, value, at]);
  return parseSectors(value);
}
// Quem aprova numa área: administrador em todas; revisor (advogado) nas áreas dele (ou em todas, se não tiver setor definido).
export async function canApprove(actor: Actor, sector: Sector) {
  if (actor.role === "admin") return true;
  if (!isReviewer(actor.role)) return false;
  const own = await userSectors(actor.id);
  return !own.length || own.includes(sector);
}
export async function canWork(actor: Actor, sector: Sector) {
  if (actor.role === "admin") return true;
  if (actor.role === "externo" && (sector === "comercial" || sector === "juridico")) return false;
  const own = await userSectors(actor.id);
  return !own.length || own.includes(sector);
}

async function load(cnpj: string, version: string, scope: Scope) {
  const card = await getCard(cnpj, scope);
  if (!card) throw new Error("NOT_FOUND");
  if (card.updatedAt !== version) throw new Error("STALE");
  return card;
}
// Comercial: a etapa do contato do site acompanha o cartão.
async function syncLeadStage(cnpj: string, substage: string) {
  for (const l of await query("SELECT id, payload FROM fs_crm_leads")) {
    try { if (normalizeCnpj(String((JSON.parse(String(l.payload)) as { company?: { cnpj?: string } }).company?.cnpj ?? "")) === cnpj) await query("UPDATE fs_crm_leads SET stage=$1 WHERE id=$2", [substage, l.id]); } catch {}
  }
}

// Arrastar entre subetapas da mesma área.
export async function moveCard(cnpj: string, substage: string, version: string, actor: Actor, scope: Scope = null) {
  await setupFlow();
  const card = await load(cnpj, version, scope);
  if (!(await canWork(actor, card.sector))) throw new Error("FORBIDDEN_SECTOR");
  if (!substageOf(card.sector, substage)) throw new Error("INVALID_SUBSTAGE");
  if (substage === card.substage) return card;
  // Analista leva até a aprovação; aprovar (sair dela ou ir além) é de quem aprova na área.
  if (needsApproval(card.sector, card.substage, substage) && !(await canApprove(actor, card.sector))) throw new Error("APPROVAL_REQUIRED");
  const at = new Date().toISOString();
  const updated = await query("UPDATE fs_client_flow SET substage=$1, substage_at=$2, updated_at=$3, updated_by=$4, updated_by_id=$5 WHERE cnpj=$6 AND updated_at=$7 RETURNING cnpj", [substage, at, at, actor.name, actor.id, card.cnpj, version]);
  if (!updated.length) throw new Error("STALE");
  await record(card.cnpj, { sector: card.sector, substage: card.substage }, { sector: card.sector, substage }, actor, "", at);
  if (card.sector === "comercial") await syncLeadStage(card.cnpj, substage);
  return (await getCard(card.cnpj))!;
}

// Quem recebe o aviso de cliente novo na área: pessoas com WhatsApp e esse setor; sem ninguém configurado, os revisores.
async function sectorRecipients(sector: Sector) {
  const assigned = await allUserSectors();
  const members = (await teamDirectory()).filter(m => m.active && m.role !== "externo" && assigned[m.id]?.includes(sector));
  return members.length ? members : await alertRecipients();
}

// Mudar de área. Para frente: só da última subetapa e com validação de um revisor. Para trás: revisor, com justificativa.
export async function advanceCard(cnpj: string, version: string, direction: "proximo" | "anterior", note: string, actor: Actor, scope: Scope = null) {
  await setupFlow();
  const card = await load(cnpj, version, scope);
  if (!(await canApprove(actor, card.sector))) throw new Error("REVIEWER_REQUIRED");
  const target = direction === "proximo" ? nextSector(card.sector) : previousSector(card.sector);
  if (!target) throw new Error(direction === "proximo" ? "LAST_SECTOR" : "FIRST_SECTOR");
  if (direction === "proximo" && card.substage !== lastSubstage(card.sector)) throw new Error("SUBSTAGE_NOT_DONE");
  const substage = direction === "proximo" ? firstSubstage(target) : lastSubstage(target), at = new Date().toISOString();
  const updated = await query("UPDATE fs_client_flow SET sector=$1, substage=$2, entered_at=$3, substage_at=$4, updated_at=$5, updated_by=$6, updated_by_id=$7 WHERE cnpj=$8 AND updated_at=$9 RETURNING cnpj",
    [target, substage, at, at, at, actor.name, actor.id, card.cnpj, version]);
  if (!updated.length) throw new Error("STALE");
  await record(card.cnpj, { sector: card.sector, substage: card.substage }, { sector: target, substage }, actor, note || (direction === "proximo" ? `Etapa ${sectorLabels[card.sector]} concluída e validada.` : ""), at);
  if (target === "comercial") await syncLeadStage(card.cnpj, substage);
  // Cliente que chega ao Controller ganha o registro de processo, se ainda não tiver um.
  if (target === "controller" && !(await listProcesses()).some(p => p.cnpj === card.cnpj)) {
    const created = await createProcess({ company: card.company, cnpj: card.cnpj, object: "HABILITAÇÃO DE CRÉDITO", admStatus: "NÃO INICIADO", protocolDate: null, deadline: null, processNumber: "", updatedOn: null, dispatchStatus: "NÃO TEM DESPACHO", notes: "" }, actor, "Registro criado ao entrar no Controller pelo fluxo de etapas");
    // O processo fica com o mesmo dono do cliente (usuário externo continua vendo o que incluiu).
    if (card.ownerId) await query("UPDATE fs_controller_processes SET owner_id=$1 WHERE id=$2", [card.ownerId, created.id]);
  }
  // A área que assume é avisada pelo WhatsApp. Falha no aviso não desfaz a mudança.
  try {
    const message = direction === "proximo"
      ? `${card.company} (CNPJ ${formatCnpj(card.cnpj)}) chegou ao ${sectorLabels[target]}, em ${substageLabel(target, substage)}. Validado por ${actor.name}.`
      : `${card.company} (CNPJ ${formatCnpj(card.cnpj)}) voltou para o ${sectorLabels[target]}, em ${substageLabel(target, substage)}, por ${actor.name}: ${note}`;
    for (const member of await sectorRecipients(target)) if (member.id !== actor.id) await enqueueNotification("fluxo", member, message, `fluxo:${card.cnpj}:${target}:${at}`);
  } catch {}
  return (await getCard(card.cnpj))!;
}

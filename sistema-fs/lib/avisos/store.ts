import { randomUUID } from "node:crypto";
import { init, query } from "@/lib/comercial/store";
import { alertRecipients, memberById } from "@/lib/equipe/team";
import { deadlineQueue } from "@/lib/controller/metrics";
import { daysUntil, formatDay, today, type ControllerProcess } from "@/lib/controller/model";

export type Notification = { id: string; kind: string; phone: string; recipient: string; message: string; createdAt: string };
let ready: Promise<void> | undefined;
export async function setupNotifications() {
  await init();
  if (!ready) ready = (async () => {
    await query("CREATE TABLE IF NOT EXISTS fs_notifications (id TEXT PRIMARY KEY, kind TEXT NOT NULL, recipient_id TEXT NOT NULL, recipient TEXT NOT NULL, phone TEXT NOT NULL, message TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, sent_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT)");
  })().catch(e => { ready = undefined; throw e; });
  await ready;
}
// Caixa de saída: o sistema grava, o agente WhatsApp lê e envia. A chave de deduplicação evita avisar duas vezes o mesmo fato.
export async function enqueueNotification(kind: string, recipient: { id: string; name: string; phone: string }, message: string, dedupeKey: string) {
  await setupNotifications();
  if (!recipient.phone) return false;
  const inserted = await query("INSERT INTO fs_notifications (id,kind,recipient_id,recipient,phone,message,dedupe_key,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id", [randomUUID(), kind, recipient.id, recipient.name, recipient.phone, message, `${dedupeKey}:${recipient.id}`, new Date().toISOString()]);
  return inserted.length > 0;
}
export async function notifyReviewers(kind: string, message: string, dedupeKey: string, exceptId?: string) {
  for (const member of await alertRecipients()) if (member.id !== exceptId) await enqueueNotification(kind, member, message, dedupeKey);
}
export async function notifyUser(kind: string, userId: string, message: string, dedupeKey: string) {
  const member = await memberById(userId);
  if (member?.active && member.phone) await enqueueNotification(kind, member, message, dedupeKey);
}
const line = (p: ControllerProcess) => `• ${p.company} — contagem ${formatDay(p.deadline)}${p.notes ? ` (${p.notes.slice(0, 60)})` : ""}`;
// Resumo diário das contagens: gerado uma vez por dia a partir das 08:00 (Brasília), quando o agente consulta a caixa de saída.
export function digestMessage(processes: ControllerProcess[], day = today()) {
  const queue = deadlineQueue(processes);
  const overdue = queue.filter(p => (daysUntil(p.deadline, day) ?? 0) < 0), soon = queue.filter(p => { const d = daysUntil(p.deadline, day); return d !== null && d >= 0 && d <= 7; });
  if (!overdue.length && !soon.length) return null;
  const parts = [`Controller FS — resumo de ${formatDay(day)}`];
  if (overdue.length) parts.push(`${overdue.length} ${overdue.length === 1 ? "processo com contagem encerrada" : "processos com contagem encerrada"} sem despacho:\n${overdue.slice(0, 12).map(line).join("\n")}${overdue.length > 12 ? `\n… e mais ${overdue.length - 12}` : ""}`);
  if (soon.length) parts.push(`${soon.length} ${soon.length === 1 ? "contagem encerra" : "contagens encerram"} em até 7 dias:\n${soon.map(line).join("\n")}`);
  parts.push("Detalhes em app.fssolucoestributarias.com.br/controller");
  return parts.join("\n\n");
}
export async function ensureDailyDigest(processes: ControllerProcess[], now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(now));
  if (hour < 8) return;
  const day = today(now), message = digestMessage(processes, day);
  if (!message) return;
  await notifyReviewers("prazos", message, `prazos:${day}`);
}
export async function pendingNotifications(limit = 50): Promise<Notification[]> {
  await setupNotifications();
  return (await query("SELECT id,kind,phone,recipient,message,created_at FROM fs_notifications WHERE sent_at IS NULL AND attempts<5 ORDER BY created_at LIMIT $1", [limit])).map(r => ({ id: String(r.id), kind: String(r.kind), phone: String(r.phone), recipient: String(r.recipient), message: String(r.message), createdAt: String(r.created_at) }));
}
export async function acknowledgeNotification(id: string, sent: boolean, error = "") {
  await setupNotifications();
  if (sent) await query("UPDATE fs_notifications SET sent_at=$1, attempts=attempts+1, last_error=NULL WHERE id=$2", [new Date().toISOString(), id]);
  else await query("UPDATE fs_notifications SET attempts=attempts+1, last_error=$1 WHERE id=$2", [error.slice(0, 300), id]);
}

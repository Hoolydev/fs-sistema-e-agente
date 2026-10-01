import { query } from "@/lib/comercial/store";
import { parseAgentTasks, roleOf, type AgentTask, type Role } from "@/lib/auth/roles";

export type TeamMember = { id: string; name: string; email: string; role: Role; phone: string; tasks: AgentTask[]; active: boolean };
const toMember = (r: Record<string, unknown>): TeamMember => ({ id: String(r.id), name: String(r.name), email: String(r.email), role: roleOf({ role: r.role as string | null }), phone: String(r.phone ?? ""), tasks: parseAgentTasks(r.agentTasks as string | null), active: r.banned !== true });
// Equipe com WhatsApp cadastrado: é por aqui que o agente sabe quem é cada número e o que a pessoa pode pedir.
export async function teamDirectory(): Promise<TeamMember[]> {
  return (await query('SELECT id,name,email,role,phone,"agentTasks",banned FROM fs_auth_user WHERE phone IS NOT NULL AND phone<>\'\' ORDER BY name')).map(toMember);
}
export async function memberByPhone(phone: string) { return (await teamDirectory()).find(m => m.phone === phone && m.active) ?? null; }
export async function memberById(id: string) { const [row] = await query('SELECT id,name,email,role,phone,"agentTasks",banned FROM fs_auth_user WHERE id=$1', [id]); return row ? toMember(row) : null; }
// Quem recebe avisos: pessoas ativas, com WhatsApp e a atribuição "avisos"; por padrão os revisores.
export async function alertRecipients(roles: Role[] = ["admin", "advogado"]) { return (await teamDirectory()).filter(m => m.active && m.tasks.includes("avisos") && roles.includes(m.role)); }

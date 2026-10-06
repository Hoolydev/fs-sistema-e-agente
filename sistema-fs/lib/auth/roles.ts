import { createAccessControl } from "better-auth/plugins/access";

// Fonte única de perfis e permissões: usada pelo servidor (APIs), pelo plugin admin do Better Auth e pela interface.
// Hierarquia: admin > advogado > operador. Quem não tem perfil gravado recebe o menor (operador).
export const statements = {
  user: ["create", "list", "set-role", "ban", "impersonate", "impersonate-admins", "delete", "set-password", "set-email", "get", "update"],
  session: ["list", "revoke", "delete"],
  processo: ["incluir", "editar", "revisar", "excluir"],
  // Áreas internas da FS: quem é externo não entra.
  interno: ["acessar"],
} as const;
export const ac = createAccessControl(statements);
export const roles = {
  // Sem "impersonate" nem "delete": ninguém entra como outro usuário e contas são desativadas, não apagadas, para preservar o histórico.
  admin: ac.newRole({ user: ["create", "list", "set-role", "ban", "set-password", "get", "update"], session: ["list", "revoke"], processo: ["incluir", "editar", "revisar", "excluir"], interno: ["acessar"] }),
  advogado: ac.newRole({ processo: ["incluir", "editar", "revisar"], interno: ["acessar"] }),
  operador: ac.newRole({ processo: ["incluir", "editar"], interno: ["acessar"] }),
  // Externo: analisa CNPJ, cadastra empresas e documentação, mas só enxerga o que ele mesmo incluiu (ver lib/auth/scope.ts).
  externo: ac.newRole({ processo: ["incluir", "editar"] }),
};
export type Role = keyof typeof roles;
export type Permissions = { [K in keyof typeof statements]?: (typeof statements)[K][number][] };
export const defaultRole: Role = "operador";
export const roleOrder: Role[] = ["admin", "advogado", "operador", "externo"];
export const isExternal = (role: Role) => role === "externo";
export const roleLabels: Record<Role, string> = { admin: "Administrador revisor", advogado: "Advogado revisor", operador: "Inclusão de dados", externo: "Usuário externo" };
export const roleDescriptions: Record<Role, string> = {
  admin: "Revisa e aprova, inclui, edita e exclui registros; cria usuários, define perfis, redefine senhas e desativa acessos.",
  advogado: "Revisa e aprova os registros incluídos pela equipe; também inclui e edita. Não gerencia usuários nem exclui registros.",
  operador: "Inclui e edita registros. Tudo o que salva fica aguardando revisão de um revisor. Não aprova, não exclui e não gerencia usuários.",
  externo: "Analisa CNPJ, cadastra empresas e envia documentação, mas só vê o que ele mesmo incluiu. Não acessa Comercial, Aprovações nem a equipe; o que inclui aguarda revisão da FS.",
};
export function roleOf(user: { role?: string | null } | null | undefined): Role {
  const role = user?.role;
  return role === "admin" || role === "advogado" || role === "operador" || role === "externo" ? role : defaultRole;
}
export function can(role: Role, permissions: Permissions) { return roles[role].authorize(permissions).success; }
export const isReviewer = (role: Role) => can(role, { processo: ["revisar"] });

// Atribuições de cada pessoa no agente WhatsApp, independentes do perfil; gravadas em fs_auth_user.agentTasks.
export const agentTasks = ["comprovantes", "analises", "avisos"] as const;
export type AgentTask = (typeof agentTasks)[number];
export const agentTaskLabels: Record<AgentTask, string> = { comprovantes: "Enviar comprovantes de pagamento", analises: "Pedir análises pelo Mac", avisos: "Receber avisos do Controller" };
export const parseAgentTasks = (value: string | null | undefined): AgentTask[] => (value ?? "").split(",").map(v => v.trim()).filter((v): v is AgentTask => (agentTasks as readonly string[]).includes(v));
// Telefone do WhatsApp em dígitos com DDI; número brasileiro sem DDI recebe 55.
export function normalizePhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}
export const isValidPhone = (digits: string) => /^\d{12,15}$/.test(digits);
export const formatPhone = (digits: string) => digits.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "+55 $1 $2-$3") || "";

import { createAccessControl } from "better-auth/plugins/access";

// Fonte única de perfis e permissões: usada pelo servidor (APIs), pelo plugin admin do Better Auth e pela interface.
// Hierarquia: admin > advogado > operador. Quem não tem perfil gravado recebe o menor (operador).
export const statements = {
  user: ["create", "list", "set-role", "ban", "impersonate", "impersonate-admins", "delete", "set-password", "set-email", "get", "update"],
  session: ["list", "revoke", "delete"],
  processo: ["incluir", "editar", "revisar", "excluir"],
} as const;
export const ac = createAccessControl(statements);
export const roles = {
  // Sem "impersonate" nem "delete": ninguém entra como outro usuário e contas são desativadas, não apagadas, para preservar o histórico.
  admin: ac.newRole({ user: ["create", "list", "set-role", "ban", "set-password", "get", "update"], session: ["list", "revoke"], processo: ["incluir", "editar", "revisar", "excluir"] }),
  advogado: ac.newRole({ processo: ["incluir", "editar", "revisar"] }),
  operador: ac.newRole({ processo: ["incluir", "editar"] }),
};
export type Role = keyof typeof roles;
export type Permissions = { [K in keyof typeof statements]?: (typeof statements)[K][number][] };
export const defaultRole: Role = "operador";
export const roleOrder: Role[] = ["admin", "advogado", "operador"];
export const roleLabels: Record<Role, string> = { admin: "Administrador revisor", advogado: "Advogado revisor", operador: "Inclusão de dados" };
export const roleDescriptions: Record<Role, string> = {
  admin: "Revisa e aprova, inclui, edita e exclui registros; cria usuários, define perfis, redefine senhas e desativa acessos.",
  advogado: "Revisa e aprova os registros incluídos pela equipe; também inclui e edita. Não gerencia usuários nem exclui registros.",
  operador: "Inclui e edita registros. Tudo o que salva fica aguardando revisão de um revisor. Não aprova, não exclui e não gerencia usuários.",
};
export function roleOf(user: { role?: string | null } | null | undefined): Role {
  const role = user?.role;
  return role === "admin" || role === "advogado" || role === "operador" ? role : defaultRole;
}
export function can(role: Role, permissions: Permissions) { return roles[role].authorize(permissions).success; }
export const isReviewer = (role: Role) => can(role, { processo: ["revisar"] });

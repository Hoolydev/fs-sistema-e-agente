import { isExternal, type Role } from "./roles";

// Separação de dados por dono. Registros da FS têm owner_id nulo e são vistos por toda a equipe interna;
// um usuário externo só vê (e só altera) registros cujo owner_id é o seu id. Aplicado no SQL, não só na tela.
export type Scope = { ownerId: string } | null;
export const scopeFor = (actor: { id: string; role: Role }): Scope => isExternal(actor.role) ? { ownerId: actor.id } : null;
export const ownerFor = (actor: { id: string; role: Role }) => isExternal(actor.role) ? actor.id : null;
// Cláusula SQL ("AND ...") e valores extras para a posição $n informada.
export function ownerClause(scope: Scope, column: string, position: number): { sql: string; values: unknown[] } {
  return scope ? { sql: ` AND ${column}=$${position}`, values: [scope.ownerId] } : { sql: "", values: [] };
}
export const ownedBy = (scope: Scope, ownerId: string | null | undefined) => !scope || ownerId === scope.ownerId;

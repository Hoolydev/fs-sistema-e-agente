"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, Copy, KeyRound, LoaderCircle, Minus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge, Panel, Picker } from "@/components/fs/primitives";
import { authClient } from "@/lib/auth/client";
import { can, roleDescriptions, roleLabels, roleOf, roleOrder, type Permissions, type Role } from "@/lib/auth/roles";
import { useController } from "./context";

type Member = { id: string; name: string; email: string; role?: string | null; banned?: boolean | null };
const matrix: { label: string; permissions: Permissions }[] = [
  { label: "Consultar processos, documentos e diagnósticos", permissions: {} },
  { label: "Incluir e editar registros no Controller", permissions: { processo: ["incluir", "editar"] } },
  { label: "Revisar: aprovar ou pedir ajustes", permissions: { processo: ["revisar"] } },
  { label: "Excluir registros", permissions: { processo: ["excluir"] } },
  { label: "Criar usuários, definir perfis e redefinir senhas", permissions: { user: ["create", "set-role", "set-password"] } },
  { label: "Desativar e reativar acessos", permissions: { user: ["ban"] } },
];
const labelToRole = (label: string) => roleOrder.find(r => roleLabels[r] === label) ?? "operador";
// Senha inicial aleatória (144 bits), gerada no navegador do administrador e exibida uma única vez.
function generatePassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}

async function listMembers(): Promise<Member[] | null> {
  const result = await authClient.admin.listUsers({ query: { limit: 200, sortBy: "name", sortDirection: "asc" } });
  return result.error ? null : result.data.users as Member[];
}
export function TeamSettings() {
  const { data: session } = authClient.useSession();
  const { role, allowed, notify } = useController();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("operador");
  const [issued, setIssued] = useState<{ name: string; email: string; password: string } | null>(null);
  const me = session?.user;
  const apply = useCallback((users: Member[] | null) => {
    if (users) { setMembers(users); setError(""); } else setError("Não foi possível carregar a equipe.");
    setLoading(false);
  }, []);
  const load = useCallback(async () => apply(await listMembers()), [apply]);
  useEffect(() => { if (!allowed.users) return; let active = true; void listMembers().then(users => { if (active) apply(users); }); return () => { active = false; }; }, [allowed.users, apply]);
  async function run(key: string, action: () => Promise<{ error: { message?: string } | null }>, done: string) {
    setBusy(key); setError("");
    try {
      const result = await action();
      if (result.error) { setError(result.error.message || "Não foi possível concluir a operação."); return false; }
      notify(done); await load(); return true;
    } catch { setError("Verifique sua conexão e tente novamente."); return false; }
    finally { setBusy(""); }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    const password = generatePassword(), account = { name: name.trim(), email: email.trim().toLowerCase() };
    if (await run("create", () => authClient.admin.createUser({ ...account, password, role: newRole }), "Usuário criado.")) { setIssued({ ...account, password }); setName(""); setEmail(""); setNewRole("operador"); }
  }
  async function resetPassword(member: Member) {
    const password = generatePassword();
    // Nova senha encerra as sessões abertas da pessoa.
    if (await run(`senha-${member.id}`, async () => { const result = await authClient.admin.setUserPassword({ userId: member.id, newPassword: password }); return result.error ? result : authClient.admin.revokeUserSessions({ userId: member.id }); }, "Nova senha gerada.")) setIssued({ name: member.name, email: member.email, password });
  }
  return (
    <Tabs defaultValue="perfil" className="preferences">
      <TabsList variant="line" className="standalone-tabs">
        <TabsTrigger value="perfil">Meu perfil</TabsTrigger>
        <TabsTrigger value="equipe">Equipe e permissões</TabsTrigger>
      </TabsList>
      <TabsContent value="perfil">
        <div className="settings-grid">
          <Panel title="Meu perfil" subtitle="Sua identificação no sistema">
            <div className="settings-form">
              <div className="profile-card">
                <span className="user-avatar">{(me?.name ?? "F").slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{me?.name ?? "—"}</strong>
                  <small>{me?.email ?? ""}</small>
                </div>
              </div>
              <div className="form-field"><Label>Perfil de acesso</Label><Input aria-label="Perfil de acesso" value={roleLabels[role]} readOnly /></div>
              <p className="ctrl-hint">{roleDescriptions[role]}</p>
              <Button asChild variant="outline"><Link href="/conta"><KeyRound size={16} /> Alterar senha</Link></Button>
            </div>
          </Panel>
          <Panel title="Hierarquia" subtitle="Do maior para o menor nível de acesso">
            <div className="settings-options">
              {roleOrder.map(r => (
                <div key={r}>
                  <span>
                    <strong>{roleLabels[r]}{r === role ? " · você" : ""}</strong>
                    <small>{roleDescriptions[r]}</small>
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </TabsContent>
      <TabsContent value="equipe">
        <Panel title="Permissões por perfil" subtitle="Regras aplicadas pelo sistema em cada ação">
          <Table className="process-table ctrl-matrix">
            <TableHeader>
              <TableRow>
                <TableHead>Ação</TableHead>
                {roleOrder.map(r => <TableHead key={r}>{roleLabels[r]}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.map(row => (
                <TableRow key={row.label}>
                  <TableCell>{row.label}</TableCell>
                  {roleOrder.map(r => <TableCell key={r}>{!Object.keys(row.permissions).length || can(r, row.permissions) ? <Check size={16} className="positive" aria-label="Permitido" /> : <Minus size={16} className="muted" aria-label="Não permitido" />}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="panel-bottom">Registros salvos pelo perfil de inclusão de dados ficam aguardando revisão; os salvos por um revisor já saem revisados por ele.</div>
        </Panel>
        {allowed.users ? (
          <>
            {issued && (
              <div className="ctrl-issued" role="status">
                <div>
                  <strong>Senha inicial de {issued.name}</strong>
                  <p>{issued.email} · <code>{issued.password}</code></p>
                  <small>Copie agora: ela não será exibida novamente. A pessoa deve trocá-la em Minha conta no primeiro acesso.</small>
                </div>
                <div className="ctrl-panel-actions">
                  <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(issued.password); notify("Senha copiada."); }}><Copy size={15} /> Copiar</Button>
                  <Button variant="outline" onClick={() => setIssued(null)}>Já anotei</Button>
                </div>
              </div>
            )}
            <Panel title="Equipe do escritório" subtitle="Usuários com acesso ao sistema">
              {error && <p role="alert" className="ctrl-alert ctrl-inset">{error}</p>}
              <Table className="process-table">
                <TableHeader>
                  <TableRow>{["Pessoa", "Perfil", "Situação", ""].map((t, i) => <TableHead key={i}>{t}</TableHead>)}</TableRow>
                </TableHeader>
                <TableBody>
                  {members.map(m => {
                    const self = m.id === me?.id, current = roleOf(m);
                    return (
                      <TableRow key={m.id}>
                        <TableCell><div className="company-cell"><span><strong>{m.name}{self ? " (você)" : ""}</strong><small>{m.email}</small></span></div></TableCell>
                        <TableCell>
                          {self ? roleLabels[current] : <Picker label={`Perfil de ${m.name}`} value={roleLabels[current]} options={roleOrder.map(r => roleLabels[r])} onChange={label => { const next = labelToRole(label); if (next !== current) void run(`perfil-${m.id}`, () => authClient.admin.setRole({ userId: m.id, role: next }), "Perfil atualizado."); }} />}
                        </TableCell>
                        <TableCell><Badge>{m.banned ? "Desativado" : "Ativo"}</Badge></TableCell>
                        <TableCell>
                          {!self && (
                            <div className="ctrl-panel-actions">
                              <Button variant="outline" disabled={!!busy} onClick={() => void resetPassword(m)}>{busy === `senha-${m.id}` ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />} Nova senha</Button>
                              <Button variant="outline" disabled={!!busy} onClick={() => void run(`acesso-${m.id}`, () => m.banned ? authClient.admin.unbanUser({ userId: m.id }) : authClient.admin.banUser({ userId: m.id, banReason: "Acesso desativado pelo administrador" }), m.banned ? "Acesso reativado." : "Acesso desativado.")}>{m.banned ? "Reativar" : "Desativar"}</Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {loading && !members.length && <div className="empty-state"><LoaderCircle className="spin" /><p>Carregando equipe…</p></div>}
            </Panel>
            <Panel title="Novo usuário" subtitle="A senha inicial é gerada automaticamente e exibida uma única vez">
              <form className="ctrl-new-user" onSubmit={create}>
                <div className="form-field"><Label htmlFor="user-name">Nome</Label><Input id="user-name" required maxLength={120} autoComplete="off" value={name} onChange={e => setName(e.target.value)} /></div>
                <div className="form-field"><Label htmlFor="user-email">E-mail de acesso</Label><Input id="user-email" type="email" required maxLength={180} autoComplete="off" placeholder="nome@fssistemas.com.br" value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div className="form-field"><Label>Perfil</Label><Picker label="Perfil do novo usuário" value={roleLabels[newRole]} options={roleOrder.map(r => roleLabels[r])} onChange={label => setNewRole(labelToRole(label))} /></div>
                <Button type="submit" disabled={!!busy}>{busy === "create" ? <LoaderCircle className="spin" size={16} /> : <UserPlus size={16} />} Criar usuário</Button>
              </form>
            </Panel>
          </>
        ) : (
          <p className="ctrl-hint ctrl-inset">A criação de usuários e a definição de perfis são feitas pelo administrador.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}

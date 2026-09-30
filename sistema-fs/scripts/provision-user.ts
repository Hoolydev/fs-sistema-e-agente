import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createFsAuth } from '../lib/auth/server';
import { defaultRole, roleLabels, roleOf, type Role } from '../lib/auth/roles';

export type NewUser = { name: string; email: string; role: Role };
// Cria contas com senha aleatória. Contas já existentes são mantidas (senha e perfil não são alterados).
// As senhas iniciais ficam somente no arquivo privado informado; nunca são impressas.
export async function provision(users: NewUser[], file: string) {
  const auth = createFsAuth(), context = await auth.$context, lines: string[] = [], created: { id: string; email: string; password: string }[] = [];
  for (const user of users) {
    const email = user.email.toLowerCase();
    if (await context.internalAdapter.findUserByEmail(email)) { console.log(`${email}: já existe, mantida.`); continue; }
    const password = randomBytes(18).toString('base64url');
    const result = await auth.api.createUser({ body: { email, name: user.name, password, role: user.role } });
    created.push({ id: result.user.id, email, password });
    lines.push(`${user.name} — ${roleLabels[user.role]}\nE-mail: ${email}\nSenha inicial: ${password}\n`);
    console.log(`${email}: criada (${roleLabels[user.role]}).`);
  }
  if (!lines.length) return created;
  mkdirSync('.local', { recursive: true, mode: 0o700 });
  // Acrescenta ao arquivo: uma senha já gerada nunca é sobrescrita nem perdida em nova execução.
  writeFileSync(file, `Sistema FS\nhttps://app.fssolucoestributarias.com.br/login\n\n${lines.join('\n')}\nCada pessoa deve alterar a senha em Minha conta após o primeiro acesso.\n\n`, { mode: 0o600, flag: 'a' });
  console.log(`Senhas iniciais no arquivo privado ${file}.`);
  return created;
}
async function main() {
  const email = process.env.FS_PROVISION_EMAIL, name = process.env.FS_PROVISION_NAME, role = process.env.FS_PROVISION_ROLE;
  if (!email || !name) throw new Error('Informe FS_PROVISION_EMAIL e FS_PROVISION_NAME (FS_PROVISION_ROLE opcional: admin, advogado ou operador).');
  if (role && roleOf({ role }) !== role) throw new Error('FS_PROVISION_ROLE inválido.');
  const [account] = await provision([{ name, email, role: role ? roleOf({ role }) : defaultRole }], '.local/ACESSO-SISTEMA.txt');
  // Conta usada pelos scripts de verificação (verify-access / verify-production).
  if (account) writeFileSync('.local/provisioned-user.json', JSON.stringify(account), { mode: 0o600 });
}
if (process.argv[1]?.endsWith('provision-user.ts')) main().then(() => process.exit(0)).catch(e => { console.error('Conta não criada:', e instanceof Error ? e.message : 'erro'); process.exit(1); });

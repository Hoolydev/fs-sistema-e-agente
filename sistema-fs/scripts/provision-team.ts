import { provision, type NewUser } from './provision-user';

// Equipe inicial do sistema FS e seus perfis (ver lib/auth/roles.ts).
const team: NewUser[] = [
  { name: 'Fernando Naves', email: 'fernando@fssistemas.com.br', role: 'admin' },
  { name: 'Leonardo Vellasco', email: 'leonardo@fssistemas.com.br', role: 'advogado' },
  { name: 'Samuel', email: 'samuel@fssistemas.com.br', role: 'operador' },
  { name: 'Maximiniano', email: 'maximiniano@fssistemas.com.br', role: 'operador' },
];
provision(team, `.local/ACESSOS-EQUIPE-${new Date().toISOString().slice(0, 10)}.txt`).then(() => process.exit(0)).catch(e => { console.error('Equipe não provisionada:', e instanceof Error ? e.message : 'erro'); process.exit(1); });

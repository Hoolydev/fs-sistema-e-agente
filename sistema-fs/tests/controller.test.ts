import test from 'node:test';
import assert from 'node:assert/strict';
import { can, isReviewer, roleOf } from '../lib/auth/roles';
import { addDays, changedFields, daysUntil, decisionSchema, processSchema } from '../lib/controller/model';
import { controllerMetrics, deadlineQueue } from '../lib/controller/metrics';
import { parseSheet } from '../scripts/import-controller';

const row = { company: 'Empresa Teste Ltda', cnpj: '11.222.333/0001-81', object: 'Habilitação de crédito', admStatus: 'Protocolado', protocolDate: '2026-09-04', deadline: '2026-10-05', processNumber: '13042.124653/2026-86', updatedOn: '2026-09-28', dispatchStatus: 'Não tem despacho ', notes: 'Aguardando análise' };

test('hierarquia: administrador > advogado > inclusão de dados', () => {
  assert.ok(can('admin', { processo: ['incluir', 'editar', 'revisar', 'excluir'], user: ['create', 'set-role', 'set-password', 'ban'] }));
  assert.ok(can('advogado', { processo: ['incluir', 'editar', 'revisar'] }));
  assert.equal(can('advogado', { processo: ['excluir'] }), false);
  assert.equal(can('advogado', { user: ['create'] }), false);
  assert.ok(can('operador', { processo: ['incluir', 'editar'] }));
  for (const denied of [{ processo: ['revisar'] }, { processo: ['excluir'] }, { user: ['list'] }] as const) assert.equal(can('operador', { ...denied } as never), false);
  assert.deepEqual([isReviewer('admin'), isReviewer('advogado'), isReviewer('operador')], [true, true, false]);
});
test('ninguém entra como outro usuário nem apaga contas', () => {
  for (const role of ['admin', 'advogado', 'operador'] as const) { assert.equal(can(role, { user: ['impersonate'] }), false); assert.equal(can(role, { user: ['delete'] }), false); }
});
test('perfil ausente ou desconhecido recebe o menor nível', () => {
  assert.equal(roleOf({ role: null }), 'operador'); assert.equal(roleOf({ role: 'root' }), 'operador'); assert.equal(roleOf(null), 'operador'); assert.equal(roleOf({ role: 'admin' }), 'admin');
});
test('registro do Controller é normalizado e validado', () => {
  const parsed = processSchema.parse(row);
  assert.equal(parsed.cnpj, '11222333000181'); assert.equal(parsed.company, 'EMPRESA TESTE LTDA'); assert.equal(parsed.dispatchStatus, 'NÃO TEM DESPACHO');
  assert.equal(processSchema.safeParse({ ...row, cnpj: '11.222.333/0001-80' }).success, false);
  assert.equal(processSchema.safeParse({ ...row, protocolDate: '2026-02-30' }).success, false);
  assert.equal(processSchema.parse({ ...row, protocolDate: '', deadline: null }).protocolDate, null);
  assert.deepEqual(changedFields(parsed, { ...parsed, notes: 'Outro', dispatchStatus: 'TEM DESPACHO' }), ['dispatchStatus', 'notes']);
});
test('pedido de ajustes exige justificativa', () => {
  assert.equal(decisionSchema.safeParse({ decision: 'ajustes', note: '', version: 'v' }).success, false);
  assert.ok(decisionSchema.safeParse({ decision: 'ajustes', note: 'Corrigir nº do processo', version: 'v' }).success);
  assert.ok(decisionSchema.safeParse({ decision: 'aprovar', version: 'v' }).success);
});
test('contagem e indicadores saem apenas dos registros', () => {
  assert.equal(addDays('2026-08-27', 31), '2026-09-27'); assert.equal(daysUntil('2026-10-05', '2026-09-30'), 5); assert.equal(daysUntil(null), null);
  const base = { ...processSchema.parse(row), reviewState: 'aprovado' as const };
  const list = [base, { ...base, cnpj: '22166214000175', deadline: '2026-09-12', reviewState: 'pendente' as const }, { ...base, dispatchStatus: 'TEM DESPACHO', deadline: '2026-09-01' }, { ...base, dispatchStatus: 'ARQUIVADO', reviewState: 'ajustes' as const }];
  const m = controllerMetrics(list, '2026-09-30');
  assert.deepEqual([m.total, m.companies, m.awaiting, m.dispatched, m.archived, m.overdue, m.dueSoon, m.pendingReview, m.adjustments], [4, 2, 2, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(m.byMonth, [{ month: '2026-09', count: 4 }]);
  assert.deepEqual(deadlineQueue(list).map(p => p.deadline), ['2026-09-12', '2026-10-05']);
  const empty = controllerMetrics([], '2026-09-30'); assert.equal(empty.total, 0); assert.equal(empty.lastUpdate, null);
});
test('planilha: CNPJ numérico recupera zeros à esquerda e datas em número de série', () => {
  const { valid, invalid } = parseSheet([{ D: 'PROCEDIMENTO ADMINISTRATIVO E PRAZO' }, { A: 'EMPRESA', B: 'CNPJ' }, { A: 'Empresa Teste', B: '1.1222333000181E13', C: 'HABILITAÇÃO DE CRÉDITO', D: 'PROTOCOLADO', E: '46261.0', F: '46292', G: '13033.133417/2026-60', H: '46293.0', I: 'TEM DESPACHO', J: 'OBS', K: '/' }, { A: 'Zeros', B: '191', C: 'X', D: 'Y', I: 'Z' }, { A: 'Inválida', B: '123', C: 'X', D: 'Y', I: 'Z' }]);
  assert.equal(valid.length, 2); assert.equal(invalid.length, 1); assert.match(invalid[0], /linha 5 \(Inválida\): cnpj/);
  assert.deepEqual([valid[0].cnpj, valid[0].protocolDate, valid[0].deadline, valid[0].updatedOn], ['11222333000181', '2026-08-27', '2026-09-27', '2026-09-28']);
  assert.equal(valid[1].cnpj, '00000000000191');
});

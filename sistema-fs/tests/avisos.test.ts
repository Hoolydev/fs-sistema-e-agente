import test from 'node:test';
import assert from 'node:assert/strict';
import { digestMessage } from '../lib/avisos/store';
import { detectMime } from '../lib/documentos/access';
import { formatPhone, isValidPhone, normalizePhone, parseAgentTasks } from '../lib/auth/roles';
import type { ControllerProcess } from '../lib/controller/model';

const base: ControllerProcess = { id: '1', company: 'EMPRESA A', cnpj: '11222333000181', object: 'HABILITAÇÃO DE CRÉDITO', admStatus: 'PROTOCOLADO', protocolDate: '2026-08-10', deadline: '2026-09-10', processNumber: '1', updatedOn: '2026-09-28', dispatchStatus: 'NÃO TEM DESPACHO', notes: 'ENCAMINHADO PARA JURÍDICO', reviewState: 'aprovado', reviewNote: '', createdBy: 'x', createdAt: '', updatedBy: 'x', updatedAt: '', reviewedBy: null, reviewedAt: null, updatedById: null };

test('telefone do WhatsApp: normalização, validação e exibição', () => {
  assert.equal(normalizePhone('(62) 99244-6000'), '5562992446000'); assert.equal(normalizePhone('+55 64 99907-1379'), '5564999071379'); assert.equal(normalizePhone(''), '');
  assert.ok(isValidPhone('5562982540748')); assert.equal(isValidPhone('62982'), false);
  assert.equal(formatPhone('5562992446000'), '+55 62 99244-6000');
  assert.deepEqual(parseAgentTasks('comprovantes, avisos,outra'), ['comprovantes', 'avisos']); assert.deepEqual(parseAgentTasks(null), []);
});
test('tipo do arquivo pelo conteúdo', () => {
  assert.equal(detectMime(Buffer.from('%PDF-1.4')), 'application/pdf');
  assert.equal(detectMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg');
  assert.equal(detectMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])), 'image/png');
  assert.equal(detectMime(Buffer.from('<html>')), null);
});
test('resumo diário lista contagens encerradas e as que encerram em 7 dias', () => {
  const soon = { ...base, id: '2', company: 'EMPRESA B', deadline: '2026-10-03', notes: '' }, dispatched = { ...base, id: '3', company: 'EMPRESA C', dispatchStatus: 'TEM DESPACHO' };
  const message = digestMessage([base, soon, dispatched], '2026-09-30')!;
  assert.match(message, /resumo de 30\/09\/2026/); assert.match(message, /1 processo com contagem encerrada sem despacho:\n• EMPRESA A — contagem 10\/09\/2026 \(ENCAMINHADO PARA JURÍDICO\)/);
  assert.match(message, /1 contagem encerra em até 7 dias:\n• EMPRESA B — contagem 03\/10\/2026/); assert.doesNotMatch(message, /EMPRESA C/);
  assert.equal(digestMessage([dispatched], '2026-09-30'), null);
});

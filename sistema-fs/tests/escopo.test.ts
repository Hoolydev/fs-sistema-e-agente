import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
Object.assign(process.env, { NODE_ENV: 'test' }); delete process.env.DATABASE_URL; delete process.env.FS_CRM_DATABASE_URL; process.env.FS_CRM_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'fs-escopo-'));
import { can, roleOf } from '../lib/auth/roles';
import { ownedBy, ownerClause, ownerFor, scopeFor } from '../lib/auth/scope';
import { createProcess, deleteProcess, getProcess, listProcesses, updateProcess } from '../lib/controller/store';
import { createCompany, listCompanies, updateCompany } from '../lib/empresas/store';
import { archiveDocument, documentContent, documents } from '../lib/documentos/store';
import type { Actor } from '../lib/auth/server';

const fs: Actor = { id: 'u-fs', name: 'Fernando', role: 'admin' }, ext: Actor = { id: 'u-ext', name: 'Cliente Externo', role: 'externo' }, ext2: Actor = { id: 'u-ext2', name: 'Outro Externo', role: 'externo' };
const base = { object: 'HABILITAÇÃO DE CRÉDITO', admStatus: 'PROTOCOLADO', protocolDate: '2026-09-01', deadline: '2026-10-02', updatedOn: '2026-09-30', dispatchStatus: 'NÃO TEM DESPACHO', notes: '' };

test('perfil externo: inclui e edita, não revisa, não exclui, não acessa áreas internas', () => {
  assert.equal(roleOf({ role: 'externo' }), 'externo');
  assert.ok(can('externo', { processo: ['incluir', 'editar'] }));
  for (const denied of [{ processo: ['revisar'] }, { processo: ['excluir'] }, { interno: ['acessar'] }, { user: ['create'] }] as const) assert.equal(can('externo', { ...denied } as never), false);
  assert.ok(can('operador', { interno: ['acessar'] }));
  assert.deepEqual(scopeFor(fs), null); assert.deepEqual(scopeFor(ext), { ownerId: 'u-ext' }); assert.equal(ownerFor(ext), 'u-ext'); assert.equal(ownerFor(fs), null);
  assert.deepEqual(ownerClause(scopeFor(ext), 'owner_id', 3), { sql: ' AND owner_id=$3', values: ['u-ext'] }); assert.equal(ownerClause(null, 'x', 1).sql, '');
  assert.ok(ownedBy(null, 'qualquer')); assert.ok(ownedBy({ ownerId: 'a' }, 'a')); assert.equal(ownedBy({ ownerId: 'a' }, null), false);
});
test('Controller: externo só vê, edita e nunca exclui os próprios registros; a FS vê tudo', async () => {
  const internal = await createProcess({ ...base, company: 'EMPRESA FS', cnpj: '51646813000194', processNumber: 'FS-1' }, fs, 'teste');
  const mine = await createProcess({ ...base, company: 'EMPRESA DO EXTERNO', cnpj: '11222333000181', processNumber: 'EXT-1' }, ext, 'teste');
  assert.equal(mine.ownerId, 'u-ext'); assert.equal(mine.reviewState, 'pendente'); assert.equal(internal.ownerId, null);
  assert.deepEqual((await listProcesses(scopeFor(ext))).map(p => p.id), [mine.id]);
  assert.deepEqual((await listProcesses(scopeFor(ext2))).map(p => p.id), []);
  assert.equal((await listProcesses()).length, 2);
  assert.equal(await getProcess(internal.id, scopeFor(ext)), null); assert.ok(await getProcess(internal.id));
  await assert.rejects(updateProcess(internal.id, { ...internal, notes: 'invasão' }, internal.updatedAt, ext, scopeFor(ext)), /NOT_FOUND/);
  await assert.rejects(deleteProcess(mine.id, ext, scopeFor(ext2)), /NOT_FOUND/);
  const edited = await updateProcess(mine.id, { ...mine, notes: 'ok' }, mine.updatedAt, ext, scopeFor(ext)); assert.equal(edited.notes, 'ok'); assert.equal(edited.ownerId, 'u-ext');
});
test('Empresas e documentos seguem o dono', async () => {
  await createCompany({ name: 'EMPRESA FS', cnpj: '51646813000194', notes: '' }, fs);
  const c = await createCompany({ name: 'EMPRESA DO EXTERNO', cnpj: '11222333000181', notes: '' }, ext);
  assert.equal(c.ownerId, 'u-ext');
  assert.deepEqual((await listCompanies(scopeFor(ext))).map(x => x.cnpj), ['11222333000181']);
  assert.ok((await listCompanies()).some(x => x.cnpj === '51646813000194') && (await listCompanies()).some(x => x.cnpj === '11222333000181'));
  await assert.rejects(createCompany({ name: 'TENTATIVA', cnpj: '51646813000194', notes: '' }, ext2), /DUPLICATE_COMPANY/);
  await assert.rejects(updateCompany('51646813000194', { name: 'X', notes: '' }, ext), /NOT_FOUND/);
  const docFs = await archiveDocument({ externalId: 'd-fs', cnpj: '51646813000194', company: 'EMPRESA FS', name: 'fs.pdf', kind: 'documento', createdAt: '2026-10-01T00:00:00Z' }, Buffer.from('%PDF-fs'));
  const docExt = await archiveDocument({ externalId: 'd-ext', cnpj: '11222333000181', company: 'EMPRESA DO EXTERNO', name: 'ext.pdf', kind: 'documento', createdAt: '2026-10-01T00:00:00Z', ownerId: 'u-ext' }, Buffer.from('%PDF-ext'));
  assert.deepEqual((await documents('', false, scopeFor(ext))).map(d => d.id), [docExt]);
  assert.equal((await documents()).length, 2);
  assert.equal(await documentContent(docFs, scopeFor(ext)), null); assert.ok(await documentContent(docExt, scopeFor(ext))); assert.ok(await documentContent(docFs));
});

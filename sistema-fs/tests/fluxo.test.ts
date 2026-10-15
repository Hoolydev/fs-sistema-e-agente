import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
Object.assign(process.env, { NODE_ENV: 'test' }); delete process.env.DATABASE_URL; delete process.env.FS_CRM_DATABASE_URL; process.env.FS_CRM_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'fs-fluxo-test-'));
import { listLeads, saveEvent } from '../lib/comercial/store';
import { createProcess, listProcesses } from '../lib/controller/store';
import { createCompany } from '../lib/empresas/store';
import { advanceSchema, lastSubstage, nextSector, substages } from '../lib/fluxo/model';
import { advanceCard, canApprove, canWork, controllerSubstage, flowHistory, getCard, listFlow, moveCard, setUserSectors } from '../lib/fluxo/store';
import type { DiagnosticEvent } from '../lib/comercial/model';

const admin = { id: 'u-admin', name: 'Fernando', role: 'admin' as const };
const lawyer = { id: 'u-adv', name: 'Leonardo', role: 'advogado' as const };
const operator = { id: 'u-op', name: 'Samuel', role: 'operador' as const };
const external = { id: 'u-ext', name: 'Ana', role: 'externo' as const };
const A = '11222333000181', B = '51646813000194', C = '01573657000100';
const lead = (cnpj: string, name: string) => ({ schema_version: '1.0', event: 'diagnostic.requested', event_id: randomUUID(), occurred_at: new Date().toISOString(), company: { cnpj, name }, contact: { name: 'Contato' }, consent: { accepted: true, version: 'v1', received_at: new Date().toISOString(), purpose: 'x' } }) as unknown as DiagnosticEvent;
const process0 = (cnpj: string, company: string) => ({ company, cnpj, object: 'HABILITAÇÃO DE CRÉDITO', admStatus: 'NÃO INICIADO', protocolDate: null, deadline: null, processNumber: '', updatedOn: null, dispatchStatus: 'NÃO TEM DESPACHO', notes: '' });

test('subetapas do fluxograma e situação do Controller convertida em subetapa', () => {
  assert.deepEqual(substages.controller.map(s => s.label), ['Aguardando protocolo', 'Análise Chefia', 'Pendente Receita', 'Tem Despacho', 'Análise Chefia']);
  assert.equal(nextSector('cadastro'), 'controller'); assert.equal(nextSector('juridico'), null); assert.equal(lastSubstage('comercial'), 'negociacao');
  assert.equal(controllerSubstage({ admStatus: 'NÃO INICIADO', dispatchStatus: 'NÃO TEM DESPACHO' }), 'aguardando-protocolo');
  assert.equal(controllerSubstage({ admStatus: 'PROTOCOLADO', dispatchStatus: 'NÃO TEM DESPACHO' }), 'pendente-receita');
  assert.equal(controllerSubstage({ admStatus: 'PROTOCOLADO', dispatchStatus: 'TEM DESPACHO' }), 'tem-despacho');
  assert.equal(advanceSchema.safeParse({ cnpj: A, version: 'x', direction: 'anterior', note: '' }).success, false);
});

test('clientes existentes entram uma única vez, na área mais avançada', async () => {
  await createProcess(process0(A, 'EMPRESA A'), admin);
  await createCompany({ name: 'EMPRESA A', cnpj: A, notes: '' }, admin);
  await createCompany({ name: 'EMPRESA B', cnpj: B, notes: '' }, admin);
  await saveEvent(lead(B, 'EMPRESA B')); await saveEvent(lead(C, 'EMPRESA C'));
  const all = [...await listFlow('comercial'), ...await listFlow('cadastro'), ...await listFlow('controller'), ...await listFlow('juridico')];
  assert.deepEqual(all.map(c => [c.cnpj, c.sector, c.substage]).sort(), [[C, 'comercial', 'novos-contatos'], [A, 'controller', 'aguardando-protocolo'], [B, 'cadastro', 'pendente-documentacao']].sort());
  assert.equal((await flowHistory(A))[0]!.actor, 'Sistema');
});

test('arrastar move só dentro da área, acompanha o funil do site e recusa versão antiga', async () => {
  const card = (await getCard(C))!;
  const moved = await moveCard(C, 'proposta', card.updatedAt, operator);
  assert.equal(moved.substage, 'proposta');
  assert.equal((await listLeads()).find(l => l.event.company.cnpj === C)!.stage, 'proposta');
  await assert.rejects(moveCard(C, 'pendente-receita', moved.updatedAt, operator), /INVALID_SUBSTAGE/);
  await assert.rejects(moveCard(C, 'qualificacao', card.updatedAt, operator), /STALE/);
});

test('mudar de área exige revisor e a última subetapa; a área seguinte assume', async () => {
  let card = (await getCard(C))!;
  await assert.rejects(advanceCard(C, card.updatedAt, 'proximo', '', operator), /REVIEWER_REQUIRED/);
  await assert.rejects(advanceCard(C, card.updatedAt, 'proximo', '', lawyer), /SUBSTAGE_NOT_DONE/);
  card = await moveCard(C, 'negociacao', card.updatedAt, operator);
  card = await advanceCard(C, card.updatedAt, 'proximo', '', lawyer);
  assert.deepEqual([card.sector, card.substage], ['cadastro', 'pendente-documentacao']);
  assert.equal((await listFlow('comercial')).some(c => c.cnpj === C), false);
  const history = await flowHistory(C);
  assert.equal(history[0]!.toSector, 'cadastro'); assert.match(history[0]!.note, /Comercial concluída/);
  // Devolver exige revisor e volta para a última subetapa da área anterior; o funil do site acompanha.
  card = await advanceCard(C, card.updatedAt, 'anterior', 'Proposta precisa ser refeita', admin);
  assert.deepEqual([card.sector, card.substage], ['comercial', 'negociacao']);
  assert.equal((await listLeads()).find(l => l.event.company.cnpj === C)!.stage, 'negociacao');
  await assert.rejects(advanceCard(C, card.updatedAt, 'anterior', 'x', admin), /FIRST_SECTOR/);
});

test('cliente que chega ao Controller ganha registro de processo; Jurídico é a última área', async () => {
  let card = (await getCard(B))!;
  card = await moveCard(B, 'documentacao-completa', card.updatedAt, operator);
  card = await advanceCard(B, card.updatedAt, 'proximo', 'Documentos conferidos', admin);
  assert.deepEqual([card.sector, card.substage], ['controller', 'aguardando-protocolo']);
  assert.equal((await listProcesses()).filter(p => p.cnpj === B).length, 1);
  for (const s of ['analise-chefia-despacho']) card = await moveCard(B, s, card.updatedAt, admin);
  card = await advanceCard(B, card.updatedAt, 'proximo', '', admin);
  assert.deepEqual([card.sector, card.substage], ['juridico', 'pre-analise']);
  card = await moveCard(B, 'ajuizado', card.updatedAt, admin);
  await assert.rejects(advanceCard(B, card.updatedAt, 'proximo', '', admin), /LAST_SECTOR/);
});

test('setores por pessoa limitam quem arrasta; externo não atua no Comercial nem no Jurídico', async () => {
  assert.equal(await canWork(operator, 'comercial'), true);
  await setUserSectors(operator.id, ['cadastro']);
  assert.equal(await canWork(operator, 'comercial'), false); assert.equal(await canWork(operator, 'cadastro'), true);
  const card = (await getCard(C))!;
  await assert.rejects(moveCard(C, 'proposta', card.updatedAt, operator), /FORBIDDEN_SECTOR/);
  assert.equal(await canWork(external, 'comercial'), false); assert.equal(await canWork(external, 'cadastro'), true);
  assert.equal(await canWork(admin, 'juridico'), true);
  // Cliente de outro dono não aparece para o externo.
  assert.equal((await listFlow('controller', { ownerId: external.id })).length, 0);
});

test('Jurídico: analista leva até a análise da chefia; aprovar e ajuizar é do responsável da área', async () => {
  const D = '47733961000179', samuel = { id: 'u-sam', name: 'Samuel', role: 'operador' as const }, max = { id: 'u-max', name: 'Max', role: 'operador' as const };
  const leonardo = { id: 'u-leo', name: 'Leonardo', role: 'advogado' as const };
  await setUserSectors(samuel.id, ['cadastro', 'juridico']); await setUserSectors(max.id, ['cadastro', 'controller']); await setUserSectors(leonardo.id, ['juridico']); await setUserSectors(external.id, ['cadastro']);
  await createProcess(process0(D, 'EMPRESA D'), admin);
  await listFlow('controller');
  let card = (await getCard(D))!;
  card = await moveCard(D, 'analise-chefia-despacho', card.updatedAt, max);
  await assert.rejects(moveCard(D, 'tem-despacho', card.updatedAt, samuel), /FORBIDDEN_SECTOR/);
  // Leonardo só aprova no Jurídico: tirar do Controller é com a chefia do escritório.
  await assert.rejects(advanceCard(D, card.updatedAt, 'proximo', '', leonardo), /REVIEWER_REQUIRED/);
  card = await advanceCard(D, card.updatedAt, 'proximo', '', admin);
  assert.equal(card.sector, 'juridico');
  await assert.rejects(moveCard(D, 'ajuizado', card.updatedAt, samuel), /APPROVAL_REQUIRED/);
  card = await moveCard(D, 'analise-chefia', card.updatedAt, samuel);
  await assert.rejects(moveCard(D, 'ajuizado', card.updatedAt, samuel), /APPROVAL_REQUIRED/);
  await assert.rejects(moveCard(D, 'pre-analise', card.updatedAt, samuel), /APPROVAL_REQUIRED/);
  card = await moveCard(D, 'ajuizado', card.updatedAt, leonardo);
  assert.equal(card.substage, 'ajuizado');
  card = await moveCard(D, 'pre-analise', card.updatedAt, leonardo);
  card = await advanceCard(D, card.updatedAt, 'anterior', 'Faltam documentos do processo', leonardo);
  assert.deepEqual([card.sector, card.substage], ['controller', 'analise-chefia-despacho']);
  assert.equal(await canWork(external, 'controller'), false); assert.equal(await canWork(external, 'cadastro'), true);
  assert.equal(await canApprove(leonardo, 'juridico'), true); assert.equal(await canApprove(leonardo, 'controller'), false); assert.equal(await canApprove(samuel, 'juridico'), false);
});

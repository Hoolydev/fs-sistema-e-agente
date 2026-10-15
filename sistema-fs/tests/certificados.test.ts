import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';
Object.assign(process.env, { NODE_ENV: 'test' }); delete process.env.DATABASE_URL; delete process.env.FS_CRM_DATABASE_URL; process.env.FS_CRM_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'fs-cert-test-'));
import { open, seal, type Envelope } from '../lib/certificados/envelope';
import { readPfx } from '../lib/certificados/pfx';
import { envelopeForAgent, listCertificates, revokeCertificate, storeCertificate } from '../lib/certificados/store';
import { query } from '../lib/comercial/store';

const vault = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const env = { NODE_ENV: 'test', FS_CERT_VAULT_PUBLIC_KEY: vault.publicKey.replace(/\n/g, '\\n') } as NodeJS.ProcessEnv;
const admin = { id: 'u1', name: 'Fernando', role: 'admin' as const };
const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
function pfx(cn: string, from: Date, to: Date, password = 'senha-teste') {
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = '01'; cert.validity.notBefore = from; cert.validity.notAfter = to;
  const attrs = [{ name: 'commonName', value: cn }, { name: 'organizationName', value: 'ICP-Brasil' }];
  cert.setSubject(attrs); cert.setIssuer([{ name: 'commonName', value: 'AC TESTE' }]); cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}
const day = 86_400_000, now = Date.now();
const valid = pfx('EMPRESA TESTE LTDA:11222333000181', new Date(now - day), new Date(now + 400 * day));

test('envelope só abre com a chave privada do agente', () => {
  const env1 = seal(Buffer.from('conteúdo sigiloso'), vault.publicKey);
  assert.equal(open(env1, vault.privateKey).toString(), 'conteúdo sigiloso');
  const other = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  assert.throws(() => open(env1, other.privateKey));
  assert.throws(() => open({ ...env1, ct: Buffer.from('adulterado').toString('base64') }, vault.privateKey));
});

test('leitura do A1: senha, titular e CNPJ do e-CNPJ', () => {
  const info = readPfx(valid, 'senha-teste');
  assert.equal(info.cnpj, '11222333000181'); assert.equal(info.holder, 'EMPRESA TESTE LTDA'); assert.equal(info.issuer, 'AC TESTE'); assert.equal(info.fingerprint.length, 64);
  assert.throws(() => readPfx(valid, 'errada'), /BAD_PASSWORD/);
  assert.throws(() => readPfx(Buffer.from('não é pfx'), 'x'), /BAD_PASSWORD/);
});

test('cofre confere a empresa e a validade, guarda só cifrado e troca o anterior', async () => {
  await assert.rejects(storeCertificate({ cnpj: '11222333000181', pfx: valid, passphrase: 'senha-teste' }, admin, { NODE_ENV: 'test' } as NodeJS.ProcessEnv), /VAULT_NOT_CONFIGURED/);
  await assert.rejects(storeCertificate({ cnpj: '51646813000194', pfx: valid, passphrase: 'senha-teste' }, admin, env), /CNPJ_MISMATCH/);
  await assert.rejects(storeCertificate({ cnpj: '11222333000181', pfx: pfx('EMPRESA TESTE LTDA:11222333000181', new Date(now - 400 * day), new Date(now - day)), passphrase: 'senha-teste' }, admin, env), /EXPIRED/);
  await assert.rejects(storeCertificate({ cnpj: '11222333000181', pfx: pfx('PESSOA FISICA:12345678909', new Date(now - day), new Date(now + day)), passphrase: 'senha-teste' }, admin, env), /NOT_ECNPJ/);
  const first = await storeCertificate({ cnpj: '11.222.333/0001-81', pfx: valid, passphrase: 'senha-teste' }, admin, env);
  assert.equal(first.active, true); assert.ok(first.daysLeft > 390);
  // No banco não há arquivo nem senha em claro.
  const [row] = await query('SELECT envelope FROM fs_certificates WHERE id=$1', [first.id]);
  assert.equal(String(row!.envelope).includes('senha-teste'), false);
  const opened = JSON.parse(open(JSON.parse(String(row!.envelope)) as Envelope, vault.privateKey).toString());
  assert.equal(opened.passphrase, 'senha-teste'); assert.deepEqual(Buffer.from(opened.pfx, 'base64'), valid);
  const second = await storeCertificate({ cnpj: '11222333000181', pfx: valid, passphrase: 'senha-teste' }, admin, env);
  const list = await listCertificates('11222333000181');
  assert.deepEqual(list.map(c => [c.id, c.active]), [[second.id, true], [first.id, false]]);
  const [old] = await query('SELECT envelope FROM fs_certificates WHERE id=$1', [first.id]);
  assert.equal(old!.envelope, '');
});

test('agente recebe só o envelope do certificado ativo; revogado não é entregue', async () => {
  const found = await envelopeForAgent('11222333000181', 'teste');
  assert.ok(found); assert.equal(JSON.parse(open(found!.envelope, vault.privateKey).toString()).passphrase, 'senha-teste');
  await revokeCertificate(found!.certificate.id, admin);
  assert.equal(await envelopeForAgent('11222333000181', 'teste'), null);
  const [audit] = await query("SELECT COUNT(*) AS n FROM fs_certificate_audit WHERE action='entregue_ao_agente'");
  assert.equal(Number(audit!.n), 1);
});

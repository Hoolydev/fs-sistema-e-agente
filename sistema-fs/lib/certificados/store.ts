import { randomUUID } from "node:crypto";
import { init, query } from "@/lib/comercial/store";
import type { Actor } from "@/lib/auth/server";
import { normalizeCnpj } from "@/lib/diagnostico/model";
import { keyId, seal, type Envelope } from "./envelope";
import { readPfx } from "./pfx";

// Cofre de certificados A1 dos clientes. Guarda só o envelope cifrado para o agente (ver envelope.ts) e os dados
// públicos do certificado. Nunca devolve o arquivo nem a senha; cada envio, entrega ao agente e revogação é auditado.
export type StoredCertificate = {
  id: string; cnpj: string; holder: string; certCnpj: string | null; issuer: string; notBefore: string; notAfter: string; fingerprint: string;
  createdBy: string; createdAt: string; revokedAt: string | null; revokedBy: string | null; active: boolean; daysLeft: number;
};
export const MAX_PFX_BYTES = 50 * 1024;
type Row = Record<string, unknown>;
const text = (v: unknown) => (v === null || v === undefined ? null : String(v));
const daysLeft = (iso: string, now = Date.now()) => Math.floor((Date.parse(iso) - now) / 86_400_000);
const toCertificate = (r: Row): StoredCertificate => ({
  id: String(r.id), cnpj: String(r.cnpj), holder: String(r.holder), certCnpj: text(r.cert_cnpj), issuer: String(r.issuer), notBefore: String(r.not_before), notAfter: String(r.not_after), fingerprint: String(r.fingerprint),
  createdBy: String(r.created_by), createdAt: String(r.created_at), revokedAt: text(r.revoked_at), revokedBy: text(r.revoked_by), active: !r.revoked_at, daysLeft: daysLeft(String(r.not_after)),
});

let ready: Promise<void> | undefined;
export async function setupCertificates() {
  await init();
  if (!ready) ready = (async () => {
    await query("CREATE TABLE IF NOT EXISTS fs_certificates (id TEXT PRIMARY KEY, cnpj TEXT NOT NULL, holder TEXT NOT NULL, cert_cnpj TEXT, issuer TEXT NOT NULL, not_before TEXT NOT NULL, not_after TEXT NOT NULL, fingerprint TEXT NOT NULL, key_id TEXT NOT NULL, envelope TEXT NOT NULL, created_by TEXT NOT NULL, created_by_id TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT, revoked_by TEXT)");
    await query("CREATE INDEX IF NOT EXISTS fs_certificates_cnpj ON fs_certificates (cnpj, created_at)");
    await query("CREATE TABLE IF NOT EXISTS fs_certificate_audit (id TEXT PRIMARY KEY, certificate_id TEXT NOT NULL, cnpj TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)");
  })().catch(e => { ready = undefined; throw e; });
  await ready;
}
async function audit(certificateId: string, cnpj: string, actor: string, action: string, detail = "") {
  await query("INSERT INTO fs_certificate_audit (id,certificate_id,cnpj,actor,action,detail,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [randomUUID(), certificateId, cnpj, actor, action, detail, new Date().toISOString()]);
}
export function vaultPublicKey(env: NodeJS.ProcessEnv = process.env) {
  const key = env.FS_CERT_VAULT_PUBLIC_KEY;
  if (!key) throw new Error("VAULT_NOT_CONFIGURED");
  return key;
}

export async function listCertificates(cnpj: string): Promise<StoredCertificate[]> {
  await setupCertificates();
  return (await query("SELECT id,cnpj,holder,cert_cnpj,issuer,not_before,not_after,fingerprint,created_by,created_at,revoked_at,revoked_by FROM fs_certificates WHERE cnpj=$1 ORDER BY created_at DESC LIMIT 20", [normalizeCnpj(cnpj)])).map(toCertificate);
}

// Envio: confere senha, CNPJ do certificado (o mesmo da empresa ou da mesma raiz) e validade; cifra para o agente;
// o certificado ativo anterior da empresa é revogado e tem o envelope apagado.
export async function storeCertificate(input: { cnpj: string; pfx: Buffer; passphrase: string }, actor: Actor, env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  await setupCertificates();
  const cnpj = normalizeCnpj(input.cnpj);
  if (!input.pfx.length || input.pfx.length > MAX_PFX_BYTES) throw new Error("FILE_INVALID");
  const publicKey = vaultPublicKey(env);
  const info = readPfx(input.pfx, input.passphrase);
  if (!info.cnpj) throw new Error("NOT_ECNPJ");
  if (info.cnpj !== cnpj && info.cnpj.slice(0, 8) !== cnpj.slice(0, 8)) throw new Error("CNPJ_MISMATCH");
  if (Date.parse(info.notAfter) <= now) throw new Error("EXPIRED");
  if (Date.parse(info.notBefore) > now) throw new Error("NOT_YET_VALID");
  const envelope = seal(Buffer.from(JSON.stringify({ pfx: input.pfx.toString("base64"), passphrase: input.passphrase })), publicKey);
  const id = randomUUID(), at = new Date(now).toISOString();
  for (const old of (await listCertificates(cnpj)).filter(c => c.active)) {
    await query("UPDATE fs_certificates SET envelope='', revoked_at=$1, revoked_by=$2 WHERE id=$3", [at, actor.name, old.id]);
    await audit(old.id, cnpj, actor.name, "substituido", `Substituído pelo certificado ${info.fingerprint.slice(0, 16)}`);
  }
  await query("INSERT INTO fs_certificates (id,cnpj,holder,cert_cnpj,issuer,not_before,not_after,fingerprint,key_id,envelope,created_by,created_by_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    [id, cnpj, info.holder, info.cnpj, info.issuer, info.notBefore, info.notAfter, info.fingerprint, keyId(publicKey), JSON.stringify(envelope), actor.name, actor.id, at]);
  await audit(id, cnpj, actor.name, "enviado", info.cnpj === cnpj ? "" : `Certificado da matriz/raiz ${info.cnpj}`);
  return (await listCertificates(cnpj)).find(c => c.id === id)!;
}

export async function revokeCertificate(id: string, actor: Actor) {
  await setupCertificates();
  const [row] = await query("SELECT cnpj, revoked_at FROM fs_certificates WHERE id=$1", [id]);
  if (!row) throw new Error("NOT_FOUND");
  if (!row.revoked_at) {
    await query("UPDATE fs_certificates SET envelope='', revoked_at=$1, revoked_by=$2 WHERE id=$3", [new Date().toISOString(), actor.name, id]);
    await audit(id, String(row.cnpj), actor.name, "revogado");
  }
  return (await listCertificates(String(row.cnpj))).find(c => c.id === id)!;
}

// Entrega ao agente (que tem a chave privada): só o envelope do certificado ativo e válido, com a finalidade registrada.
export async function envelopeForAgent(cnpj: string, purpose: string): Promise<{ certificate: StoredCertificate; envelope: Envelope } | null> {
  await setupCertificates();
  const [row] = await query("SELECT * FROM fs_certificates WHERE cnpj=$1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1", [normalizeCnpj(cnpj)]);
  if (!row || !row.envelope) return null;
  const certificate = toCertificate(row);
  if (certificate.daysLeft < 0) return null;
  await audit(certificate.id, certificate.cnpj, "agente", "entregue_ao_agente", purpose.slice(0, 120));
  return { certificate, envelope: JSON.parse(String(row.envelope)) as Envelope };
}
export async function certificateAudit(cnpj: string) {
  await setupCertificates();
  return (await query("SELECT actor, action, detail, created_at FROM fs_certificate_audit WHERE cnpj=$1 ORDER BY created_at DESC LIMIT 50", [normalizeCnpj(cnpj)])).map(r => ({ actor: String(r.actor), action: String(r.action), detail: String(r.detail), createdAt: String(r.created_at) }));
}

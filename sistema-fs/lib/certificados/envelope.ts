import { constants, createCipheriv, createDecipheriv, createHash, createPublicKey, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";

// Envelope do cofre de certificados: o conteúdo (arquivo .pfx e senha) é cifrado com AES-256-GCM e a chave
// do AES com RSA-OAEP-SHA256 usando a chave pública do agente. A chave privada fica só na VPS do agente:
// o sistema (Vercel) e o banco guardam apenas o envelope e não conseguem abri-lo.
export type Envelope = { v: 1; alg: "RSA-OAEP-256+A256GCM"; kid: string; ek: string; iv: string; tag: string; ct: string };
export const normalizePem = (pem: string) => pem.replace(/\\n/g, "\n").trim();
export function keyId(publicKeyPem: string) {
  const der = createPublicKey(normalizePem(publicKeyPem)).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}
export function seal(payload: Buffer, publicKeyPem: string): Envelope {
  const pem = normalizePem(publicKeyPem), key = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv), ct = Buffer.concat([cipher.update(payload), cipher.final()]);
  const ek = publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key);
  key.fill(0);
  return { v: 1, alg: "RSA-OAEP-256+A256GCM", kid: keyId(pem), ek: ek.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}
// Abertura (usada pelo agente; aqui só para testes).
export function open(envelope: Envelope, privateKeyPem: string): Buffer {
  if (envelope.v !== 1 || envelope.alg !== "RSA-OAEP-256+A256GCM") throw new Error("ENVELOPE_UNSUPPORTED");
  const key = privateDecrypt({ key: normalizePem(privateKeyPem), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(envelope.ek, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  try { return Buffer.concat([decipher.update(Buffer.from(envelope.ct, "base64")), decipher.final()]); } finally { key.fill(0); }
}

import { constants, createDecipheriv, privateDecrypt } from "node:crypto";

// Abertura do envelope do cofre de certificados (mesmo formato de sistema-fs/lib/certificados/envelope.ts):
// AES-256-GCM com a chave cifrada em RSA-OAEP-SHA256. A chave privada existe só nesta VPS.
export type Envelope = { v: 1; alg: "RSA-OAEP-256+A256GCM"; kid: string; ek: string; iv: string; tag: string; ct: string };
export function openEnvelope(envelope: Envelope, privateKeyPem: string): Buffer {
  if (envelope?.v !== 1 || envelope.alg !== "RSA-OAEP-256+A256GCM") throw new Error("envelope_unsupported");
  const key = privateDecrypt({ key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(envelope.ek, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  try { return Buffer.concat([decipher.update(Buffer.from(envelope.ct, "base64")), decipher.final()]); } finally { key.fill(0); }
}

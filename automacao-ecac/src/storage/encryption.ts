import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function decodeEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("DOCUMENT_ENCRYPTION_KEY_BASE64 deve conter exatamente 32 bytes em Base64");
  }
  return key;
}

export function encryptDocument(plaintext: Buffer, key: Buffer): Buffer {
  assertKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]);
}

export function decryptDocument(payload: Buffer, key: Buffer): Buffer {
  assertKey(key);
  if (payload.length < 1 + IV_LENGTH + TAG_LENGTH || payload[0] !== VERSION) {
    throw new Error("Documento cifrado possui formato inválido");
  }
  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const tag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(1 + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function assertKey(key: Buffer): void {
  if (key.length !== 32) throw new Error("A chave AES-256 precisa ter 32 bytes");
}

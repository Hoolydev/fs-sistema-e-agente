import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptDocument, encryptDocument } from "../src/storage/encryption.js";

describe("document encryption", () => {
  it("encrypts and decrypts without exposing plaintext", () => {
    const key = randomBytes(32);
    const plaintext = Buffer.from("documento fiscal de teste");
    const encrypted = encryptDocument(plaintext, key);
    expect(encrypted.includes(plaintext)).toBe(false);
    expect(decryptDocument(encrypted, key)).toEqual(plaintext);
  });

  it("rejects tampered ciphertext", () => {
    const key = randomBytes(32);
    const encrypted = encryptDocument(Buffer.from("conteudo"), key);
    encrypted[encrypted.length - 1] = (encrypted.at(-1) ?? 0) ^ 1;
    expect(() => decryptDocument(encrypted, key)).toThrow();
  });
});

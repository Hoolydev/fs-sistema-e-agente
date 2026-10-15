import { constants, createCipheriv, generateKeyPairSync, publicEncrypt, randomBytes } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { VaultCertificateProvider } from "../src/security/certificate-provider.js";

// Mesmo formato do sistema FS (sistema-fs/lib/certificados/envelope.ts).
function seal(payload: Buffer, publicKey: string) {
  const key = randomBytes(32), iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv), ct = Buffer.concat([cipher.update(payload), cipher.final()]);
  return { v: 1, alg: "RSA-OAEP-256+A256GCM", kid: "k", ek: publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key).toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}
const pair = () => generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });

describe("VaultCertificateProvider", () => {
  it("busca o envelope no sistema e abre só com a chave privada da VPS", async () => {
    const keys = pair(), dir = await mkdtemp(join(tmpdir(), "vault-")), keyFile = join(dir, "privada.pem");
    await writeFile(keyFile, keys.privateKey);
    const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", FS_SYSTEM_URL: "https://sistema.test", FS_SYSTEM_API_TOKEN: "tok", FS_CERT_VAULT_PRIVATE_KEY_FILE: keyFile, DATABASE_URL: "postgres://x:x@localhost:5432/x", REDIS_URL: "redis://localhost:6379", ECAC_LOGIN_URL: "https://example.gov.br/login" });
    const envelope = seal(Buffer.from(JSON.stringify({ pfx: Buffer.from("PFX").toString("base64"), passphrase: "s3nha" })), keys.publicKey);
    const calls: string[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => { calls.push(`${url} ${JSON.stringify(init?.headers)}`); return url.includes("51646813000194") ? new Response(JSON.stringify({ envelope }), { status: 200 }) : new Response("{}", { status: 404 }); }) as unknown as typeof fetch;
    const provider = new VaultCertificateProvider(config, fetcher);
    const material = await provider.getForCnpj("51.646.813/0001-94", "SITFIS");
    expect(material.pfx.toString()).toBe("PFX"); expect(material.passphrase).toBe("s3nha");
    expect(calls[0]).toContain("/api/agent/certificados?cnpj=51646813000194&finalidade=SITFIS"); expect(calls[0]).toContain("Bearer tok");
    await expect(provider.getForCnpj("11222333000181")).rejects.toThrow("certificate_not_found");
    // Envelope de outra chave não abre.
    await writeFile(keyFile, pair().privateKey);
    await expect(provider.getForCnpj("51646813000194")).rejects.toThrow();
    await expect(new VaultCertificateProvider({ ...config, FS_CERT_VAULT_PRIVATE_KEY_FILE: "" }, fetcher).getForCnpj("51646813000194")).rejects.toThrow("vault_key_missing");
  });
});

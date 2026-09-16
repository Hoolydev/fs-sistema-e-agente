import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { LocalCertificateProvider } from "../src/security/certificate-provider.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("LocalCertificateProvider", () => {
  it("lê a senha do arquivo separado e remove apenas a quebra final", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cert-provider-"));
    directories.push(directory);
    const pfxPath = join(directory, "certificate.pfx");
    const passphrasePath = join(directory, "passphrase");
    await writeFile(pfxPath, Buffer.from([1, 2, 3]));
    await writeFile(passphrasePath, " senha protegida \n");

    const config = loadConfig({
      NODE_ENV: "test",
      WHATSAPP_VERIFY_TOKEN: "12345678",
      WHATSAPP_APP_SECRET: "12345678",
      META_GRAPH_API_VERSION: "v25.0",
      DATABASE_URL: "postgres://localhost/ecac",
      REDIS_URL: "redis://localhost:6379",
      ECAC_LOGIN_URL: "https://cav.receita.fazenda.gov.br/autenticacao/login",
      CERT_PFX_PATH: pfxPath,
      CERT_PFX_PASSPHRASE: "senha-antiga",
      CERT_PFX_PASSPHRASE_FILE: passphrasePath,
    });

    const material = await new LocalCertificateProvider(config).getForCnpj("47733961000179");
    expect(material.pfx).toEqual(Buffer.from([1, 2, 3]));
    expect(material.passphrase).toBe(" senha protegida ");
  });
});

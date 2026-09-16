import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const [pfxPath, passphrasePath] = process.argv.slice(2);

if (!pfxPath || !passphrasePath) {
  throw new Error(
    "Uso: node dist/scripts/validate-certificate.js CAMINHO_PFX ARQUIVO_SENHA",
  );
}

const passphrase = await readFile(passphrasePath);
if (passphrase.length === 0) throw new Error("O arquivo de senha está vazio");
passphrase.fill(0);

const temporaryCertificate = join(tmpdir(), `ecac-cert-${crypto.randomUUID()}.pem`);
try {
  await execFileAsync("openssl", [
    "pkcs12",
    "-in",
    pfxPath,
    "-clcerts",
    "-nokeys",
    "-passin",
    `file:${passphrasePath}`,
    "-out",
    temporaryCertificate,
  ]);
  const { stdout } = await execFileAsync("openssl", [
    "x509",
    "-in",
    temporaryCertificate,
    "-noout",
    "-subject",
    "-issuer",
    "-serial",
    "-dates",
    "-fingerprint",
    "-sha256",
  ]);
  process.stdout.write(stdout);
} finally {
  await rm(temporaryCertificate, { force: true });
}

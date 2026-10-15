import { readFile } from "node:fs/promises";
import type { AppConfig } from "../config.js";
import { openEnvelope, type Envelope } from "./vault-envelope.js";

export interface CertificateMaterial {
  pfx: Buffer;
  passphrase: string;
}

export interface CertificateProvider {
  getForCnpj(cnpj: string): Promise<CertificateMaterial>;
}

export class LocalCertificateProvider implements CertificateProvider {
  constructor(private readonly config: AppConfig) {}

  async getForCnpj(_cnpj: string): Promise<CertificateMaterial> {
    const passphrase = await this.readPassphrase();
    if (!this.config.CERT_PFX_PATH || !passphrase) {
      throw new Error("Certificado local não configurado");
    }
    return {
      pfx: await readFile(this.config.CERT_PFX_PATH),
      passphrase,
    };
  }

  private async readPassphrase(): Promise<string> {
    if (this.config.CERT_PFX_PASSPHRASE_FILE) {
      const value = await readFile(this.config.CERT_PFX_PASSPHRASE_FILE, "utf8");
      return value.replace(/\r?\n$/, "");
    }
    return this.config.CERT_PFX_PASSPHRASE;
  }
}

// Certificado A1 do próprio cliente, guardado cifrado no cofre do sistema FS. O sistema entrega só o envelope;
// a chave privada que o abre fica nesta VPS (FS_CERT_VAULT_PRIVATE_KEY_FILE). O material vive só em memória.
export class VaultCertificateProvider implements CertificateProvider {
  constructor(
    private readonly config: AppConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async getForCnpj(cnpj: string, purpose = "consulta"): Promise<CertificateMaterial> {
    const { FS_SYSTEM_URL, FS_SYSTEM_API_TOKEN, FS_CERT_VAULT_PRIVATE_KEY_FILE } = this.config;
    if (!FS_SYSTEM_URL || !FS_SYSTEM_API_TOKEN) throw new Error("system_not_configured");
    if (!FS_CERT_VAULT_PRIVATE_KEY_FILE) throw new Error("vault_key_missing");
    const digits = cnpj.replace(/\D/g, "");
    if (!/^\d{14}$/.test(digits)) throw new Error("invalid_cnpj");
    const response = await this.fetcher(`${FS_SYSTEM_URL.replace(/\/$/, "")}/api/agent/certificados?cnpj=${digits}&finalidade=${encodeURIComponent(purpose.slice(0, 120))}`, {
      headers: { authorization: `Bearer ${FS_SYSTEM_API_TOKEN}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 404) throw new Error("certificate_not_found");
    if (!response.ok) throw new Error("vault_unavailable");
    const data = (await response.json()) as { envelope?: Envelope; certificate?: { certCnpj?: string } };
    if (!data.envelope) throw new Error("vault_unavailable");
    const opened = openEnvelope(data.envelope, await readFile(FS_CERT_VAULT_PRIVATE_KEY_FILE, "utf8"));
    try {
      const payload = JSON.parse(opened.toString("utf8")) as { pfx?: string; passphrase?: string };
      if (!payload.pfx || typeof payload.passphrase !== "string") throw new Error("envelope_invalid");
      return { pfx: Buffer.from(payload.pfx, "base64"), passphrase: payload.passphrase };
    } finally { opened.fill(0); }
  }
}

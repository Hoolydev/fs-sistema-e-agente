import { readFile } from "node:fs/promises";
import type { AppConfig } from "../config.js";

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

export class VaultCertificateProvider implements CertificateProvider {
  async getForCnpj(_cnpj: string): Promise<CertificateMaterial> {
    throw new Error("Provedor de cofre será conectado durante a configuração da VPS");
  }
}

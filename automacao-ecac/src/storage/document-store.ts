import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { AppConfig } from "../config.js";
import type { RpaRequest, RpaResult } from "../domain/types.js";
import { decodeEncryptionKey, encryptDocument } from "./encryption.js";

export interface StoredDocument {
  key: string;
}

export interface DocumentStore {
  save(request: RpaRequest, result: RpaResult): Promise<StoredDocument>;
}

export class LocalDocumentStore implements DocumentStore {
  constructor(private readonly root: string) {}

  async save(request: RpaRequest, result: RpaResult): Promise<StoredDocument> {
    const key = documentKey(request, result.filename);
    const destination = join(this.root, key);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(result.localPath, destination);
    return { key };
  }
}

export class S3DocumentStore implements DocumentStore {
  private readonly client: S3Client;
  private readonly encryptionKey: Buffer;

  constructor(private readonly config: AppConfig) {
    if (!config.S3_ENDPOINT || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
      throw new Error("Credenciais do armazenamento S3 não configuradas");
    }
    this.encryptionKey = decodeEncryptionKey(config.DOCUMENT_ENCRYPTION_KEY_BASE64);
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async save(request: RpaRequest, result: RpaResult): Promise<StoredDocument> {
    const key = documentKey(request, result.filename);
    const encrypted = encryptDocument(await readFile(result.localPath), this.encryptionKey);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: key,
        Body: encrypted,
        ContentType: "application/octet-stream",
        Metadata: {
          sha256: result.sha256,
          request_id: request.requestId,
          cnpj: request.cnpj,
          original_mime: result.mimeType,
          encryption: "aes-256-gcm-v1",
        },
      }),
    );
    return { key };
  }
}

function documentKey(request: RpaRequest, filename: string): string {
  const safeName = basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const [year = "unknown"] = request.period.split("-");
  return `${request.cnpj}/${year}/${request.requestId}/${safeName}`;
}

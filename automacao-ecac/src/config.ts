import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),
  WHATSAPP_PROVIDER: z.enum(["meta", "zapi"]).default("meta"),
  WHATSAPP_VERIFY_TOKEN: z.string().default(""),
  WHATSAPP_APP_SECRET: z.string().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v25.0"),
  ZAPI_BASE_URL: z.string().url().default("https://api.z-api.io"),
  ZAPI_INSTANCE_ID: z.string().default(""),
  ZAPI_INSTANCE_TOKEN: z.string().default(""),
  ZAPI_CLIENT_TOKEN: z.string().default(""),
  ZAPI_WEBHOOK_TOKEN: z.string().default(""),
  WHATSAPP_DRY_RUN: booleanFromString,
  AUTHORIZED_PHONE_NUMBERS: z.string().default(""),
  FS_SYSTEM_URL: z.string().default(""),
  FS_SYSTEM_API_TOKEN: z.string().default(""),
  LLM_PROVIDER: z.enum(["disabled", "openai"]).default("disabled"),
  LLM_MODEL: z.string().default("gpt-5.5"),
  LLM_API_KEY_FILE: z.string().default("/run/secrets/openai_api_key"),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  LLM_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(120_000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  DOCUMENT_STORAGE_MODE: z.enum(["local", "s3"]).default("local"),
  LOCAL_DOCUMENT_DIR: z.string().default("./data/documents"),
  S3_ENDPOINT: z.string().default(""),
  S3_REGION: z.string().default("default"),
  S3_BUCKET: z.string().default("fs-ecac-documents"),
  S3_ACCESS_KEY_ID: z.string().default(""),
  S3_SECRET_ACCESS_KEY: z.string().default(""),
  DOCUMENT_ENCRYPTION_KEY_BASE64: z.string().default(""),
  RPA_MODE: z.enum(["mock", "ecac"]).default("mock"),
  FISCAL_DATA_PROVIDER: z.enum(["rpa", "serpro"]).default("rpa"),
  SERPRO_ENABLED: booleanFromString,
  SERPRO_CONTRACTOR_CNPJ: z.string().default(""),
  SERPRO_AUTHOR_CNPJ: z.string().default(""),
  SERPRO_CONSUMER_KEY_FILE: z.string().default("/run/secrets/serpro_consumer_key"),
  SERPRO_CONSUMER_SECRET_FILE: z.string().default("/run/secrets/serpro_consumer_secret"),
  SERPRO_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(180_000).default(60_000),
  SERPRO_POLL_TIMEOUT_MS: z.coerce.number().int().positive().max(600_000).default(180_000),
  SERPRO_MAX_POLL_ATTEMPTS: z.coerce.number().int().positive().max(20).default(6),
  ECAC_LOGIN_URL: z.string().url(),
  ECAC_CLIENT_CERT_ORIGINS: z.string().default(""),
  ECAC_CDP_URL: z.string().default(""),
  CERTIFICATE_PROVIDER: z.enum(["local", "vault"]).default("local"),
  CERT_PFX_PATH: z.string().default(""),
  CERT_PFX_PASSPHRASE: z.string().default(""),
  CERT_PFX_PASSPHRASE_FILE: z.string().default(""),
  DOCUMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  RPA_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  HUMAN_INTERVENTION_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
});

export type AppConfig = z.infer<typeof configSchema> & {
  authorizedPhoneNumbers: Set<string>;
  ecacClientCertificateOrigins: string[];
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(environment);
  return {
    ...parsed,
    authorizedPhoneNumbers: new Set(
      parsed.AUTHORIZED_PHONE_NUMBERS.split(",")
        .map(normalizePhoneNumber)
        .filter(Boolean),
    ),
    ecacClientCertificateOrigins: parsed.ECAC_CLIENT_CERT_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

export function normalizePhoneNumber(value: string): string {
  return value.replace(/\D/g, "");
}

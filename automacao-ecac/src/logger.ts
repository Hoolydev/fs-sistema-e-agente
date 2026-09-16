import pino from "pino";

export function createLogger(level = "info") {
  return pino({
    level,
    redact: {
      paths: [
        "req.headers.authorization",
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_APP_SECRET",
        "CERT_PFX_PASSPHRASE",
        "certificate",
        "passphrase",
      ],
      censor: "[REDACTED]",
    },
  });
}

export type AppLogger = ReturnType<typeof createLogger>;

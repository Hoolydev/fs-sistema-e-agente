import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import process from "node:process";
import { chromium } from "playwright";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { LocalCertificateProvider } from "./security/certificate-provider.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const profileDirectory = process.env.ECAC_BROWSER_PROFILE_DIR || "/app/data/ecac-browser-profile";
await mkdir(profileDirectory, { recursive: true });

if (config.ecacClientCertificateOrigins.length === 0) {
  throw new Error("Origens do certificado do e-CAC não configuradas");
}
const material = await new LocalCertificateProvider(config).getForCnpj("");
const context = await chromium.launchPersistentContext(profileDirectory, {
  headless: false,
  acceptDownloads: true,
  locale: "pt-BR",
  timezoneId: "America/Sao_Paulo",
  viewport: { width: 1600, height: 900 },
  clientCertificates: config.ecacClientCertificateOrigins.map((origin) => ({
    origin,
    pfx: material.pfx,
    passphrase: material.passphrase,
  })),
  args: [
    "--remote-debugging-address=0.0.0.0",
    "--remote-debugging-port=9222",
    "--remote-allow-origins=*",
    "--disable-blink-features=AutomationControlled",
    "--start-maximized",
  ],
});

const page = context.pages()[0] ?? await context.newPage();
await page.goto(config.ECAC_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
logger.info({ display: process.env.DISPLAY, port: 9222 }, "interactive e-CAC browser session started");

const shutdown = async (signal: string) => {
  logger.info({ signal }, "closing interactive e-CAC browser session");
  material.pfx.fill(0);
  await context.close().catch(() => undefined);
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
await new Promise(() => undefined);

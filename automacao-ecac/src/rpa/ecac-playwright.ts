import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from "playwright";
import type { AppConfig } from "../config.js";
import type { RpaRequest, RpaResult } from "../domain/types.js";
import type { FiscalAnalysisGateway } from "../llm/openai-analysis.js";
import type { AppLogger } from "../logger.js";
import { generateFiscalReport } from "../report/fiscal-report.js";
import type { CertificateProvider } from "../security/certificate-provider.js";
import { HumanInterventionRequired, type EcacAutomation } from "./automation.js";
import { collectFederalDebtSources } from "./federal-debt-flow.js";

const ECAC_PORTAL_URL = "https://cav.receita.fazenda.gov.br/ecac/";
const ECAC_PORTAL_PATTERN = /^https:\/\/cav\.receita\.fazenda\.gov\.br\/ecac(?:\/|$)/i;

export class EcacPlaywrightAutomation implements EcacAutomation {
  constructor(
    private readonly config: AppConfig,
    private readonly certificates: CertificateProvider,
    private readonly analysis: FiscalAnalysisGateway,
    private readonly logger: AppLogger,
    private readonly notifyHumanIntervention?: (request: RpaRequest, reason: "captcha") => Promise<void>,
  ) {}

  async obtainDocument(request: RpaRequest): Promise<RpaResult> {
    const session = await this.openBrowserSession(request.cnpj);
    let page: Page | undefined;
    try {
        const context = session.context;
        page = await context.newPage();
        await authenticateWithDigitalCertificate(page, this.config, async () => {
          await this.notifyHumanIntervention?.(request, "captcha").catch((error: unknown) => {
            this.logger.warn(
              { err: error, requestId: request.requestId },
              "failed to notify CAPTCHA intervention",
            );
          });
        });
        this.logger.info(
          { requestId: request.requestId, url: redactUrl(page.url()) },
          "e-CAC certificate authentication completed",
        );

        await switchToCorporateProxyProfile(page, request.cnpj, this.config.RPA_JOB_TIMEOUT_MS);
        this.logger.info(
          { requestId: request.requestId },
          "e-CAC corporate proxy profile validated",
        );

        if (request.documentType !== "diagnostico_fiscal") {
          throw new HumanInterventionRequired(
            "Este tipo de documento ainda precisa ser homologado no fluxo real.",
            "workflow_not_configured",
          );
        }

        const sourceDirectory = await mkdtemp(join(tmpdir(), "fs-ecac-sources-"));
        const reportPath = join(tmpdir(), `Diagnostico-Fiscal-${request.cnpj}-${randomUUID()}.pdf`);
        try {
          const sources = await collectFederalDebtSources(context, sourceDirectory);
          const companyName = companyNameFromSources(sources.map((source) => source.text))
            ?? `Empresa ${request.cnpj}`;
          const fiscalAnalysis = await this.analysis.analyze({
            cnpj: request.cnpj,
            companyName,
            structuredData: {
              requestedAt: new Date().toISOString(),
              documents: sources.map(({ sourceId, title, pages, sha256, obtainedAt }) => ({
                sourceId,
                title,
                pages,
                sha256,
                obtainedAt,
              })),
            },
            dossierFragments: sources.map(({ sourceId, title, text }) => ({
              sourceId,
              title,
              text: text.slice(0, 55_000),
            })),
          });
          await generateFiscalReport({
            cnpj: request.cnpj,
            companyName,
            analysis: fiscalAnalysis,
            sources,
            destination: reportPath,
          });
          const report = await readFile(reportPath);
          return {
            localPath: reportPath,
            filename: `Diagnostico Fiscal Federal ${safeFilename(companyName)}.pdf`,
            mimeType: "application/pdf",
            sha256: createHash("sha256").update(report).digest("hex"),
            obtainedAt: new Date().toISOString(),
          };
        } finally {
          await rm(sourceDirectory, { recursive: true, force: true }).catch(() => undefined);
        }
    } finally {
      await page?.close().catch(() => undefined);
      if (session.owned) {
        await session.context.close().catch(() => undefined);
        await session.browser.close().catch(() => undefined);
      }
      session.pfx?.fill(0);
    }
  }

  private async openBrowserSession(cnpj: string): Promise<{
    browser: Browser;
    context: BrowserContext;
    owned: boolean;
    pfx?: Buffer;
  }> {
    if (this.config.ECAC_CDP_URL) {
      const endpoint = this.config.ECAC_CDP_URL.replace(/\/$/, "");
      const response = await fetch(`${endpoint}/json/version`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("O navegador remoto do e-CAC não respondeu");
      const version = await response.json() as { webSocketDebuggerUrl?: string };
      if (!version.webSocketDebuggerUrl) {
        throw new Error("O navegador remoto não publicou o endpoint de controle");
      }
      const advertised = new URL(version.webSocketDebuggerUrl);
      const configured = new URL(endpoint);
      advertised.protocol = configured.protocol === "https:" ? "wss:" : "ws:";
      advertised.host = configured.host;
      const browser = await chromium.connectOverCDP(advertised.href, { timeout: 20_000 });
      const context = browser.contexts()[0];
      if (!context) throw new Error("O navegador remoto do e-CAC não possui contexto ativo");
      return { browser, context, owned: false };
    }

    if (this.config.ecacClientCertificateOrigins.length === 0) {
      throw new Error("Origens do certificado do e-CAC não configuradas");
    }
    const material = await this.certificates.getForCnpj(cnpj);
    const clientCertificates: NonNullable<BrowserContextOptions["clientCertificates"]> =
      this.config.ecacClientCertificateOrigins.map((origin) => ({
        origin,
        pfx: material.pfx,
        passphrase: material.passphrase,
      }));
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      acceptDownloads: true,
      clientCertificates,
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    });
    return { browser, context, owned: true, pfx: material.pfx };
  }
}

function companyNameFromSources(texts: string[]): string | undefined {
  for (const text of texts) {
    const match = text.match(/(?:Raz[aã]o Social|Nome Empresarial)\s*:?\s*([^\n]{3,160})/i);
    const name = match?.[1]?.replace(/\s+/g, " ").trim();
    if (name) return name;
  }
  return undefined;
}

function safeFilename(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export async function authenticateWithDigitalCertificate(
  page: Page,
  config: Pick<
    AppConfig,
    "ECAC_LOGIN_URL" | "RPA_JOB_TIMEOUT_MS" | "HUMAN_INTERVENTION_TIMEOUT_MS"
  >,
  onCaptcha?: () => Promise<void>,
): Promise<void> {
  await page.goto(config.ECAC_LOGIN_URL, {
    waitUntil: "domcontentloaded",
    timeout: config.RPA_JOB_TIMEOUT_MS,
  });
  if (isEcacPortal(page.url())) return;

  let captchaNotified = false;
  const checkAccessBlock = async () => {
    if (/acesso foi bloqueado|acesso.*bloqueado.*automatizado/i.test(await safeBodyText(page))) {
      throw new HumanInterventionRequired(
        'O e-CAC bloqueou este acesso por identificá-lo como automatizado. A tentativa foi encerrada.',
        'additional_authentication',
      );
    }
  };
  const waitForCaptcha = async () => {
    await checkAccessBlock();
    if (!(await isCaptchaPending(page))) return;
    if (!captchaNotified) {
      captchaNotified = true;
      await onCaptcha?.();
    }
    const deadline = Date.now() + config.HUMAN_INTERVENTION_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await checkAccessBlock();
      if (isEcacPortal(page.url()) || !(await isCaptchaPending(page))) return;
      await page.waitForTimeout(1_000);
    }
    throw new HumanInterventionRequired(
      "O CAPTCHA não foi resolvido dentro do tempo de intervenção humana.",
      "captcha",
    );
  };

  await page.waitForTimeout(1_000);
  await waitForCaptcha();

  if (!(await clickFirstVisible([
      page.locator('input[type="image"][alt*="Acesso Gov" i]'),
      page.getByRole("button", { name: /(?:entrar com|acesso) gov\.?br/i }),
      page.getByRole("link", { name: /(?:entrar com|acesso) gov\.?br/i }),
    ], 20_000))) {
    throw classifyAuthenticationFailure(await safeBodyText(page), await isCaptchaPending(page));
  }

  await page.waitForTimeout(1_500);
  if (!isEcacPortal(page.url())) {
    await waitForCaptcha();
    const certificateClicked = await clickFirstVisible([
      page.getByRole("button", { name: /seu certificado digital|certificado digital/i }),
      page.getByRole("link", { name: /seu certificado digital|certificado digital/i }),
      page.locator('input[value*="certificado digital" i]'),
    ], 20_000);
    if (!certificateClicked && await isCaptchaPending(page)) {
      throw new HumanInterventionRequired(
        "O login do e-CAC exige resolução humana do CAPTCHA.",
        "captcha",
      );
    }
  }

  const loginDeadline = Date.now() + Math.min(config.RPA_JOB_TIMEOUT_MS, 90_000);
  while (Date.now() < loginDeadline && !isEcacPortal(page.url())) {
    await checkAccessBlock();
    await page.waitForTimeout(1_000);
  }
  if (!isEcacPortal(page.url())) {
    throw classifyAuthenticationFailure(await safeBodyText(page), await isCaptchaPending(page));
  }
}

export async function isCaptchaPending(page: Page): Promise<boolean> {
  // Providers preload hidden frames even before the user starts authentication.
  // Only an actual visible widget/challenge calls for human intervention.
  const captchaFramePresent = await page
    .locator('iframe[src*="hcaptcha" i], iframe[src*="recaptcha" i]')
    .filter({ visible: true }).evaluateAll(frames => frames.some(frame => {
      const rect = frame.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
        && rect.top < window.innerHeight && rect.left < window.innerWidth;
    }));
  if (!captchaFramePresent) return false;

  const response = await page
    .locator('textarea[name="h-captcha-response"], textarea[name="g-recaptcha-response"]')
    .first()
    .inputValue()
    .catch(() => "");
  return response.trim().length === 0;
}

export async function switchToCorporateProxyProfile(
  page: Page,
  cnpj: string,
  timeoutMs: number,
): Promise<void> {
  const normalizedCnpj = normalizeCnpj(cnpj);
  if (normalizedCnpj.length !== 14) {
    throw new Error("CNPJ inválido para troca de perfil no e-CAC");
  }

  if (!isEcacPortal(page.url())) {
    await page.goto(ECAC_PORTAL_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  }

  if (!(await clickFirstVisible([
      page.getByRole("button", { name: /alterar perfil de acesso/i }),
      page.getByRole("link", { name: /alterar perfil de acesso/i }),
      page.getByText(/alterar perfil de acesso/i, { exact: true }),
      page.locator('input[value*="Alterar perfil" i]'),
    ], 20_000))) {
    throw new HumanInterventionRequired(
      "O comando Alterar perfil de acesso não foi localizado.",
      "portal_changed",
    );
  }

  const proxyLabel = page
    .getByText(/Procurador\s+(?:digital\s+)?de\s+pessoa\s+jur[ií]dica\s*-\s*CNPJ/i)
    .filter({ visible: true })
    .first();
  await proxyLabel.waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
  if (!(await proxyLabel.isVisible().catch(() => false))) {
    throw new HumanInterventionRequired(
      "O certificado autenticado não apresentou a opção Procurador de pessoa jurídica - CNPJ.",
      "profile_not_authorized",
    );
  }

  const proxyRow = proxyLabel.locator(
    "xpath=ancestor::*[.//input[not(@type='hidden')] and (.//button[normalize-space()='Alterar'] or .//a[normalize-space()='Alterar'] or .//input[@value='Alterar'])][1]",
  );
  const cnpjInput = proxyRow.locator("input:not([type='hidden']):not([type='submit'])").first();
  if (!(await cnpjInput.isVisible().catch(() => false))) {
    throw new HumanInterventionRequired(
      "O campo de CNPJ do perfil de procurador não foi localizado.",
      "portal_changed",
    );
  }
  await cnpjInput.fill(normalizedCnpj);

  if (!(await clickFirstVisible([
      proxyRow.getByRole("button", { name: /^alterar$/i }),
      proxyRow.getByRole("link", { name: /^alterar$/i }),
      proxyRow.locator('input[type="submit"][value="Alterar" i], input[type="button"][value="Alterar" i]'),
    ], 20_000))) {
    throw new HumanInterventionRequired(
      "O botão Alterar do perfil de procurador não foi localizado.",
      "portal_changed",
    );
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);
  await proxyLabel.waitFor({ state: "hidden", timeout: 20_000 }).catch(() => undefined);
  validateActiveCorporateProxyProfile(await safeBodyText(page), normalizedCnpj);
}

export function validateActiveCorporateProxyProfile(pageText: string, cnpj: string): void {
  const normalizedText = normalizeCnpj(pageText);
  const normalizedCnpj = normalizeCnpj(cnpj);
  const hasCnpj = normalizedText.includes(normalizedCnpj);
  const hasProxyRole = /procurador/i.test(pageText);
  if (!hasCnpj || !hasProxyRole) {
    throw new HumanInterventionRequired(
      "Não foi possível confirmar o CNPJ e o papel de procurador depois da troca de perfil.",
      "profile_mismatch",
    );
  }
}

function classifyAuthenticationFailure(pageText: string, captchaPending: boolean): HumanInterventionRequired {
  if (/verifique que voc[eê] [eé] humano|sou humano/i.test(pageText) || captchaPending) {
    return new HumanInterventionRequired(
      "O login do e-CAC exige resolução humana do CAPTCHA.",
      "captcha",
    );
  }
  if (/certificado.*(?:inv[aá]lido|expirado|revogado)|erro.*certificado/i.test(pageText)) {
    return new HumanInterventionRequired(
      "O certificado digital foi rejeitado pelo Gov.br.",
      "certificate_rejected",
    );
  }
  return new HumanInterventionRequired(
    "O Gov.br solicitou autenticação adicional ou não concluiu o login.",
    "additional_authentication",
  );
}

async function clickFirstVisible(locators: Locator[], timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      const matches = await locator.count().catch(() => 0);
      for (let index = 0; index < Math.min(matches, 5); index += 1) {
        const candidate = locator.nth(index);
        if (!(await candidate.isVisible().catch(() => false))) continue;
        await candidate.click({ timeout: Math.max(1_000, deadline - Date.now()) });
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function safeBodyText(page: Page): Promise<string> {
  return page.locator("body").innerText().catch(() => "");
}

function isEcacPortal(url: string): boolean {
  return ECAC_PORTAL_PATTERN.test(url);
}

function normalizeCnpj(value: string): string {
  return value.replace(/\D/g, "");
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid-url";
  }
}

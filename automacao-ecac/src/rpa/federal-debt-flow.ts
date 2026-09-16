import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFParse } from "pdf-parse";
import type { BrowserContext, Locator, Page } from "playwright";
import { HumanInterventionRequired } from "./automation.js";

const SITUACAO_FISCAL_URL = "https://servicos.receitafederal.gov.br/servico/pendencias/";
const REGULARIZE_DEBTS_URL = "https://www.regularize.pgfn.gov.br/consultaDividas";

export interface FiscalSourceDocument {
  sourceId: "situacao_fiscal_rfb" | "divida_ativa_pgfn";
  title: string;
  path: string;
  text: string;
  pages: number;
  sha256: string;
  obtainedAt: string;
}

export async function collectFederalDebtSources(
  context: BrowserContext,
  outputDirectory: string,
): Promise<FiscalSourceDocument[]> {
  await mkdir(outputDirectory, { recursive: true });
  const situationPath = await collectSituationFiscal(context, outputDirectory);
  const pgfnPath = await collectPgfnConsolidatedDebt(context, outputDirectory);
  return Promise.all([
    describePdf("situacao_fiscal_rfb", "Relatório de Situação Fiscal da Receita Federal", situationPath),
    describePdf("divida_ativa_pgfn", "Relatório Consolidado da Dívida Ativa da PGFN", pgfnPath),
  ]);
}

async function collectSituationFiscal(
  context: BrowserContext,
  outputDirectory: string,
): Promise<string> {
  const page = await context.newPage();
  try {
    await page.goto(SITUACAO_FISCAL_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2_000);

    if (/\/login\/?/i.test(page.url())) {
      const login = await firstVisible([
        page.getByRole("button", { name: /entrar com gov\s*br/i }),
        page.getByRole("link", { name: /entrar com gov\s*br/i }),
        page.locator('input[value*="GovBR" i], input[value*="Entrar" i]'),
      ]);
      if (!login) {
        throw new HumanInterventionRequired(
          "O botão Entrar com GovBR da Situação Fiscal não foi localizado.",
          "portal_changed",
        );
      }
      await login.click({ timeout: 20_000 });
      await page.waitForURL((url) => !/\/login\/?/i.test(url.toString()), {
        timeout: 60_000,
      }).catch(() => undefined);
      await page.waitForTimeout(3_000);
    }

    if (/\/login\/?/i.test(page.url())) {
      throw new HumanInterventionRequired(
        "A Situação Fiscal solicitou confirmação humana no Gov.br.",
        hasVisibleCaptcha(page) ? "captcha" : "additional_authentication",
      );
    }

    await assertPortalContent(page, [/acesso negado/i, /sistema indispon[ií]vel/i]);
    const destination = join(outputDirectory, "Situacao Fiscal Receita Federal.pdf");
    const downloadButton = await firstVisible([
      page.getByRole("button", { name: /baixar.*relat[oó]rio|download.*relat[oó]rio/i }),
      page.getByRole("link", { name: /baixar.*relat[oó]rio|download.*relat[oó]rio/i }),
      page.getByText(/baixar.*relat[oó]rio|download.*relat[oó]rio/i).first(),
    ]);
    if (downloadButton) {
      const downloaded = await captureDownload(page, downloadButton, destination);
      if (!downloaded) await printPageToPdf(context, page, destination);
    } else {
      await printPageToPdf(context, page, destination);
    }
    await validatePdf(destination);
    return destination;
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function collectPgfnConsolidatedDebt(
  context: BrowserContext,
  outputDirectory: string,
): Promise<string> {
  const pagesBefore = new Set(context.pages());
  const ecacPage = await context.newPage();
  let page = ecacPage;
  try {
    await ecacPage.goto("https://cav.receita.fazenda.gov.br/ecac/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const debtMenu = await firstVisible([
      ecacPage.getByRole("link", { name: /d[ií]vida ativa da uni[aã]o/i }),
      ecacPage.getByText(/d[ií]vida ativa da uni[aã]o/i, { exact: true }),
    ]);
    if (!debtMenu) {
      throw new HumanInterventionRequired(
        "A opção Dívida Ativa da União não foi localizada no e-CAC.",
        "portal_changed",
      );
    }
    await debtMenu.click({ timeout: 20_000 });
    await ecacPage.waitForTimeout(1_500);
    const regularize = await firstVisible([
      ecacPage.getByRole("link", { name: /todos os servi[cç]os do regularize/i }),
      ecacPage.getByText(/todos os servi[cç]os do regularize/i, { exact: true }),
    ]);
    if (!regularize) {
      throw new HumanInterventionRequired(
        "O atalho Todos os serviços do Regularize não foi localizado.",
        "portal_changed",
      );
    }

    await regularize.click({ timeout: 20_000 });
    await ecacPage.waitForTimeout(7_000);
    page = context.pages().find((candidate) => !pagesBefore.has(candidate) && candidate !== ecacPage)
      ?? context.pages().at(-1)
      ?? ecacPage;
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);

    await page.goto(REGULARIZE_DEBTS_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(5_000);
    await assertPortalContent(page, [
      /sistema indispon[ií]vel/i,
      /n[aã]o tem permiss[aã]o de acesso/i,
      /acesso negado/i,
    ]);

    const consolidated = await firstVisible([
      page.getByRole("button", { name: /relat[oó]rio consolidado/i }),
      page.getByRole("link", { name: /relat[oó]rio consolidado/i }),
      page.getByText(/relat[oó]rio consolidado/i, { exact: true }),
    ]);
    if (!consolidated) {
      throw new HumanInterventionRequired(
        "O comando Relatório Consolidado não foi localizado no Regularize.",
        "portal_changed",
      );
    }
    await consolidated.click({ timeout: 20_000 });
    await page.waitForTimeout(5_000);

    await selectAllReportOptions(page);
    const generate = await firstVisible([
      page.getByRole("button", { name: /gerar relat[oó]rio/i }),
      page.getByRole("link", { name: /gerar relat[oó]rio/i }),
    ]);
    if (!generate) {
      throw new HumanInterventionRequired(
        "O comando Gerar Relatório não foi localizado no Regularize.",
        "portal_changed",
      );
    }
    await generate.click({ timeout: 20_000 });
    await page.waitForTimeout(7_000);
    await assertPortalContent(page, [
      /sistema indispon[ií]vel/i,
      /n[aã]o tem permiss[aã]o de acesso/i,
      /acesso negado/i,
    ], /relat[oó]rio consolidado da d[ií]vida/i);
    await expandDebtDetails(page);

    const destination = join(outputDirectory, "Relatorio Consolidado Divida Ativa PGFN.pdf");
    const downloadButton = await firstVisible([
      page.getByRole("button", { name: /download|baixar/i }),
      page.getByRole("link", { name: /download|baixar/i }),
    ]);
    const downloaded = downloadButton
      ? await captureDownload(page, downloadButton, destination)
      : false;
    if (!downloaded) await printPageToPdf(context, page, destination);
    await validatePdf(destination);
    return destination;
  } finally {
    for (const candidate of context.pages()) {
      if (candidate === ecacPage || (!pagesBefore.has(candidate) && candidate !== page)) {
        await candidate.close().catch(() => undefined);
      }
    }
    if (!pagesBefore.has(page)) await page.close().catch(() => undefined);
  }
}

async function selectAllReportOptions(page: Page): Promise<void> {
  const ids = ["natTodosCheck", "sitTodosCheck"];
  for (const id of ids) {
    await page.evaluate((checkboxId) => {
      const checkbox = document.getElementById(checkboxId) as HTMLInputElement | null;
      if (!checkbox || checkbox.checked) return;
      const label = document.querySelector(`label[for="${checkboxId}"]`) as HTMLElement | null;
      (label ?? checkbox).click();
    }, id);
    await page.waitForTimeout(500);
  }

  const checked = await page.locator('input[type="checkbox"]:checked').count();
  if (checked === 0) {
    const allLabels = page.getByText(/selecionar todas|todos|todas/i);
    for (let index = 0; index < Math.min(await allLabels.count(), 6); index += 1) {
      const item = allLabels.nth(index);
      if (await item.isVisible().catch(() => false)) await item.click().catch(() => undefined);
    }
  }
  if ((await page.locator('input[type="checkbox"]:checked').count()) === 0) {
    throw new HumanInterventionRequired(
      "Nenhuma opção do relatório consolidado foi selecionada.",
      "portal_changed",
    );
  }
}

async function expandDebtDetails(page: Page): Promise<void> {
  const candidates = page.locator([
    'button[title*="expand" i]',
    'button[title*="detalh" i]',
    'button[aria-label*="expand" i]',
    'button[aria-label*="detalh" i]',
    'button:has(.fa-plus)',
    'button:has(.pi-plus)',
  ].join(","));
  const count = Math.min(await candidates.count(), 300);
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: 5_000 }).catch(() => undefined);
    }
  }
  if (count > 0) await page.waitForTimeout(2_000);
}

async function captureDownload(page: Page, button: Locator, destination: string): Promise<boolean> {
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await button.click({ timeout: 20_000 });
    const download = await downloadPromise;
    await download.saveAs(destination);
    return true;
  } catch {
    return false;
  }
}

async function printPageToPdf(
  context: BrowserContext,
  page: Page,
  destination: string,
): Promise<void> {
  const cdp = await context.newCDPSession(page);
  try {
    const result = await cdp.send("Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: false,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.4,
      marginBottom: 0.4,
      marginLeft: 0.4,
      marginRight: 0.4,
    });
    await writeFile(destination, Buffer.from(result.data, "base64"));
  } finally {
    await cdp.detach();
  }
}

export async function describePdf(
  sourceId: FiscalSourceDocument["sourceId"],
  title: string,
  path: string,
): Promise<FiscalSourceDocument> {
  const contents = await readFile(path);
  const parser = new PDFParse({ data: new Uint8Array(contents) });
  try {
    const parsed = await parser.getText();
    const text = parsed.text?.trim() ?? "";
    if (text.length < 100) throw new Error(`${title} não contém texto suficiente para análise`);
    return {
      sourceId,
      title,
      path,
      text,
      pages: parsed.total ?? parsed.pages?.length ?? 0,
      sha256: createHash("sha256").update(contents).digest("hex"),
      obtainedAt: new Date().toISOString(),
    };
  } finally {
    await parser.destroy();
  }
}

async function validatePdf(path: string): Promise<void> {
  const details = await stat(path);
  if (details.size < 3 * 1024) throw new Error("O PDF coletado está vazio ou incompleto");
  const signature = (await readFile(path)).subarray(0, 5).toString("ascii");
  if (signature !== "%PDF-") throw new Error("O arquivo coletado não é um PDF válido");
}

async function assertPortalContent(
  page: Page,
  forbidden: RegExp[],
  required?: RegExp,
): Promise<void> {
  const text = await page.locator("body").innerText().catch(() => "");
  const failure = forbidden.find((pattern) => pattern.test(text));
  if (failure) throw new Error(`Portal retornou uma tela inválida: ${failure.source}`);
  if (required && !required.test(text)) {
    throw new HumanInterventionRequired(
      "A página carregada não contém o relatório esperado.",
      "portal_changed",
    );
  }
}

async function firstVisible(locators: Locator[]): Promise<Locator | undefined> {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < Math.min(count, 8); index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
  }
  return undefined;
}

function hasVisibleCaptcha(page: Page): boolean {
  return page.frames().some((frame) => /hcaptcha|recaptcha/i.test(frame.url()));
}

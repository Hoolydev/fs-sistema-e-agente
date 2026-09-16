import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RpaRequest, RpaResult } from "../domain/types.js";
import type { FiscalAnalysis, FiscalAnalysisGateway } from "../llm/openai-analysis.js";
import { generateFiscalReport, type FiscalReportInput } from "../report/fiscal-report.js";
import type { EcacAutomation } from "../rpa/automation.js";
import { describePdf, type FiscalSourceDocument } from "../rpa/federal-debt-flow.js";
import { SerproError } from "./client.js";

export const SITFIS_SCOPE = "Análise parcial: somente Situação Fiscal da Receita Federal via Integra Contador/SITFIS. O relatório consolidado detalhado da PGFN não foi obtido; não é possível concluir ausência de dívida ativa.";
export const SITFIS_PERIOD = "A Situação Fiscal retrata a data de emissão. O período mencionado no pedido não seleciona uma posição histórica nesta consulta.";

export function assertPdfTaxpayer(text: string, cnpj: string): void {
  const firstCnpj = text.match(/CNPJ\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i)?.[1]?.replace(/\D/g, "");
  if (firstCnpj !== cnpj) throw new SerproError("pdf_taxpayer_mismatch", "O CNPJ do relatório não pôde ser confirmado. O documento não será enviado nem analisado.");
}

export function withSitfisScope(analysis: FiscalAnalysis): FiscalAnalysis {
  return {
    ...analysis,
    executiveSummary: `${SITFIS_SCOPE}\n\n${analysis.executiveSummary}`,
    gaps: [...new Set(["Pendente: relatório consolidado detalhado da PGFN/Regularize.", ...analysis.gaps])],
    caveats: [...new Set([SITFIS_SCOPE, SITFIS_PERIOD, ...analysis.caveats])],
  };
}

export class SerproFiscalAutomation implements EcacAutomation {
  constructor(
    private readonly client: { obtainSituationPdf(cnpj: string): Promise<Buffer> },
    private readonly analysis: FiscalAnalysisGateway,
    private readonly render: (input: FiscalReportInput) => Promise<void> = generateFiscalReport,
    private readonly describe: typeof describePdf = describePdf,
  ) {}

  async obtainDocument(request: RpaRequest): Promise<RpaResult> {
    if (request.documentType !== "situacao_fiscal" && request.documentType !== "diagnostico_fiscal") {
      throw new SerproError("unsupported_document", "Esta integração atende Situação Fiscal e análise parcial da Receita Federal. O documento solicitado ainda não está integrado.");
    }
    const directory = await mkdtemp(join(tmpdir(), "fs-serpro-"));
    const output = join(tmpdir(), `FS-${request.cnpj}-${randomUUID()}.pdf`);
    try {
      const pdf = await this.client.obtainSituationPdf(request.cnpj);
      const sourcePath = join(directory, "situacao-fiscal.pdf");
      await writeFile(sourcePath, pdf, { mode: 0o600 });
      let source: FiscalSourceDocument;
      try { source = await this.describe("situacao_fiscal_rfb", "Situação Fiscal RFB — Integra Contador/SITFIS", sourcePath); }
      catch { throw new SerproError("pdf_unreadable", "O PDF recebido não pôde ser lido e precisa de revisão da equipe."); }
      assertPdfTaxpayer(source.text, request.cnpj);
      if (request.documentType === "situacao_fiscal") {
        await writeFile(output, pdf, { mode: 0o600 });
      } else {
        const companyName = source.text.match(/(?:Raz[aã]o Social|Nome Empresarial)\s*:?\s*([^\n]{3,160})/i)?.[1]?.trim()
          ?? `Empresa ${request.cnpj}`;
        const analysis = await this.analysis.analyze({
          cnpj: request.cnpj, companyName,
          structuredData: {
            provider: "serpro", scope: SITFIS_SCOPE, periodLimitation: SITFIS_PERIOD,
            pgfnConsolidatedReportObtained: false,
            documents: [{ sourceId: source.sourceId, title: source.title, pages: source.pages,
              sha256: source.sha256, obtainedAt: source.obtainedAt }],
          },
          dossierFragments: [{ sourceId: source.sourceId, title: source.title, text: source.text }],
        });
        await this.render({ cnpj: request.cnpj, companyName, analysis: withSitfisScope(analysis),
          sources: [source], destination: output, scopeNotice: SITFIS_SCOPE });
      }
      const contents = await readFile(output);
      return {
        localPath: output,
        filename: request.documentType === "situacao_fiscal"
          ? `Situacao Fiscal RFB ${request.cnpj}.pdf` : `Analise Parcial RFB ${request.cnpj}.pdf`,
        mimeType: "application/pdf", sha256: createHash("sha256").update(contents).digest("hex"),
        obtainedAt: new Date().toISOString(),
        deliveryNote: request.documentType === "situacao_fiscal" ? SITFIS_PERIOD : SITFIS_SCOPE,
      };
    } catch (error) {
      await rm(output, { force: true });
      throw error;
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}

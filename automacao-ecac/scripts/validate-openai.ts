import { existsSync } from "node:fs";
import process from "node:process";
import { loadConfig } from "../src/config.js";
import { OpenAIFiscalAnalysisGateway } from "../src/llm/openai-analysis.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const config = loadConfig();
const gateway = new OpenAIFiscalAnalysisGateway(config);
const analysis = await gateway.analyze({
  cnpj: "00000000000000",
  companyName: "Empresa de Homologação",
  structuredData: {
    sourceMode: "synthetic_validation",
    pendingItems: 0,
  },
  dossierFragments: [
    {
      sourceId: "synthetic-001",
      title: "Fonte sintética de homologação",
      text: "Não foram fornecidos documentos fiscais reais. Este teste valida apenas conectividade e schema.",
    },
  ],
});

console.log(
  JSON.stringify({
    validated: true,
    model: config.LLM_MODEL,
    cnpjMatches: analysis.cnpj === "00000000000000",
    findingCount: analysis.findings.length,
    gapCount: analysis.gaps.length,
  }),
);

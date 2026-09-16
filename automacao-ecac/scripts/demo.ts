import { rm } from "node:fs/promises";
import { parseRequest } from "../src/orchestrator/parser.js";
import { MockEcacAutomation } from "../src/rpa/mock-automation.js";

const text = process.argv.slice(2).join(" ") ||
  "Preciso da situação fiscal do CNPJ 47.733.961/0001-79 referente a 08/2026";
const parsed = parseRequest(text);

if (!parsed.cnpj || !parsed.period || !parsed.documentType) {
  throw new Error(`Solicitação incompleta: ${JSON.stringify(parsed)}`);
}

const automation = new MockEcacAutomation();
const result = await automation.obtainDocument({
  requestId: crypto.randomUUID(),
  sourceMessageId: "demo",
  requesterPhone: "5562000000000",
  cnpj: parsed.cnpj,
  period: parsed.period,
  documentType: parsed.documentType,
});

process.stdout.write(
  `${JSON.stringify({ parsed, file: result.localPath, sha256: result.sha256 }, null, 2)}\n`,
);
await rm(result.localPath, { force: true });

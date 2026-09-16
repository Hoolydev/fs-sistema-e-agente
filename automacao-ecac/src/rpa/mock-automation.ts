import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RpaRequest, RpaResult } from "../domain/types.js";
import type { EcacAutomation } from "./automation.js";

export class MockEcacAutomation implements EcacAutomation {
  async obtainDocument(request: RpaRequest): Promise<RpaResult> {
    const directory = await mkdtemp(join(tmpdir(), "fs-ecac-mock-"));
    await mkdir(directory, { recursive: true });
    const filename = `${request.cnpj}_${request.documentType}_${request.period}.pdf`;
    const localPath = join(directory, filename);
    const content = createSimplePdf([
      "DOCUMENTO DE TESTE - SEM VALIDADE FISCAL",
      `Protocolo: ${request.requestId}`,
      `CNPJ: ${request.cnpj}`,
      `Documento: ${request.documentType}`,
      `Competencia: ${request.period}`,
      "Este arquivo valida o fluxo local sem acessar o e-CAC.",
    ]);
    await writeFile(localPath, content, { mode: 0o600 });
    return {
      localPath,
      filename,
      mimeType: "application/pdf",
      sha256: createHash("sha256").update(content).digest("hex"),
      obtainedAt: new Date().toISOString(),
    };
  }
}

function createSimplePdf(lines: string[]): Buffer {
  const escaped = lines.map((line) => line.replace(/[\\()]/g, "\\$&"));
  const commands = ["BT", "/F1 12 Tf", "72 760 Td"];
  escaped.forEach((line, index) => {
    if (index > 0) commands.push("0 -22 Td");
    commands.push(`(${line}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

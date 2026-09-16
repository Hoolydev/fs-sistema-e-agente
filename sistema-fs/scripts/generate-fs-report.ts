import { readFileSync, mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { validateReport } from '../lib/diagnostico/model';
import { generateDiagnosticPdf } from '../lib/diagnostico/pdf';
import { demoReport } from '../lib/diagnostico/demo';

function main() {
  const args = process.argv.slice(2);
  let input: string | undefined, output: string | undefined, demo = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--demo') demo = true;
    else if (args[i] === '--input' && args[i + 1] && !args[i + 1].startsWith('--')) input = args[++i];
    else if (args[i] === '--output' && args[i + 1] && !args[i + 1].startsWith('--')) output = args[++i];
    else throw new Error('Uso: --input relatorio.json --output parecer.pdf OU --demo --output exemplo.pdf');
  }
  if (!output || (demo ? !!input : !input)) throw new Error('Escolha uma entrada JSON real ou --demo e informe --output.');
  const destination = resolve(output), receiptPath = destination + '.fs.json';
  if (extname(destination).toLowerCase() !== '.pdf') throw new Error('A saída deve ter extensão .pdf.');
  if (existsSync(destination) || existsSync(receiptPath)) throw new Error('A saída já existe. Use nova versão/nome; nenhuma emissão será sobrescrita.');
  const raw = demo ? JSON.stringify(demoReport) : readFileSync(resolve(input!), 'utf8');
  const report = validateReport(JSON.parse(raw));
  if (!demo && report.mode !== 'real') throw new Error('Para exemplo use --demo; entrada de consulta deve ser real e fundamentada.');
  if (!report.opinion) throw new Error('Preencha opinion para manter o parecer completo FS.');
  for (const id of ['rfb', 'pgfn']) if (!report.sources.some(s => s.id === id)) throw new Error('Informe fontes rfb e pgfn, inclusive quando pendentes.');
  if (!demo && !report.sources.some(s => ['rfb', 'pgfn'].includes(s.id) && s.status === 'coletado')) throw new Error('Nenhuma fonte fiscal coletada; não emitir consulta real sem evidências.');
  for (const debt of report.debts) if (debt.sourceId !== debt.origin.toLowerCase()) throw new Error('Origem da dívida diverge do identificador da fonte fiscal.');
  if (report.sources.some(s => s.status === 'pendente') && !report.pending.length) throw new Error('Registre as fontes pendentes no parecer.');
  const templateFiles = ['lib/diagnostico/model.ts', 'lib/diagnostico/opinion-schema.ts', 'lib/diagnostico/opinion.ts', 'lib/diagnostico/pdf.ts', 'public/brand/fs-horizontal.png'];
  const fingerprint = createHash('sha256');
  for (const file of templateFiles) fingerprint.update(file).update('\0').update(readFileSync(resolve(file)));
  const pdf = Buffer.from(generateDiagnosticPdf(report, readFileSync(resolve('public/brand/fs-horizontal.png'))));
  const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
  const receipt = { template: 'FS-parecer-sistema', templateSha256: fingerprint.digest('hex'), reportId: report.id, version: report.version, mode: report.mode, inputSha256: hash(raw), pdfSha256: hash(pdf), generatedAt: new Date().toISOString() };
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  writeFileSync(destination, pdf, { mode: 0o600, flag: 'wx' });
  try { writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); }
  catch (error) { unlinkSync(destination); throw error; }
  console.log(`PDF FS gerado: ${destination}\nRecibo: ${receiptPath}\nModo: ${report.mode}. Conferir fontes e apresentação antes de entregar.`);
}
try { main(); } catch (error) {
  // Não imprimir o JSON ou os documentos fiscais nos logs.
  const issues = (error as { issues?: Array<{ path: (string | number)[] }> }).issues;
  console.error(issues ? `JSON inválido. Confira campos: ${issues.map(i => i.path.join('.')).join(', ')}` : error instanceof Error ? error.message : 'Falha na geração FS.');
  process.exitCode = 1;
}

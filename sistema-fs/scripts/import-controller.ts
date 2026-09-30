import { execFileSync } from 'node:child_process';
import { processSchema, type ProcessInput } from '../lib/controller/model';

// Importa a planilha "CONTROLLER - ETAPA DE GESTÃO DE PROCESSOS" (.xlsx) para fs_controller_processes.
// Uso: npx tsx --env-file=<arquivo .env> scripts/import-controller.ts <planilha.xlsx> [--gravar]
// Sem --gravar apenas valida e mostra o resumo. Registros com nº de processo já existente são ignorados (idempotente).
const entry = (file: string, name: string) => execFileSync('unzip', ['-p', file, name], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');
const texts = (xml: string) => decode([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''));
export function readSheet(file: string) {
  const shared = [...entry(file, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
  const rows: Record<string, string>[] = [];
  for (const row of entry(file, 'xl/worksheets/sheet1.xml').matchAll(/<row [^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: Record<string, string> = {};
    for (const cell of (row[1] ?? '').matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const column = /r="([A-Z]+)\d+"/.exec(cell[1])?.[1], type = /t="(\w+)"/.exec(cell[1])?.[1], inner = cell[2] ?? '', raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const value = type === 's' && raw !== undefined ? shared[Number(raw)] : type === 'inlineStr' ? texts(inner) : raw !== undefined ? decode(raw) : '';
      if (column && value.trim()) cells[column] = value.trim();
    }
    rows.push(cells);
  }
  return rows;
}
// Datas do Excel são números de série (dias desde 30/12/1899).
const day = (serial: string | undefined) => serial && Number.isFinite(Number(serial)) ? new Date(Date.UTC(1899, 11, 30) + Math.round(Number(serial)) * 86400000).toISOString().slice(0, 10) : null;
const cnpj = (value: string | undefined) => { const v = value ?? ''; return /^[\d.]+(E\d+)?$/i.test(v) ? Math.round(Number(v)).toString().padStart(14, '0') : v; };
export function parseSheet(rows: Record<string, string>[]) {
  const header = rows.findIndex(r => r.A?.toUpperCase() === 'EMPRESA' && r.B?.toUpperCase() === 'CNPJ');
  if (header < 0) throw new Error('Cabeçalho EMPRESA | CNPJ não encontrado na planilha.');
  const valid: ProcessInput[] = [], invalid: string[] = [];
  rows.slice(header + 1).forEach((r, i) => {
    if (!r.A) return;
    const parsed = processSchema.safeParse({ company: r.A, cnpj: cnpj(r.B), object: r.C ?? '', admStatus: r.D ?? '', protocolDate: day(r.E), deadline: day(r.F), processNumber: r.G ?? '', updatedOn: day(r.H), dispatchStatus: r.I ?? '', notes: r.J ?? '' });
    if (parsed.success) valid.push(parsed.data); else invalid.push(`linha ${header + i + 2} (${r.A}): ${parsed.error.issues.map(issue => issue.path[0]).join(', ')}`);
  });
  return { valid, invalid };
}
async function main() {
  const file = process.argv[2], write = process.argv.includes('--gravar');
  if (!file) throw new Error('Informe o caminho da planilha .xlsx.');
  const { valid, invalid } = parseSheet(readSheet(file));
  console.log(`${valid.length} registros válidos; ${invalid.length} com problema.`);
  invalid.forEach(line => console.log('  não importado —', line));
  if (!write) { console.log('Simulação: nada foi gravado. Repita com --gravar para importar.'); return; }
  if (invalid.length) throw new Error('Corrija as linhas com problema antes de gravar.');
  const { createProcess } = await import('../lib/controller/store');
  // Importação da planilha oficial da equipe entra como revisada; o autor fica identificado no histórico.
  const actor = { id: 'importacao-planilha', name: 'Importação da planilha', role: 'admin' as const };
  let created = 0, skipped = 0;
  for (const input of valid) {
    try { await createProcess(input, actor, 'Importado da planilha CONTROLLER - ETAPA DE GESTÃO DE PROCESSOS'); created++; }
    catch (error) { if (error instanceof Error && error.message === 'DUPLICATE_PROCESS') skipped++; else throw error; }
  }
  console.log(`${created} registros importados; ${skipped} já existiam e foram mantidos.`);
}
if (process.argv[1]?.endsWith('import-controller.ts')) main().then(() => process.exit(0)).catch(e => { console.error('Importação não concluída:', e instanceof Error ? e.message : 'erro'); process.exit(1); });

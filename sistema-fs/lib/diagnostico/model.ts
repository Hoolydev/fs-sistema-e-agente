import { z } from "zod";
import { opinionSchema } from "./opinion-schema";

export const money = (cents: number | null) => cents === null ? "Não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export const formatCnpj = (value: string) => value.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
export function normalizeCnpj(value: string) { return value.toUpperCase().replace(/[.\/\-\s]/g, ""); }
// Supports the Receita Federal numeric and alphanumeric layouts.
export function isValidCnpj(value: string): boolean {
  const s = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(s) || /^(.)\1+$/.test(s)) return false;
  const digit = (base: string) => {
    let weight = base.length - 7;
    const sum = [...base].reduce((total, char) => { const v = total + (char.charCodeAt(0) - 48) * weight; weight = weight === 2 ? 9 : weight - 1; return v; }, 0);
    const rest = sum % 11; return rest < 2 ? 0 : 11 - rest;
  };
  return digit(s.slice(0, 12)) === Number(s[12]) && digit(s.slice(0, 13)) === Number(s[13]);
}
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1).max(12000);
const sourceSchema = z.object({ id: text, title: text, provider: text, collectedAt: z.string().datetime(), status: z.enum(["demonstrativo", "coletado", "pendente"]), note: text });
const debtSchema = z.object({ id: text, origin: z.enum(["PGFN", "RFB"]), tax: text, period: text, status: text, administrativeProcess: text.nullable(), judicialProcess: text.nullable(), registeredAt: text.nullable(), principal: amount.nullable(), fine: amount.nullable(), interest: amount.nullable(), charges: amount.nullable(), total: amount, sourceId: text });
export const reportSchema = z.object({
  id: text, version: z.number().int().positive(), mode: z.enum(["demo", "real"]), company: z.object({ name: text, cnpj: z.string().refine(isValidCnpj), regime: text }), generatedAt: z.string().datetime(),
  scope: text, summary: text, debts: z.array(debtSchema), sources: z.array(sourceSchema),
  capag: z.object({ rating: text.nullable(), amount: amount.nullable(), note: text }),
  sections: z.array(z.object({ id: text, title: text, content: text })),
  opinion: opinionSchema.optional(),
  supplements: z.array(z.object({ title: text, note: text, headers: z.array(text).min(1).max(8), rows: z.array(z.array(text)) })).optional(),
  pending: z.array(text), recommendations: z.array(text), conclusion: text,
});
export type DiagnosticReport = z.infer<typeof reportSchema>;
export type Debt = DiagnosticReport["debts"][number];
export function summarize(report: DiagnosticReport) {
  const totalFor = (origin: "RFB" | "PGFN") => {
    if (!report.sources.some(s => s.id === origin.toLowerCase() && s.status !== "pendente")) return null;
    return report.debts.filter(d => d.origin === origin).reduce((a, d) => a + d.total, 0);
  };
  const rfb = totalFor("RFB"), pgfn = totalFor("PGFN");
  return { rfb, pgfn, total: rfb === null || pgfn === null ? null : rfb + pgfn, count: report.debts.filter(d => d.origin === "PGFN").length };
}
export function validateReport(value: unknown): DiagnosticReport {
  const report = reportSchema.parse(value);
  const sourceIds = new Set(report.sources.map(s => s.id));
  if (sourceIds.size !== report.sources.length) throw new Error("Identificador de fonte duplicado.");
  if (report.mode === "real" && report.sources.some(s => s.status === "demonstrativo")) throw new Error("Relatório real não pode conter fonte demonstrativa.");
  if (report.mode === "real" && report.opinion?.scenario?.status === "illustrative") throw new Error("Relatório real não pode conter cenário ilustrativo.");
  const debtIds = new Set<string>();
  for (const debt of report.debts) {
    if (debtIds.has(debt.id)) throw new Error("Identificador de dívida duplicado.");
    debtIds.add(debt.id);
    if (!sourceIds.has(debt.sourceId)) throw new Error("Dívida sem fonte identificada.");
    if (report.sources.find(s => s.id === debt.sourceId)?.status === "pendente") throw new Error("Dívida vinculada a uma fonte ainda pendente.");
    const parts = [debt.principal, debt.fine, debt.interest, debt.charges];
    if (parts.every(n => n !== null) && parts.reduce<number>((s, n) => s + (n ?? 0), 0) !== debt.total) throw new Error("Composição divergente do valor total.");
  }
  for (const supplement of report.supplements ?? []) {
    if (supplement.rows.some(row => row.length !== supplement.headers.length)) throw new Error("Tabela complementar inconsistente.");
  }
  const sum = report.debts.reduce((total, debt) => total + debt.total, 0);
  if (!Number.isSafeInteger(sum)) throw new Error("Soma dos débitos excede a precisão suportada.");
  return report;
}

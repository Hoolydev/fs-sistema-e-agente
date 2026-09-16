import { test } from "node:test";
import assert from "node:assert/strict";
import { demoReport } from "../lib/diagnostico/demo";
import { isValidCnpj, summarize, validateReport } from "../lib/diagnostico/model";

test("totais em centavos conferem com as 12 dívidas", () => {
  assert.deepEqual(summarize(demoReport), { pgfn: 28640000, rfb: 5328000, total: 33968000, count: 9 });
  assert.equal(demoReport.debts.length, 12);
});
test("fonte não coletada não significa ausência de débitos", () => {
  const report = structuredClone(demoReport);
  report.sources.find(s => s.id === "rfb")!.status = "pendente";
  report.debts = report.debts.filter(d => d.origin !== "RFB");
  assert.equal(summarize(validateReport(report)).rfb, null);
  assert.equal(summarize(report).total, null);
});
test("CNPJ valida dígitos e aceita pontuação", () => {
  assert.ok(isValidCnpj("47.733.961/0001-79"));
  assert.ok(isValidCnpj("12.ABC.345/01DE-35"));
  assert.equal(isValidCnpj("47733961000170"), false);
  assert.equal(isValidCnpj("00000000000000"), false);
});
test("composição divergente e dívida duplicada impedem relatório", () => {
  const report = structuredClone(demoReport);
  report.debts[0].principal! += 1;
  assert.throws(() => validateReport(report), /Composição divergente/);
  const duplicate = structuredClone(demoReport);
  duplicate.debts.push(duplicate.debts[0]);
  assert.throws(() => validateReport(duplicate), /duplicado/);
});
test("dados sem evidência ou demonstrativos não passam por reais", () => {
  const report = structuredClone(demoReport);
  report.mode = "real";
  assert.throws(() => validateReport(report), /demonstrativa/);
  report.mode = "demo";
  report.sources[0].status = "pendente";
  assert.throws(() => validateReport(report), /pendente/);
  report.debts[0].sourceId = "inexistente";
  assert.throws(() => validateReport(report), /sem fonte/);
});

import { buildOpinion, installments, opinionMetrics } from "../lib/diagnostico/opinion";
test("template conserva as 17 seções e os indicadores do parecer", () => {
  const data = buildOpinion(demoReport);
  const headings = data.pages.flatMap(page => page.blocks.filter(b => b.type === "heading").map(b => b.text));
  for (let i = 1; i <= 17; i++) assert.ok(headings.some(h => h.startsWith(`${i}. `)), `Seção ${i}`);
  assert.equal(data.metrics.discount, 8592000);
  assert.equal(data.metrics.final, 20048000);
  assert.equal(data.metrics.savingPercent, 30);
});
test("parcelas conciliam centavos e entrada não é adicionada ao saldo novamente", () => {
  const m = opinionMetrics(demoReport);
  for (const plan of [m.entry!, m.balance!, m.conventional!, installments(101, 12)]) assert.equal(plan.regular * (plan.count - 1) + plan.last, plan.total);
  assert.equal(m.entry!.total + m.balance!.total, m.final);
  assert.equal(m.entry!.total, 1718400);
  assert.equal(m.balance!.last, 137888);
});
test("teto é aplicado por inscrição e nunca reduz principal", () => {
  const report = structuredClone(demoReport);
  report.opinion!.scenario!.totalDiscountCapBps = 2000;
  const m = opinionMetrics(report);
  assert.equal(m.discount, 5728000);
  for (const row of m.simulation) assert.ok(row.final! >= row.debt.principal!);
});
test("componente ou parâmetro ausente impede simulação consolidada", () => {
  const report = structuredClone(demoReport);
  report.debts[0].fine = null;
  const missing = opinionMetrics(validateReport(report));
  assert.equal(missing.discount, null); assert.equal(missing.final, null); assert.equal(missing.entry, null);
  delete report.opinion;
  assert.equal(opinionMetrics(report).discount, null);
});
test("cenário fictício não pode ser emitido como real", () => {
  const report = structuredClone(demoReport); report.mode = "real";
  report.sources.forEach(s => s.status = "coletado");
  assert.throws(() => validateReport(report), /ilustrativo/);
});

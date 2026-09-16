import { describe, expect, it } from "vitest";
import { isValidCnpj, parseRequest } from "../src/orchestrator/parser.js";

describe("parseRequest", () => {
  it("extracts document, formatted CNPJ and month/year", () => {
    expect(
      parseRequest(
        "Preciso da situação fiscal do CNPJ 47.733.961/0001-79 referente a 08/2026",
      ),
    ).toEqual({
      cnpj: "47733961000179",
      period: "2026-08",
      documentType: "situacao_fiscal",
    });
  });

  it("recognizes DCTFWeb with compact CNPJ", () => {
    expect(parseRequest("DCTFWeb 68725889000108 2026-07")).toEqual({
      cnpj: "68725889000108",
      period: "2026-07",
      documentType: "dctfweb",
    });
  });

  it("recognizes a full fiscal analysis without requiring a period", () => {
    const parsed = parseRequest("Entre no e-CAC e faça uma análise da empresa 51.646.813/0001-94");
    expect(parsed).toMatchObject({
      cnpj: "51646813000194",
      documentType: "diagnostico_fiscal",
    });
    expect(parsed.period).toMatch(/^20\d{2}-(0[1-9]|1[0-2])$/);
  });

  it("does not accept an invalid CNPJ", () => {
    expect(parseRequest("situação fiscal 11.111.111/1111-11 08/2026")).toEqual({
      period: "2026-08",
      documentType: "situacao_fiscal",
    });
  });
});

describe("isValidCnpj", () => {
  it.each(["47733961000179", "68725889000108"])("accepts %s", (cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(true);
  });
});

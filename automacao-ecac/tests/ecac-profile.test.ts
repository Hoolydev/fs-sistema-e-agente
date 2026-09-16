import { describe, expect, it } from "vitest";
import { validateActiveCorporateProxyProfile } from "../src/rpa/ecac-playwright.js";
import { HumanInterventionRequired } from "../src/rpa/automation.js";

describe("e-CAC corporate proxy profile validation", () => {
  it("accepts the requested CNPJ in a corporate proxy profile", () => {
    expect(() =>
      validateActiveCorporateProxyProfile(
        "Perfil ativo: Procurador de Pessoa Jurídica — CNPJ 47.733.961/0001-79",
        "47733961000179",
      ),
    ).not.toThrow();
  });

  it("blocks collection when the active CNPJ is different", () => {
    expect(() =>
      validateActiveCorporateProxyProfile(
        "Perfil ativo: Procurador de Pessoa Jurídica — CNPJ 00.000.000/0001-00",
        "47733961000179",
      ),
    ).toThrowError(HumanInterventionRequired);
  });

  it("blocks collection when the role is not procurador", () => {
    expect(() =>
      validateActiveCorporateProxyProfile(
        "Perfil ativo: Responsável Legal — CNPJ 47.733.961/0001-79",
        "47733961000179",
      ),
    ).toThrowError(/papel de procurador/);
  });
});

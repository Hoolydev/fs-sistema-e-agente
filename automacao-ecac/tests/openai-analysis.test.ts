import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { OpenAIFiscalAnalysisGateway } from "../src/llm/openai-analysis.js";

const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("OpenAIFiscalAnalysisGateway", () => {
  it("requests a non-persisted structured analysis and validates the result", async () => {
    const config = await createConfig();
    const output = {
      schemaVersion: "1.0",
      cnpj: "47733961000179",
      executiveSummary: "Não há dados suficientes para concluir o diagnóstico.",
      riskLevel: "medium",
      findings: [],
      recommendations: ["Coletar o relatório de situação fiscal."],
      gaps: ["Relatório de situação fiscal ausente."],
      caveats: ["Minuta baseada somente em dados de teste."],
    };
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          id: "resp-test",
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: JSON.stringify(output) }],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const gateway = new OpenAIFiscalAnalysisGateway(config);
    await expect(gateway.analyze(sampleInput())).resolves.toEqual(output);

    const [, request] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(request?.body));
    expect(body.store).toBe(false);
    expect(body.model).toBe("gpt-5.5");
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect((request?.headers as Record<string, string>).authorization).toBe("Bearer test-api-key");
  });

  it("rejects a response for a different CNPJ", async () => {
    const config = await createConfig();
    const output = {
      schemaVersion: "1.0",
      cnpj: "00000000000000",
      executiveSummary: "Teste",
      riskLevel: "low",
      findings: [],
      recommendations: [],
      gaps: [],
      caveats: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ status: "completed", output_text: JSON.stringify(output) }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const gateway = new OpenAIFiscalAnalysisGateway(config);
    await expect(gateway.analyze(sampleInput())).rejects.toThrow("CNPJ diferente");
  });
});

async function createConfig() {
  const directory = await mkdtemp(join(tmpdir(), "openai-analysis-"));
  directories.push(directory);
  const keyPath = join(directory, "api-key");
  await writeFile(keyPath, "test-api-key\n");
  return loadConfig({
    NODE_ENV: "test",
    LLM_PROVIDER: "openai",
    LLM_MODEL: "gpt-5.5",
    LLM_API_KEY_FILE: keyPath,
    DATABASE_URL: "postgres://ecac:ecac@localhost:5432/ecac",
    REDIS_URL: "redis://localhost:6379",
    ECAC_LOGIN_URL: "https://example.gov.br/login",
  });
}

function sampleInput() {
  return {
    cnpj: "47733961000179",
    companyName: "FS Soluções Tributárias",
    structuredData: { pendingItems: 0 },
    dossierFragments: [
      {
        sourceId: "source-1",
        title: "Fonte de teste",
        text: "Conteúdo sintético.",
      },
    ],
  };
}

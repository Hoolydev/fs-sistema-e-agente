import type { DocumentType, ParsedRequest } from "../domain/types.js";

const aliases: Array<{ type: DocumentType; patterns: RegExp[] }> = [
  {
    type: "diagnostico_fiscal",
    patterns: [
      /an[aá]lise\s+(?:fiscal\s+)?da\s+empresa/i,
      /diagn[oó]stico\s+fiscal/i,
      /levantamento\s+de\s+d[eé]bitos/i,
      /receita\s+federal\s+e\s+pgfn/i,
    ],
  },
  {
    type: "situacao_fiscal",
    patterns: [/situa[cç][aã]o fiscal/i, /relat[oó]rio fiscal/i, /pend[eê]ncias fiscais/i],
  },
  {
    type: "dctfweb",
    patterns: [/dctf[- ]?web/i, /declara[cç][aã]o dctf/i],
  },
  {
    type: "caixa_postal",
    patterns: [/caixa postal/i, /mensagens? do e-?cac/i, /intima[cç][aã]o/i],
  },
];

export function parseRequest(text: string): ParsedRequest {
  const compact = text.normalize("NFKC");
  const parsed: ParsedRequest = {
    ...extractCnpj(compact),
    ...extractPeriod(compact),
    ...extractDocumentType(compact),
  };
  if (parsed.documentType === "diagnostico_fiscal" && !parsed.period) {
    parsed.period = currentPeriod();
  }
  return parsed;
}

function currentPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function extractCnpj(text: string): Pick<ParsedRequest, "cnpj"> {
  const match = text.match(/\b(?:\d[./\s-]?){12}\d{2}\b/);
  if (!match) return {};
  const digits = match[0].replace(/\D/g, "");
  return isValidCnpj(digits) ? { cnpj: digits } : {};
}

function extractPeriod(text: string): Pick<ParsedRequest, "period"> {
  const monthYear = text.match(/\b(0?[1-9]|1[0-2])[/-](20\d{2})\b/);
  if (monthYear?.[1] && monthYear[2]) {
    return { period: `${monthYear[2]}-${monthYear[1].padStart(2, "0")}` };
  }
  const yearMonth = text.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])\b/);
  if (yearMonth?.[1] && yearMonth[2]) {
    return { period: `${yearMonth[1]}-${yearMonth[2]}` };
  }
  return {};
}

function extractDocumentType(text: string): Pick<ParsedRequest, "documentType"> {
  for (const item of aliases) {
    if (item.patterns.some((pattern) => pattern.test(text))) {
      return { documentType: item.type };
    }
  }
  return {};
}

export function isValidCnpj(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digits = cnpj.split("").map(Number);
  const calculate = (length: number): number => {
    let factor = length - 7;
    let total = 0;
    for (let index = 0; index < length; index += 1) {
      total += (digits[index] ?? 0) * factor--;
      if (factor < 2) factor = 9;
    }
    const result = total % 11;
    return result < 2 ? 0 : 11 - result;
  };
  return calculate(12) === digits[12] && calculate(13) === digits[13];
}

export function describeMissingFields(parsed: ParsedRequest): string[] {
  const missing: string[] = [];
  if (!parsed.documentType) missing.push("tipo do documento");
  if (!parsed.cnpj) missing.push("CNPJ válido");
  if (!parsed.period) missing.push("competência no formato MM/AAAA");
  return missing;
}

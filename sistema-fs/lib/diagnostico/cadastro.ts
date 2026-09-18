import { normalizeCnpj } from './model';

// Situação cadastral a partir dos dados abertos do CNPJ (base pública da RFB, servida pela BrasilAPI).
// Não é fonte fiscal: serve para identificar a empresa e o porte, nunca para afirmar débitos.
export type Cadastro = { name: string; status: string; statusDate: string | null; size: string; simples: boolean | null; mei: boolean | null; city: string; state: string; activity: string; opened: string | null; legalNature: string; provider: string; collectedAt: string };

const DEFAULT_PROVIDERS = 'https://brasilapi.com.br/api/cnpj/v1,https://minhareceita.org';
// Bases públicas com o mesmo formato (dados abertos RFB). A BrasilAPI recusa o User-Agent padrão do Node (403/429).
export async function consultCadastro(cnpjInput: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<Cadastro | null> {
  const cnpj = normalizeCnpj(cnpjInput);
  if (!/^\d{14}$/.test(cnpj)) return null;
  const providers = (env.FS_CADASTRO_PROVIDER_URL || DEFAULT_PROVIDERS).split(',').map(v => v.trim().replace(/\/+$/, '')).filter(Boolean);
  for (const base of providers) {
    try {
      const response = await fetchImpl(`${base}/${cnpj}`, { headers: { accept: 'application/json', 'user-agent': 'FS-Sistema/1.0 (+https://app.fssolucoestributarias.com.br)' }, signal: AbortSignal.timeout(Number(env.FS_CADASTRO_TIMEOUT_MS) || 12_000), redirect: 'error' });
      if (response.status !== 200) continue;
      const d = await response.json() as Record<string, unknown>;
      if (String(d.cnpj ?? '').replace(/\D/g, '') !== cnpj || typeof d.razao_social !== 'string' || !d.razao_social.trim()) continue;
      const text = (v: unknown, fallback = 'Não informado') => typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : fallback;
      const flag = (v: unknown) => typeof v === 'boolean' ? v : null;
      return { name: d.razao_social.trim(), status: text(d.descricao_situacao_cadastral), statusDate: typeof d.data_situacao_cadastral === 'string' ? d.data_situacao_cadastral : null, size: text(d.porte), simples: flag(d.opcao_pelo_simples), mei: flag(d.opcao_pelo_mei), city: text(d.municipio), state: text(d.uf), activity: text(d.cnae_fiscal_descricao), opened: typeof d.data_inicio_atividade === 'string' ? d.data_inicio_atividade : null, legalNature: text(d.natureza_juridica), provider: `Dados abertos CNPJ/RFB · ${new URL(base).host}`, collectedAt: new Date().toISOString() };
    } catch { /* tenta a próxima base */ }
  }
  return null;
}

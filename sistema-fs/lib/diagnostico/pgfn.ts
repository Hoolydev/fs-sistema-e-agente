import { createHash } from 'node:crypto';
import { normalizeCnpj } from './model';

// Serpro "Consulta Dívida Ativa" (PGFN). Dado público: não exige certificado nem procuração,
// diferente do SITFIS. Uma chamada por diagnóstico; a resposta bruta é preservada com hash.
const TOKEN_URL = 'https://gateway.apiserpro.serpro.gov.br/token';
const API_URL = 'https://gateway.apiserpro.serpro.gov.br/consulta-divida-ativa-df/api/v1/devedor';
const MAX_BYTES = 8 * 1024 * 1024;

export class PgfnError extends Error {
  constructor(readonly code: 'credentials_missing' | 'auth_failed' | 'network' | 'invalid_cnpj' | 'unexpected_status' | 'response_format' | 'taxpayer_mismatch', message: string) {
    super(message); this.name = 'PgfnError';
  }
}
export type PgfnRow = {
  numeroInscricao: string; numeroProcesso?: string; situacaoDescricao?: string; descricaoTipoSituacao?: string;
  tipoRegularidade?: string; valorTotalConsolidadoMoeda: string; cpfCnpj: string; nomeDevedor?: string;
  dataInscricao?: string; numeroJuizo?: string; nomeUnidade?: string; tipoDevedor?: string;
};
// `sem_inscricoes` = a API respondeu 404 "CNPJ não encontrado", que nesta API significa ausência de
// inscrição na base consultada. É registrado como tal, nunca como erro nem como "débito zero" sem ressalva.
export type PgfnEvidence = { outcome: 'inscricoes' | 'sem_inscricoes'; rows: PgfnRow[]; raw: Buffer; sha256: string; httpStatus: number; collectedAt: string };

export type PgfnFetch = (url: string, init: RequestInit) => Promise<Response>;

export async function consultDividaAtiva(cnpjInput: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: PgfnFetch = fetch, tag = ''): Promise<PgfnEvidence> {
  const cnpj = normalizeCnpj(cnpjInput);
  if (!/^\d{14}$/.test(cnpj)) throw new PgfnError('invalid_cnpj', 'CNPJ do contribuinte inválido para a consulta PGFN.');
  const key = env.SERPRO_DIVIDA_CONSUMER_KEY?.trim(), secret = env.SERPRO_DIVIDA_CONSUMER_SECRET?.trim();
  if (!key || !secret) throw new PgfnError('credentials_missing', 'As credenciais do contrato Serpro Dívida Ativa não estão configuradas no sistema.');
  const timeout = Number(env.SERPRO_DIVIDA_TIMEOUT_MS) || 45_000;
  let token: string;
  try {
    const auth = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', signal: AbortSignal.timeout(timeout), redirect: 'error' });
    if (auth.status !== 200) throw new PgfnError('auth_failed', 'O Serpro recusou as credenciais do contrato Dívida Ativa.');
    const body = await auth.json().catch(() => null) as { access_token?: unknown } | null;
    if (!body || typeof body.access_token !== 'string' || !body.access_token) throw new PgfnError('auth_failed', 'A autenticação Serpro não retornou token.');
    token = body.access_token;
  } catch (error) { throw error instanceof PgfnError ? error : new PgfnError('network', 'Falha de conexão ou prazo na autenticação com o Serpro.'); }
  let response: Response, raw: Buffer;
  try {
    response = await fetchImpl(`${API_URL}/${cnpj}`, { method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(tag ? { 'x-request-tag': tag.slice(0, 32) } : {}) }, signal: AbortSignal.timeout(timeout), redirect: 'error' });
    raw = Buffer.from(await response.arrayBuffer());
  } catch { throw new PgfnError('network', 'Falha de conexão ou prazo na consulta à PGFN.'); }
  if (raw.length > MAX_BYTES) throw new PgfnError('response_format', 'A resposta da PGFN excede o tamanho permitido.');
  const collectedAt = new Date().toISOString(), sha256 = createHash('sha256').update(raw).digest('hex');
  let data: unknown; try { data = JSON.parse(raw.toString('utf8')); } catch { data = null; }
  if (response.status === 404) {
    const message = Array.isArray(data) ? String((data[0] as { message?: unknown })?.message ?? '') : '';
    if (/n[ãa]o encontrado/i.test(message)) return { outcome: 'sem_inscricoes', rows: [], raw, sha256, httpStatus: 404, collectedAt };
    throw new PgfnError('unexpected_status', 'A PGFN retornou 404 sem a indicação esperada. A equipe precisa revisar antes de repetir.');
  }
  if (response.status === 401 || response.status === 403) throw new PgfnError('auth_failed', 'O Serpro recusou o acesso ao serviço Dívida Ativa. Verifique contrato e credenciais.');
  if (response.status !== 200) throw new PgfnError('unexpected_status', `A consulta PGFN não foi concluída (status ${response.status}). A equipe precisa revisar antes de repetir.`);
  if (!Array.isArray(data) || !data.length) throw new PgfnError('response_format', 'A PGFN retornou 200 sem a lista de inscrições esperada.');
  for (const row of data) {
    if (!row || typeof row !== 'object' || typeof (row as PgfnRow).numeroInscricao !== 'string' || typeof (row as PgfnRow).valorTotalConsolidadoMoeda !== 'string') throw new PgfnError('response_format', 'Estrutura de inscrição PGFN inesperada.');
    if (String((row as PgfnRow).cpfCnpj ?? '').replace(/\D/g, '') !== cnpj) throw new PgfnError('taxpayer_mismatch', 'A resposta da PGFN pertence a outro contribuinte.');
  }
  return { outcome: 'inscricoes', rows: data as PgfnRow[], raw, sha256, httpStatus: 200, collectedAt };
}

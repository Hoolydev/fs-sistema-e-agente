import { formatCnpj, money, normalizeCnpj, validateReport, type Debt, type DiagnosticReport } from './model';
import { brlToCents } from './serpro-evidence';
import type { Cadastro } from './cadastro';
import type { PgfnEvidence } from './pgfn';

// Parecer preliminar para lead comercial: fontes que não exigem procuração (PGFN e cadastro público).
// A Receita Federal (SITFIS) fica explicitamente pendente até o contribuinte outorgar procuração à FS.
export const FS_PROCURADOR_CNPJ_DEFAULT = '47733961000179';
export function procuracaoInstruction(procuradorCnpj = FS_PROCURADOR_CNPJ_DEFAULT) {
  return `Situação Fiscal na Receita Federal (SITFIS) não coletada: o Integra Contador exige que o contribuinte outorgue procuração eletrônica no Portal e-CAC para a FS (CNPJ ${formatCnpj(procuradorCnpj)}), com o serviço de Situação Fiscal. Após a outorga, reprocessar a análise para a versão completa.`;
}
const digits = (v: string) => v.replace(/\D/g, '');
const nullable = (v: unknown) => typeof v === 'string' && v.trim() && !/^0+$/.test(digits(v)) ? v.trim() : null;
const yesNo = (v: boolean | null) => v === null ? 'Não informado' : v ? 'Sim' : 'Não';

export function preliminaryReport(input: { cnpj: string; cadastro: Cadastro | null; pgfn: PgfnEvidence; reportId: string; version: number; procuradorCnpj?: string }): DiagnosticReport {
  const cnpj = normalizeCnpj(input.cnpj), { pgfn, cadastro } = input, collectedAt = pgfn.collectedAt;
  const seen = new Set<string>();
  const debts: Debt[] = [], extinct: string[][] = [], review: string[][] = [];
  let judicial = 0, reviewTotal = 0, pgfnName: string | undefined;
  for (const raw of pgfn.rows) {
    if (digits(raw.cpfCnpj) !== cnpj) throw new Error('PGFN_TAXPAYER_MISMATCH');
    const id = raw.numeroInscricao, key = digits(id);
    if (!key || seen.has(key)) throw new Error('PGFN_DUPLICATE_INSCRIPTION');
    seen.add(key);
    pgfnName ??= raw.nomeDevedor?.trim() || undefined;
    const total = brlToCents(raw.valorTotalConsolidadoMoeda), status = String(raw.situacaoDescricao ?? '').trim() || 'Situação não informada';
    const registered = String(raw.dataInscricao ?? 'Não informada');
    if (status.startsWith('EXTINTA')) {
      if (total !== 0) throw new Error('PGFN_EXTINCT_WITH_BALANCE');
      extinct.push([id, status, money(total), registered]); continue;
    }
    if (nullable(raw.numeroJuizo)) judicial += 1;
    if (status !== 'ATIVA EM COBRANCA') { reviewTotal += total; review.push([id, status, money(total), registered, nullable(raw.numeroJuizo) ? 'Sim' : 'Não']); continue; }
    debts.push({ id, origin: 'PGFN', tax: 'Não discriminado na fonte', period: 'Não informado', status, administrativeProcess: nullable(raw.numeroProcesso), judicialProcess: nullable(raw.numeroJuizo), registeredAt: nullable(raw.dataInscricao), principal: null, fine: null, interest: null, charges: null, total, sourceId: 'pgfn' });
  }
  const pgfnTotal = debts.reduce((sum, d) => sum + d.total, 0);
  const name = cadastro?.name ?? pgfnName ?? `Empresa ${formatCnpj(cnpj)}`;
  const procuracao = procuracaoInstruction(input.procuradorCnpj);
  const pgfnSummary = pgfn.outcome === 'sem_inscricoes'
    ? 'A consulta à PGFN não localizou o CNPJ na base de dívida ativa (retorno "CNPJ não encontrado"), o que indica ausência de inscrição em dívida ativa da União na data da consulta.'
    : `A PGFN retornou ${pgfn.rows.length} inscrições: ${debts.length} ativas em cobrança somando ${money(pgfnTotal)}${review.length ? `, ${review.length} em outras situações (${money(reviewTotal)}) apresentadas separadamente para revisão` : ''}${extinct.length ? ` e ${extinct.length} extintas` : ''}.`;
  const summary = `Diagnóstico preliminar por fontes que não exigem procuração. ${pgfnSummary} A Situação Fiscal na Receita Federal não foi coletada; pendências, débitos com exigibilidade suspensa e certidão permanecem desconhecidos e não são tratados como inexistentes.`;
  const pending = [procuracao,
    ...(pgfn.outcome === 'sem_inscricoes' ? ['Confirmar a ausência de inscrições no Regularize/PGFN antes de comunicar regularidade ao cliente.'] : []),
    ...(review.length ? ['Inscrições PGFN em situação diferente de "ativa em cobrança" (parceladas, ajuizadas, suspensas ou outras) não foram somadas ao total; revisar cada uma na fonte.'] : []),
    'Composição por principal, multa, juros e encargo das inscrições PGFN não fornecida nesta resposta.',
    'CAPAG, faturamento e demonstrações contábeis não recebidos.',
    'Modalidade, elegibilidade, condições, descontos e prazos de negociação dependem de documentação e revisão técnica.',
    'Regime tributário atual a confirmar; o cadastro público informa apenas a opção pelo Simples/MEI registrada.'];
  const recommendations = ['Solicitar ao lead a procuração eletrônica no e-CAC para a FS e reprocessar a análise completa (RFB + PGFN).', 'Conciliar as inscrições PGFN com pagamentos, parcelamentos e processos antes de qualquer proposta.', 'Reunir CAPAG, faturamento e documentos contábeis para a etapa de estratégia.', 'Submeter este preliminar ao responsável técnico da FS antes de compartilhar com o cliente.'];
  const conclusion = `${pgfnSummary} Sem a Situação Fiscal da Receita Federal, o passivo federal total não pode ser consolidado nem se pode concluir regularidade. Este preliminar orienta a abordagem comercial e a coleta de procuração; não substitui o parecer completo.`;
  const supplements: NonNullable<DiagnosticReport['supplements']> = [];
  if (cadastro) supplements.push({ title: 'Cadastro público do CNPJ', note: `Fonte: ${cadastro.provider}, em ${new Date(cadastro.collectedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Dados cadastrais não indicam situação fiscal.`, headers: ['Campo', 'Valor'], rows: [['Razão social', cadastro.name], ['Situação cadastral', `${cadastro.status}${cadastro.statusDate ? ` (${cadastro.statusDate})` : ''}`], ['Porte', cadastro.size], ['Natureza jurídica', cadastro.legalNature], ['Atividade principal', cadastro.activity], ['Município/UF', `${cadastro.city}/${cadastro.state}`], ['Início da atividade', cadastro.opened ?? 'Não informado'], ['Opção pelo Simples', yesNo(cadastro.simples)], ['MEI', yesNo(cadastro.mei)]] });
  if (review.length) supplements.push({ title: 'PGFN - inscrições em outras situações (fora do total em cobrança)', note: 'Situação transcrita da fonte. Valores não somados ao total em cobrança até revisão técnica.', headers: ['Inscrição', 'Situação', 'Valor consolidado', 'Inscrita em', 'Referência judicial'], rows: review });
  if (extinct.length) supplements.push({ title: 'PGFN - inscrições extintas', note: 'Registros retornados na mesma consulta. Excluídos do conjunto de inscrições ativas; saldo zero informado expressamente pela fonte.', headers: ['Inscrição', 'Situação', 'Saldo retornado', 'Inscrita em'], rows: extinct });
  return validateReport({ id: input.reportId, version: input.version, mode: 'real', company: { name, cnpj, regime: cadastro ? `Cadastro público: Simples ${yesNo(cadastro.simples)}, MEI ${yesNo(cadastro.mei)}. Regime atual a confirmar.` : 'Regime não confirmado; cadastro público indisponível na consulta.' }, generatedAt: collectedAt,
    scope: 'Diagnóstico preliminar limitado à dívida ativa da União (PGFN) e ao cadastro público do CNPJ, na data-base indicada. Não inclui a Situação Fiscal da Receita Federal, outras esferas tributárias nem atualização posterior.', summary, debts,
    sources: [
      { id: 'rfb', title: 'Informações de apoio para emissão de certidão - SITFIS', provider: 'Receita Federal / Serpro Integra Contador', collectedAt, status: 'pendente', note: procuracao },
      { id: 'pgfn', title: 'Consulta Dívida Ativa - devedor', provider: 'PGFN / Serpro', collectedAt, status: 'coletado', note: `Resposta JSON preservada (HTTP ${pgfn.httpStatus}). SHA-256: ${pgfn.sha256}. ${pgfn.outcome === 'sem_inscricoes' ? 'Nenhuma inscrição localizada para o CNPJ.' : `${debts.length} inscrições ativas em cobrança, ${review.length} em outras situações e ${extinct.length} extintas. Valores consolidados; composição não fornecida.`}` },
      { id: 'cadastro', title: 'Situação cadastral do CNPJ', provider: cadastro?.provider ?? 'Dados abertos CNPJ/RFB', collectedAt: cadastro?.collectedAt ?? collectedAt, status: cadastro ? 'coletado' : 'pendente', note: cadastro ? `Razão social, situação cadastral (${cadastro.status}), porte e atividade obtidos na base pública. Não é fonte de débitos.` : 'Base pública indisponível no momento da consulta; identificação da empresa a confirmar.' },
    ],
    capag: { rating: null, amount: null, note: 'CAPAG, rating e capacidade de pagamento não fornecidos pelas fontes coletadas.' }, sections: [], pending, recommendations, conclusion, supplements,
    opinion: { scenario: null, capagDebtBasis: null, capagBasisNote: 'Base específica da CAPAG não recebida; não substituir pelo total desta consulta.', annualRevenue: null, revenuePeriod: 'Não informado', deadline: null, releaseDate: null, windowNote: 'Não foi consultada modalidade ou janela oficial de negociação.', rescissionNote: 'Histórico de acordos e rescisões não informado nas fontes.', judicialNote: judicial ? `${judicial} inscrições PGFN trazem referência de juízo na fonte. Não foram fornecidos autos, garantias ou decisões; a referência isolada não prova execução em curso.` : 'Nenhuma referência judicial informada pela PGFN nesta consulta. Ausência de informação não significa ausência de processos.', certificateNote: 'Certidão não consultada. A regularidade fiscal depende também da Situação Fiscal na Receita Federal, pendente de procuração.', capagReview: 'Reunir dados contábeis e demonstração econômica para avaliação técnica. Não há conclusão de cabimento de revisão nesta etapa.', legalBasis: [], actions: recommendations.map(action => ({ action, timing: 'Antes da emissão definitiva e de qualquer adesão' })), caveats: pending, conclusion },
  });
}

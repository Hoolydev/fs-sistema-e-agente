import { formatCnpj, isJudicialStatus, money, normalizeCnpj, pgfnSituation, pgfnSituationLabels, validateReport, type Debt, type DiagnosticReport, type PgfnSituation } from './model';
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
// Leitura da Receita Federal feita pelo analista sem procuração (ex.: relatório de situação fiscal entregue pelo cliente).
// Valores em centavos. Sem valor algum, a fonte RFB continua pendente: a existência de débito fica registrada, nunca um total presumido.
export type RfbManualReading = { hasDebts: boolean; reference: string; analyst: string; note?: string | null; count?: number | null; totalCents?: number | null; items?: { description: string; period: string; total: number }[] };

export function preliminaryReport(input: { cnpj: string; cadastro: Cadastro | null; pgfn: PgfnEvidence; reportId: string; version: number; procuradorCnpj?: string; rfbManual?: RfbManualReading | null; annexes?: DiagnosticReport['annexes'] }): DiagnosticReport {
  const cnpj = normalizeCnpj(input.cnpj), { pgfn, cadastro } = input, collectedAt = pgfn.collectedAt;
  const seen = new Set<string>();
  const debts: Debt[] = [], extinct: string[][] = [];
  let judicial = 0, pgfnName: string | undefined;
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
    // Toda inscrição não extinta é dívida ativa e compõe o passivo, inclusive negociada/parcelada, suspensa ou garantida
    // (é o "valor total da dívida" do Regularize). A situação da fonte é preservada para separar o que está em cobrança.
    const judicialProcess = nullable(raw.numeroJuizo) ?? (isJudicialStatus(status) ? 'Ajuizada (número do juízo não informado na fonte)' : null);
    if (judicialProcess) judicial += 1;
    debts.push({ id, origin: 'PGFN', tax: 'Não discriminado na fonte', period: 'Não informado', status, administrativeProcess: nullable(raw.numeroProcesso), judicialProcess, registeredAt: nullable(raw.dataInscricao), principal: null, fine: null, interest: null, charges: null, total, sourceId: 'pgfn' });
  }
  const pgfnTotal = debts.reduce((sum, d) => sum + d.total, 0);
  const bySituation = (['cobranca', 'negociada', 'suspensa', 'garantida'] as PgfnSituation[]).map(key => { const list = debts.filter(d => pgfnSituation(d.status) === key); return { key, count: list.length, total: list.reduce((sum, d) => sum + d.total, 0) }; }).filter(g => g.count);
  const situationText = bySituation.map(g => `${g.count} ${pgfnSituationLabels[g.key].toLowerCase()} (${money(g.total)})`).join(', ');
  const negotiated = bySituation.filter(g => g.key !== 'cobranca');
  const manual = input.rfbManual ?? null, items = manual?.hasDebts ? (manual.items ?? []).filter(i => i.total > 0) : [];
  const rfbDebts: Debt[] = items.length
    ? items.map((item, i) => ({ id: `RFB-LEITURA-${String(i + 1).padStart(3, '0')}`, origin: 'RFB', tax: item.description, period: item.period || 'Não informado', status: 'Informado pelo analista', administrativeProcess: null, judicialProcess: null, registeredAt: null, principal: null, fine: null, interest: null, charges: null, total: item.total, sourceId: 'rfb' }))
    : manual?.hasDebts && manual.totalCents ? [{ id: 'RFB-LEITURA-TOTAL', origin: 'RFB', tax: 'Débitos na Receita Federal (valor global informado)', period: 'Não informado', status: 'Informado pelo analista', administrativeProcess: null, judicialProcess: null, registeredAt: null, principal: null, fine: null, interest: null, charges: null, total: manual.totalCents, sourceId: 'rfb' }] : [];
  // Declarada: há valores lidos ou o analista leu que não há débitos. Só "há débito" sem valor mantém a fonte pendente.
  const rfbDeclared = !!manual && (!manual.hasDebts || rfbDebts.length > 0), rfbTotal = rfbDebts.reduce((sum, d) => sum + d.total, 0);
  const rfbCount = manual?.hasDebts ? (items.length || manual.count || null) : manual ? 0 : null;
  const rfbReading = !manual ? null : !manual.hasDebts ? `Pela leitura do analista (${manual.reference}), não há débitos em cobrança na Receita Federal.` : rfbDebts.length ? `Pela leitura do analista (${manual.reference}), há ${rfbCount ?? 'débitos'}${rfbCount ? ' débitos' : ''} na Receita Federal somando ${money(rfbTotal)}; valores informados sem procuração, não coletados pelo sistema.` : `Pela leitura do analista (${manual.reference}), há débitos na Receita Federal${rfbCount ? ` (${rfbCount})` : ''}; valores não informados.`;
  const name = cadastro?.name ?? pgfnName ?? `Empresa ${formatCnpj(cnpj)}`;
  const procuracao = procuracaoInstruction(input.procuradorCnpj);
  const pgfnSummary = pgfn.outcome === 'sem_inscricoes'
    ? 'A consulta à PGFN não localizou o CNPJ na base de dívida ativa (retorno "CNPJ não encontrado"), o que indica ausência de inscrição em dívida ativa da União na data da consulta.'
    : `A PGFN retornou ${pgfn.rows.length} inscrições: ${debts.length} ativas somando ${money(pgfnTotal)}${debts.length ? ` — ${situationText}` : ''}${extinct.length ? `; ${extinct.length} extintas, sem saldo` : ''}.`;
  const summary = rfbReading
    ? `Diagnóstico preliminar por fontes que não exigem procuração, complementado pela leitura do analista. ${pgfnSummary} ${rfbReading} A Situação Fiscal oficial não foi coletada pelo sistema; débitos com exigibilidade suspensa e certidão dependem dela.`
    : `Diagnóstico preliminar por fontes que não exigem procuração. ${pgfnSummary} A Situação Fiscal na Receita Federal não foi coletada; pendências, débitos com exigibilidade suspensa e certidão permanecem desconhecidos e não são tratados como inexistentes.`;
  const pending = [procuracao, ...(manual ? ['Confirmar a leitura manual da Receita Federal com a Situação Fiscal oficial antes de emitir a versão definitiva.'] : []),
    ...(pgfn.outcome === 'sem_inscricoes' ? ['Confirmar a ausência de inscrições no Regularize/PGFN antes de comunicar regularidade ao cliente.'] : []),
    ...(negotiated.length ? ['Conferir no Regularize/SISPAR a situação e a adimplência das inscrições negociadas, suspensas ou garantidas; elas permanecem no passivo até a quitação.'] : []),
    'Composição por principal, multa, juros e encargo das inscrições PGFN não fornecida nesta resposta.',
    'CAPAG, faturamento e demonstrações contábeis não recebidos.',
    'Modalidade, elegibilidade, condições, descontos e prazos de negociação dependem de documentação e revisão técnica.',
    'Regime tributário atual a confirmar; o cadastro público informa apenas a opção pelo Simples/MEI registrada.'];
  const recommendations = ['Solicitar ao lead a procuração eletrônica no e-CAC para a FS e reprocessar a análise completa (RFB + PGFN).', 'Conciliar as inscrições PGFN com pagamentos, parcelamentos e processos antes de qualquer proposta.', 'Reunir CAPAG, faturamento e documentos contábeis para a etapa de estratégia.', 'Submeter este preliminar ao responsável técnico da FS antes de compartilhar com o cliente.'];
  const conclusion = rfbDeclared
    ? `${pgfnSummary} ${rfbReading} Passivo federal identificado: ${money(pgfnTotal + rfbTotal)}, com a parcela da Receita Federal dependente de confirmação na Situação Fiscal oficial. Este preliminar orienta a abordagem e a coleta de procuração; não substitui o parecer completo.`
    : `${pgfnSummary} ${rfbReading ?? ''} Sem a Situação Fiscal da Receita Federal, o passivo federal total não pode ser consolidado nem se pode concluir regularidade. Este preliminar orienta a abordagem comercial e a coleta de procuração; não substitui o parecer completo.`.replace('  ', ' ');
  const supplements: NonNullable<DiagnosticReport['supplements']> = [];
  if (cadastro) supplements.push({ title: 'Cadastro público do CNPJ', note: `Fonte: ${cadastro.provider}, em ${new Date(cadastro.collectedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Dados cadastrais não indicam situação fiscal.`, headers: ['Campo', 'Valor'], rows: [['Razão social', cadastro.name], ['Situação cadastral', `${cadastro.status}${cadastro.statusDate ? ` (${cadastro.statusDate})` : ''}`], ['Porte', cadastro.size], ['Natureza jurídica', cadastro.legalNature], ['Atividade principal', cadastro.activity], ['Município/UF', `${cadastro.city}/${cadastro.state}`], ['Início da atividade', cadastro.opened ?? 'Não informado'], ['Opção pelo Simples', yesNo(cadastro.simples)], ['MEI', yesNo(cadastro.mei)]] });
  if (debts.length) supplements.push({ title: 'PGFN - inscrições ativas por situação', note: 'Situação transcrita da fonte. Inscrições negociadas, suspensas ou garantidas continuam no passivo inscrito; a separação indica o que está efetivamente em cobrança.', headers: ['Situação', 'Inscrições', 'Valor consolidado', '% do passivo PGFN'], rows: bySituation.map(g => [pgfnSituationLabels[g.key], String(g.count), money(g.total), `${(pgfnTotal ? g.total / pgfnTotal * 100 : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`]) });
  if (extinct.length) supplements.push({ title: 'PGFN - inscrições extintas', note: 'Registros retornados na mesma consulta. Excluídos do conjunto de inscrições ativas; saldo zero informado expressamente pela fonte.', headers: ['Inscrição', 'Situação', 'Saldo retornado', 'Inscrita em'], rows: extinct });
  return validateReport({ id: input.reportId, version: input.version, mode: 'real', company: { name, cnpj, regime: cadastro ? `Cadastro público: Simples ${yesNo(cadastro.simples)}, MEI ${yesNo(cadastro.mei)}. Regime atual a confirmar.` : 'Regime não confirmado; cadastro público indisponível na consulta.' }, generatedAt: collectedAt,
    scope: manual ? 'Diagnóstico preliminar com a dívida ativa da União (PGFN), o cadastro público do CNPJ e a leitura da Receita Federal informada pelo analista, na data-base indicada. A Situação Fiscal oficial não foi coletada pelo sistema; não inclui outras esferas tributárias nem atualização posterior.' : 'Diagnóstico preliminar limitado à dívida ativa da União (PGFN) e ao cadastro público do CNPJ, na data-base indicada. Não inclui a Situação Fiscal da Receita Federal, outras esferas tributárias nem atualização posterior.', summary, debts: [...rfbDebts, ...debts],
    sources: [
      rfbDeclared
        ? { id: 'rfb', title: 'Receita Federal - leitura do analista', provider: `Informado por ${manual!.analyst} · ${manual!.reference}`, collectedAt, status: 'declarado', note: `${rfbReading} Leitura feita sem procuração, em documento do contribuinte. ${procuracao}` }
        : { id: 'rfb', title: 'Informações de apoio para emissão de certidão - SITFIS', provider: 'Receita Federal / Serpro Integra Contador', collectedAt, status: 'pendente', note: rfbReading ? `${rfbReading} ${procuracao}` : procuracao },
      { id: 'pgfn', title: 'Consulta Dívida Ativa - devedor', provider: 'PGFN / Serpro', collectedAt, status: 'coletado', note: `Resposta JSON preservada (HTTP ${pgfn.httpStatus}). SHA-256: ${pgfn.sha256}. ${pgfn.outcome === 'sem_inscricoes' ? 'Nenhuma inscrição localizada para o CNPJ.' : `${debts.length} inscrições ativas (${situationText}) e ${extinct.length} extintas. Valores consolidados; composição não fornecida.`}` },
      { id: 'cadastro', title: 'Situação cadastral do CNPJ', provider: cadastro?.provider ?? 'Dados abertos CNPJ/RFB', collectedAt: cadastro?.collectedAt ?? collectedAt, status: cadastro ? 'coletado' : 'pendente', note: cadastro ? `Razão social, situação cadastral (${cadastro.status}), porte e atividade obtidos na base pública. Não é fonte de débitos.` : 'Base pública indisponível no momento da consulta; identificação da empresa a confirmar.' },
    ],
    capag: { rating: null, amount: null, note: 'CAPAG, rating e capacidade de pagamento não fornecidos pelas fontes coletadas.' }, sections: [], pending, recommendations, conclusion, supplements,
    ...(manual ? { rfbDeclaration: { hasDebts: manual.hasDebts, count: rfbCount, reference: manual.reference, analyst: manual.analyst, note: manual.note?.trim() || null } } : {}),
    ...(input.annexes?.length ? { annexes: input.annexes } : {}),
    opinion: { scenario: null, capagDebtBasis: null, capagBasisNote: 'Base específica da CAPAG não recebida; não substituir pelo total desta consulta.', annualRevenue: null, revenuePeriod: 'Não informado', deadline: null, releaseDate: null, windowNote: 'Não foi consultada modalidade ou janela oficial de negociação.', rescissionNote: 'Histórico de acordos e rescisões não informado nas fontes.', judicialNote: judicial ? `${judicial} inscrições PGFN trazem referência de juízo na fonte. Não foram fornecidos autos, garantias ou decisões; a referência isolada não prova execução em curso.` : 'Nenhuma referência judicial informada pela PGFN nesta consulta. Ausência de informação não significa ausência de processos.', certificateNote: manual?.hasDebts || debts.length ? 'Certidão não consultada. Há débitos em cobrança nas fontes e leituras deste preliminar; a regularidade depende de regularização e da Situação Fiscal oficial.' : 'Certidão não consultada. A regularidade fiscal depende também da Situação Fiscal na Receita Federal, pendente de procuração.', capagReview: 'Reunir dados contábeis e demonstração econômica para avaliação técnica. Não há conclusão de cabimento de revisão nesta etapa.', legalBasis: [], actions: recommendations.map(action => ({ action, timing: 'Antes da emissão definitiva e de qualquer adesão' })), caveats: pending, conclusion },
  });
}

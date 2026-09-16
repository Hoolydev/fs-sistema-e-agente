import { normalizeCnpj, money, validateReport, type Debt, type DiagnosticReport } from './model';

// Only the observed SITFIS layout is accepted. Unrecognized rows stop issuance.
export function brlToCents(raw: string): number {
  const value = raw.trim().replace(/^R\$\s*/, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(value)) throw new Error('INVALID_AMOUNT');
  const cents = Number(value.replace(/[.,]/g, ''));
  if (!Number.isSafeInteger(cents)) throw new Error('INVALID_AMOUNT');
  return cents;
}
const digits = (v: string) => v.replace(/\D/g, '');
const nullable = (v: unknown) => typeof v === 'string' && v.trim() && !/^0+$/.test(digits(v)) ? v.trim() : null;
export function parseRfb(text: string, cnpj: string) {
  const taxpayer = text.match(/Dados Cadastrais da Matriz[^\n]*\nCNPJ:\s*([\d./-]+)/);
  if (!taxpayer || digits(taxpayer[1]) !== normalizeCnpj(cnpj)) throw new Error('RFB_TAXPAYER_MISMATCH');
  const name = text.match(/CNPJ:\s*[\d./-]+\s*-\s*([^\n]+)/)?.[1];
  if (!name) throw new Error('RFB_NAME_MISSING');
  const cleaned = text.split('\n').filter(line => !/^(MINISTÉRIO|SECRETARIA ESPECIAL|PROCURADORIA-GERAL|INFORMAÇÕES DE APOIO|CNPJ:|Página:|-- \d+ of \d+ --)/.test(line)).join('\n');
  function section(start: string, end: string) {
    if (!cleaned.includes(start) || !cleaned.includes(end)) throw new Error('RFB_LAYOUT_UNSUPPORTED');
    return cleaned.split(start)[1].split(end)[0].replace(/\b(\dº)\s*\n\s*TRIM\//g, '$1 TRIM/');
  }
  function suspendedRows(block: string) {
    const lines = block.split('\n').map(x => x.trim()).filter(x => x && !/^[_\s]+$/.test(x) && !x.startsWith('Receita PA/'));
    return lines.map((line, index) => {
      const match = line.match(/^(.*?)\s+(\d{2}\/\d{4}|\dº TRIM\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.*)$/);
      if (!match) throw new Error('RFB_UNPARSED_ROW');
      const tokens = match[4].split(/\s+/), count = 2;
      const amounts = tokens.slice(0, count).map(brlToCents);
      const status = tokens.slice(count).join(' ');
      if (!status || amounts.length !== count) throw new Error('RFB_UNPARSED_ROW');
      return { id: `RFB-AV-${String(index + 1).padStart(3, '0')}`, tax: match[1], period: match[2], due: match[3], amounts, status };
    });
  }
  // Exigible rows contain five monetary columns; suspended rows contain two.
  const exigibleBlock = section('Pendência - Débito (SIEF)', 'Débito com Exigibilidade Suspensa (SIEF)');
  const active = exigibleBlock.split('\n').map(x => x.trim()).filter(x => x && !/^_+$/.test(x) && !x.startsWith('Receita PA/')).map((line, index) => {
    const match = line.match(/^(.*?)\s+(\d{2}\/\d{4}|\dº TRIM\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.*)$/);
    if (!match) throw new Error('RFB_UNPARSED_ROW');
    const tokens = match[4].split(/\s+/), amounts = tokens.slice(0, 5).map(brlToCents), status = tokens.slice(5).join(' ');
    if (amounts.length !== 5 || status !== 'DEVEDOR' || amounts[1] + amounts[2] + amounts[3] !== amounts[4]) throw new Error('RFB_COMPONENT_MISMATCH');
    return { id: `RFB-DEV-${String(index + 1).padStart(3, '0')}`, tax: match[1], period: match[2], due: match[3], amounts, status };
  });
  const suspended = suspendedRows(section('Débito com Exigibilidade Suspensa (SIEF)', 'Diagnóstico Fiscal na Procuradoria-Geral'));
  const sida = new Map<string, { tax: string; date: string; process: string }>();
  const sidaText = cleaned.split('Pendência - Inscrição (SIDA)')[1] ?? '';
  const pattern = /(\d{2}\.\d\.\d{2}\.\d{6}-\d{2})\s+([\s\S]*?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{5}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s+DEVEDOR PRINCIPAL/g;
  for (const m of sidaText.matchAll(pattern)) {
    const key = digits(m[1]);
    if (sida.has(key)) throw new Error('RFB_DUPLICATE_INSCRIPTION');
    sida.set(key, { tax: m[2].replace(/\s+/g, ' ').trim(), date: m[3], process: m[4] });
  }
  const listed = [...sidaText.matchAll(/\d{2}\.\d\.\d{2}\.\d{6}-\d{2}/g)];
  if (listed.length !== sida.size) throw new Error('RFB_SIDA_UNPARSED_ROW');
  const certificate = text.match(/Certidão Positiva com Efeitos de Negativa:\s*([^\n]+)/)?.[1];
  return { name: name.trim(), active, suspended, sida, certificate };
}

export function reportFromSerpro(input: { cnpj: string; rfbText: string; pgfn: unknown; collectedAt: string; rfbHash: string; pgfnHash: string; reportId: string; version: number }): DiagnosticReport {
  const cnpj = normalizeCnpj(input.cnpj), rfb = parseRfb(input.rfbText, cnpj);
  if (!Array.isArray(input.pgfn) || !input.pgfn.length) throw new Error('PGFN_EMPTY_UNVERIFIED');
  const seen = new Set<string>();
  const extinct: string[][] = [];
  const pgfnDebts: Debt[] = [];
  for (const raw of input.pgfn) {
    if (!raw || typeof raw !== 'object' || typeof raw.cpfCnpj !== 'string' || digits(raw.cpfCnpj) !== cnpj) throw new Error('PGFN_TAXPAYER_MISMATCH');
    const id = String(raw.numeroInscricao ?? ''), key = digits(id);
    if (!key || seen.has(key)) throw new Error('PGFN_DUPLICATE_INSCRIPTION');
    seen.add(key);
    const total = brlToCents(raw.valorTotalConsolidadoMoeda);
    const status = String(raw.situacaoDescricao ?? '');
    if (status.startsWith('EXTINTA')) {
      if (total !== 0) throw new Error('PGFN_EXTINCT_WITH_BALANCE');
      extinct.push([id, status, money(total), String(raw.dataInscricao ?? 'Não informada')]);
      continue;
    }
    if (status !== 'ATIVA EM COBRANCA') throw new Error('PGFN_STATUS_REQUIRES_REVIEW');
    const match = rfb.sida.get(key);
    if (match && digits(match.process) !== digits(String(raw.numeroProcesso))) throw new Error('PGFN_PROCESS_MISMATCH');
    pgfnDebts.push({ id, origin: 'PGFN', tax: match?.tax ?? 'Não discriminado na fonte', period: 'Não informado', status, administrativeProcess: nullable(raw.numeroProcesso), judicialProcess: null, registeredAt: nullable(raw.dataInscricao), principal: null, fine: null, interest: null, charges: null, total, sourceId: 'pgfn' });
  }
  if ([...rfb.sida.keys()].some(id => !pgfnDebts.some(d => digits(d.id) === id))) throw new Error('PGFN_RFB_RECONCILIATION_REQUIRED');
  const debts: Debt[] = [...rfb.active.map(row => ({ id: row.id, origin: 'RFB' as const, tax: row.tax, period: row.period, status: `${row.status} · vencimento ${row.due}`, administrativeProcess: null, judicialProcess: null, registeredAt: null, principal: row.amounts[1], fine: row.amounts[2], interest: row.amounts[3], charges: null, total: row.amounts[4], sourceId: 'rfb' })), ...pgfnDebts];
  const rfbTotal = rfb.active.reduce((sum, row) => sum + row.amounts[4], 0), pgfnTotal = pgfnDebts.reduce((sum, row) => sum + row.total, 0), upcoming = rfb.suspended.reduce((sum, row) => sum + row.amounts[1], 0);
  const summary = `Foram identificados ${money(rfbTotal + pgfnTotal)} em débitos em cobrança: ${money(rfbTotal)} na Receita Federal (${rfb.active.length} registros) e ${money(pgfnTotal)} na PGFN (${pgfnDebts.length} inscrições ativas). A seção de exigibilidade suspensa do SITFIS contém ${rfb.suspended.length} registros com saldo de ${money(upcoming)}, apresentados separadamente conforme a situação indicada na fonte, sem somar ao passivo em cobrança. A PGFN retornou ainda ${extinct.length} inscrições extintas, preservadas no quadro complementar.`;
  const pending = ['CAPAG, rating e capacidade de pagamento não fornecidos pelas fontes coletadas.', 'Composição por principal, multa, juros e encargo das inscrições PGFN não fornecida nesta resposta.', 'Faturamento e demonstrações contábeis não recebidos.', 'Modalidade, elegibilidade, condições, descontos e prazos de negociação dependem de documentação e revisão técnica.', 'Referências judiciais, garantias e histórico de acordos/rescisões não informados. Ausência de informação não significa ausência de processos.', 'Regime tributário atual a confirmar; o SITFIS informa histórico de opção pelo Simples, sem confirmar o regime posterior.'];
  const recommendations = ['Conciliar os débitos em cobrança com pagamentos, declarações e eventuais parcelamentos.', 'Conferir separadamente os vencimentos e a situação dos registros de exigibilidade suspensa.', 'Obter composição das inscrições, CAPAG e condições oficiais disponíveis antes de simular descontos.', 'Conferir autenticidade e situação atual da certidão e levantar processos/garantias.', 'Submeter o parecer e a estratégia ao responsável técnico da FS.'];
  const conclusion = `${summary} Os dados suportam o levantamento e a conciliação do passivo. Não há base documental suficiente para calcular economia, entrada ou parcelas, concluir elegibilidade a transação ou propor garantia judicial. A emissão definitiva depende da revisão técnica e das pendências explicitadas.`;
  const supplements: NonNullable<DiagnosticReport['supplements']> = [
    { title: 'Receita Federal - composição e vencimentos', note: 'Fonte: SITFIS. O principal considerado é o saldo devedor, não o valor original. Não foi informado encargo separado.', headers: ['Referência / período', 'Vencimento', 'Original', 'Saldo devedor', 'Multa', 'Juros', 'Consolidado'], rows: rfb.active.map(r => [`${r.tax} · ${r.period}`, r.due, ...r.amounts.map(money)]) },
    { title: 'Receita Federal - registros fora do total em cobrança', note: `Seção “Débito com Exigibilidade Suspensa (SIEF)” da fonte. Saldo: ${money(upcoming)}. Os estados abaixo são transcritos do documento; não representam conclusão jurídica sobre suspensão. Valores separados do total em cobrança.`, headers: ['Tributo / período', 'Vencimento', 'Original', 'Saldo', 'Situação'], rows: rfb.suspended.map(r => [`${r.tax} · ${r.period}`, r.due, ...r.amounts.map(money), r.status]) },
  ];
  if (extinct.length) supplements.push({ title: 'PGFN - inscrições extintas', note: 'Registros retornados na mesma consulta. Excluídos do conjunto de inscrições ativas; saldo zero informado expressamente pela fonte.', headers: ['Inscrição', 'Situação', 'Saldo retornado', 'Inscrita em'], rows: extinct });
  return validateReport({ id: input.reportId, version: input.version, mode: 'real', company: { name: rfb.name, cnpj, regime: 'Regime atual não confirmado. Ver histórico de opção no documento SITFIS.' }, generatedAt: input.collectedAt,
    scope: 'Levantamento federal limitado às fontes coletadas, na data-base indicada. RFB e PGFN conciliadas por inscrição; as inscrições listadas no SITFIS não são somadas novamente à PGFN. Não inclui outras esferas tributárias nem atualização posterior.', summary, debts,
    sources: [{ id: 'rfb', title: 'Informações de apoio para emissão de certidão - SITFIS', provider: 'Receita Federal / Serpro Integra Contador', collectedAt: input.collectedAt, status: 'coletado', note: `Documento original preservado no acervo. SHA-256: ${input.rfbHash}. As informações PGFN do PDF foram usadas para conciliar natureza e processo, sem duplicação de valores.` }, { id: 'pgfn', title: 'Consulta Dívida Ativa - devedor', provider: 'PGFN / Serpro', collectedAt: input.collectedAt, status: 'coletado', note: `Resposta JSON preservada. SHA-256: ${input.pgfnHash}. ${pgfnDebts.length} inscrições ativas e ${extinct.length} extintas. Valores consolidados; composição não fornecida.` }],
    capag: { rating: null, amount: null, note: pending[0] }, sections: [], pending, recommendations, conclusion, supplements,
    opinion: { scenario: null, capagDebtBasis: null, capagBasisNote: 'Base específica da CAPAG não recebida; não substituir pelo total desta consulta.', annualRevenue: null, revenuePeriod: 'Não informado', deadline: null, releaseDate: null, windowNote: 'Não foi consultada modalidade ou janela oficial de negociação.', rescissionNote: 'Histórico de acordos e rescisões não informado nas fontes.', judicialNote: pending[4], certificateNote: rfb.certificate ? `O SITFIS registra certidão positiva com efeitos de negativa: ${rfb.certificate}. Este registro não é nova emissão nem verificação de autenticidade; confirmar a situação atual antes de utilização.` : 'Certidão não identificada; verificar documento específico.', capagReview: 'Reunir dados contábeis e demonstração econômica para avaliação técnica. Não há conclusão de cabimento de revisão nesta etapa.', legalBasis: [], actions: recommendations.map(action => ({ action, timing: 'Antes da emissão definitiva e de qualquer adesão' })), caveats: pending, conclusion },
  });
}

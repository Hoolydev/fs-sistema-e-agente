import { isJudicialStatus, normalizeCnpj, money, pgfnSituation, pgfnSituationLabels, validateReport, type Debt, type DiagnosticReport, type PgfnSituation } from './model';

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
  if (!/Final do Relatório/.test(text)) throw new Error('RFB_REPORT_INCOMPLETE');
  const lines = text.split('\n').filter(line => !/^(MINISTÉRIO|SECRETARIA ESPECIAL|PROCURADORIA-GERAL|INFORMAÇÕES DE APOIO|CNPJ:|Página:|-- \d+ of \d+ --)/.test(line));
  // O SITFIS só lista as seções que existem para o contribuinte. Cada título vem sublinhado ("Título ____").
  const sections: { title: string; lines: string[] }[] = [{ title: '', lines: [] }];
  for (const line of lines) {
    if (/_{5,}/.test(line)) { sections.push({ title: line.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim(), lines: [] }); continue; }
    if (line.trim()) sections.at(-1)!.lines.push(line.trim());
  }
  const ignored = (title: string) => title === '' || title === 'Final do Relatório' || /^(Dados Cadastrais da Matriz|Sócios e Administradores|Certidão Emitida|Diagnóstico Fiscal na )/.test(title);
  // Registros transcritos e mostrados à parte, sem somar ao passivo: omissões, parcelamentos e arrolamento.
  const informative = /^(Pendência - Omissão d|Parcelamento com Exigibilidade Suspensa \(|Débito com Exigibilidade Suspensa \(SICOB\)$|Processo de Arrolamento de Bens)/;
  const rowPattern = /^(.*?)\s+(\d{2}\/\d{4}|\dº TRIM\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.*)$/;
  const tableRows = (block: string[]) => block.join('\n').replace(/\b(\dº)\s*\n\s*TRIM\//g, '$1 TRIM/').split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('Receita PA/'));
  const active: { id: string; tax: string; period: string; due: string; amounts: number[]; status: string }[] = [];
  const suspended: typeof active = [];
  const sida = new Map<string, { tax: string; date: string; process: string }>();
  const records: { section: string; text: string }[] = [];
  const pattern = /(\d{2}\.\d\.\d{2}\.\d{6}-\d{2})\s+([\s\S]*?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{5}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s+DEVEDOR PRINCIPAL/g;
  for (const { title, lines: block } of sections) {
    if (ignored(title)) continue;
    if (title === 'Pendência - Débito (SIEF)') {
      // Exigible rows contain five monetary columns; suspended rows contain two.
      for (const line of tableRows(block)) {
        const match = line.match(rowPattern);
        if (!match) throw new Error('RFB_UNPARSED_ROW');
        const tokens = match[4].split(/\s+/), amounts = tokens.slice(0, 5).map(brlToCents), status = tokens.slice(5).join(' ');
        if (amounts.length !== 5 || status !== 'DEVEDOR' || amounts[1] + amounts[2] + amounts[3] !== amounts[4]) throw new Error('RFB_COMPONENT_MISMATCH');
        active.push({ id: `RFB-DEV-${String(active.length + 1).padStart(3, '0')}`, tax: match[1], period: match[2], due: match[3], amounts, status });
      }
    } else if (title === 'Débito com Exigibilidade Suspensa (SIEF)') {
      for (const line of tableRows(block)) {
        const match = line.match(rowPattern);
        if (!match) throw new Error('RFB_UNPARSED_ROW');
        const tokens = match[4].split(/\s+/), amounts = tokens.slice(0, 2).map(brlToCents), status = tokens.slice(2).join(' ');
        if (!status || amounts.length !== 2) throw new Error('RFB_UNPARSED_ROW');
        suspended.push({ id: `RFB-AV-${String(suspended.length + 1).padStart(3, '0')}`, tax: match[1], period: match[2], due: match[3], amounts, status });
      }
    } else if (/^(Pendência - Inscrição|Inscrição com Exigibilidade Suspensa) \(SIDA\)$/.test(title)) {
      const body = block.join('\n');
      let found = 0;
      for (const m of body.matchAll(pattern)) {
        const key = digits(m[1]);
        if (sida.has(key)) throw new Error('RFB_DUPLICATE_INSCRIPTION');
        sida.set(key, { tax: m[2].replace(/\s+/g, ' ').trim(), date: m[3], process: m[4] }); found++;
      }
      if ([...body.matchAll(/\d{2}\.\d\.\d{2}\.\d{6}-\d{2}/g)].length !== found) throw new Error('RFB_SIDA_UNPARSED_ROW');
    } else if (informative.test(title)) {
      const text = block.filter(x => !/^(Processo Localização|Conta)$/.test(x)).join(' · ');
      if (text) records.push({ section: title, text });
    } else throw new Error(`RFB_SECTION_UNSUPPORTED: ${title}`);
  }
  const certificate = text.match(/Certidão Positiva com Efeitos de Negativa:\s*([^\n]+)/)?.[1];
  return { name: name.trim(), active, suspended, sida, certificate, records };
}

// pgfnNotFound: a PGFN respondeu "CNPJ não encontrado" (sem inscrições); só então uma lista vazia é aceita.
export function reportFromSerpro(input: { cnpj: string; rfbText: string; pgfn: unknown; collectedAt: string; rfbHash: string; pgfnHash: string; reportId: string; version: number; pgfnNotFound?: boolean; annexes?: DiagnosticReport['annexes'] }): DiagnosticReport {
  const cnpj = normalizeCnpj(input.cnpj), rfb = parseRfb(input.rfbText, cnpj);
  if (!Array.isArray(input.pgfn) || (!input.pgfn.length && !input.pgfnNotFound)) throw new Error('PGFN_EMPTY_UNVERIFIED');
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
    // Ativa em qualquer variante (em cobrança, ajuizada, negociada no SISPAR...) compõe o passivo; situação desconhecida interrompe.
    if (!status.startsWith('ATIVA')) throw new Error('PGFN_STATUS_REQUIRES_REVIEW');
    const match = rfb.sida.get(key);
    if (match && digits(match.process) !== digits(String(raw.numeroProcesso))) throw new Error('PGFN_PROCESS_MISMATCH');
    pgfnDebts.push({ id, origin: 'PGFN', tax: match?.tax ?? 'Não discriminado na fonte', period: 'Não informado', status, administrativeProcess: nullable(raw.numeroProcesso), judicialProcess: nullable(raw.numeroJuizo) ?? (isJudicialStatus(status) ? 'Ajuizada (número do juízo não informado na fonte)' : null), registeredAt: nullable(raw.dataInscricao), principal: null, fine: null, interest: null, charges: null, total, sourceId: 'pgfn' });
  }
  if ([...rfb.sida.keys()].some(id => !pgfnDebts.some(d => digits(d.id) === id))) throw new Error('PGFN_RFB_RECONCILIATION_REQUIRED');
  const debts: Debt[] = [...rfb.active.map(row => ({ id: row.id, origin: 'RFB' as const, tax: row.tax, period: row.period, status: `${row.status} · vencimento ${row.due}`, administrativeProcess: null, judicialProcess: null, registeredAt: null, principal: row.amounts[1], fine: row.amounts[2], interest: row.amounts[3], charges: null, total: row.amounts[4], sourceId: 'rfb' })), ...pgfnDebts];
  const rfbTotal = rfb.active.reduce((sum, row) => sum + row.amounts[4], 0), pgfnTotal = pgfnDebts.reduce((sum, row) => sum + row.total, 0), upcoming = rfb.suspended.reduce((sum, row) => sum + row.amounts[1], 0);
  const bySituation = (['cobranca', 'negociada', 'suspensa', 'garantida'] as PgfnSituation[]).map(key => { const list = pgfnDebts.filter(d => pgfnSituation(d.status) === key); return { key, count: list.length, total: list.reduce((sum, d) => sum + d.total, 0) }; }).filter(g => g.count);
  const managed = bySituation.filter(g => g.key !== 'cobranca');
  // Parcelamentos e demais registros do SITFIS: transcritos e separados, nunca somados ao passivo.
  const installments = rfb.records.filter(r => r.section.startsWith('Parcelamento')), omissions = rfb.records.filter(r => r.section.startsWith('Pendência - Omissão'));
  const installmentValue = installments.reduce((sum, r) => sum + [...r.text.matchAll(/Valor Suspenso:\s*([\d.]+,\d{2})/g)].reduce((acc, m) => acc + brlToCents(m[1]), 0), 0);
  const rfbPart = rfb.active.length ? `${money(rfbTotal)} na Receita Federal (${rfb.active.length} registros em cobrança)` : 'nenhum débito em cobrança na Receita Federal';
  const summary = [
    `Foram identificados ${money(rfbTotal + pgfnTotal)} em passivo federal: ${rfbPart} e ${money(pgfnTotal)} na PGFN (${pgfnDebts.length} inscrições ativas).`,
    rfb.suspended.length ? `A seção de exigibilidade suspensa do SITFIS contém ${rfb.suspended.length} registros com saldo de ${money(upcoming)}, apresentados separadamente conforme a situação indicada na fonte, sem somar ao passivo.` : '',
    installments.length ? `O SITFIS registra ${installments.length === 1 ? 'uma seção' : `${installments.length} seções`} de parcelamento com exigibilidade suspensa${installmentValue ? ` (valor suspenso informado na Receita: ${money(installmentValue)})` : ''}, transcritas à parte e não somadas ao passivo.` : '',
    omissions.length ? `Há pendência de omissão de declaração no relatório de apoio à certidão: ${omissions.map(r => `${r.section.replace(/^Pendência - /, '').replace(/\*$/, '')}, ${r.text.split(' · ')[0].replace(/^\(Período de Apuração\)\s*/, 'período ')}`).join('; ')}.` : '',
    extinct.length ? `A PGFN retornou ainda ${extinct.length} ${extinct.length === 1 ? 'inscrição extinta, preservada' : 'inscrições extintas, preservadas'} no quadro complementar.` : '',
    managed.length ? `Das inscrições PGFN, ${managed.map(g => `${g.count} ${pgfnSituationLabels[g.key].toLowerCase()} (${money(g.total)})`).join(', ')} seguem no passivo, separadas do que está em cobrança.` : '',
  ].filter(Boolean).join(' ');
  const pending = ['CAPAG, rating e capacidade de pagamento não fornecidos pelas fontes coletadas.', 'Composição por principal, multa, juros e encargo das inscrições PGFN não fornecida nesta resposta.', 'Faturamento e demonstrações contábeis não recebidos.', 'Modalidade, elegibilidade, condições, descontos e prazos de negociação dependem de documentação e revisão técnica.', 'Referências judiciais, garantias e histórico de acordos/rescisões não informados. Ausência de informação não significa ausência de processos.', 'Regime tributário atual a confirmar; o SITFIS informa histórico de opção pelo Simples, sem confirmar o regime posterior.'];
  const recommendations = [...(omissions.length ? ['Regularizar a omissão de declaração apontada no SITFIS antes de solicitar nova certidão.'] : []), ...(installments.length ? ['Conferir a regularidade das parcelas dos parcelamentos listados no SITFIS e o saldo de cada um.'] : []), 'Conciliar os débitos em cobrança com pagamentos, declarações e eventuais parcelamentos.', 'Conferir separadamente os vencimentos e a situação dos registros de exigibilidade suspensa.', 'Obter composição das inscrições, CAPAG e condições oficiais disponíveis antes de simular descontos.', 'Conferir autenticidade e situação atual da certidão e levantar processos/garantias.', 'Submeter o parecer e a estratégia ao responsável técnico da FS.'];
  const conclusion = `${summary} Os dados suportam o levantamento e a conciliação do passivo. Não há base documental suficiente para calcular economia, entrada ou parcelas, concluir elegibilidade a transação ou propor garantia judicial. A emissão definitiva depende da revisão técnica e das pendências explicitadas.`;
  const supplements: NonNullable<DiagnosticReport['supplements']> = [];
  if (rfb.active.length) supplements.push({ title: 'Receita Federal - composição e vencimentos', note: 'Fonte: SITFIS. O principal considerado é o saldo devedor, não o valor original. Não foi informado encargo separado.', headers: ['Referência / período', 'Vencimento', 'Original', 'Saldo devedor', 'Multa', 'Juros', 'Consolidado'], rows: rfb.active.map(r => [`${r.tax} · ${r.period}`, r.due, ...r.amounts.map(money)]) });
  if (rfb.suspended.length) supplements.push({ title: 'Receita Federal - registros fora do total em cobrança', note: `Seção “Débito com Exigibilidade Suspensa (SIEF)” da fonte. Saldo: ${money(upcoming)}. Os estados abaixo são transcritos do documento; não representam conclusão jurídica sobre suspensão. Valores separados do total em cobrança.`, headers: ['Tributo / período', 'Vencimento', 'Original', 'Saldo', 'Situação'], rows: rfb.suspended.map(r => [`${r.tax} · ${r.period}`, r.due, ...r.amounts.map(money), r.status]) });
  if (rfb.records.length) supplements.push({ title: 'SITFIS - parcelamentos, omissões e demais registros', note: `Transcrição das seções do relatório de apoio à certidão.${installmentValue ? ` Valor suspenso em parcelamentos na Receita: ${money(installmentValue)}.` : ''} Registros apresentados à parte, sem somar ao passivo; a situação de cada parcelamento deve ser conferida.`, headers: ['Seção do SITFIS', 'Registro transcrito'], rows: rfb.records.map(r => [r.section, r.text]) });
  if (managed.length) supplements.push({ title: 'PGFN - inscrições ativas por situação', note: 'Situação transcrita da fonte. Inscrições negociadas, suspensas ou garantidas continuam no passivo inscrito.', headers: ['Situação', 'Inscrições', 'Valor consolidado'], rows: bySituation.map(g => [pgfnSituationLabels[g.key], String(g.count), money(g.total)]) });
  if (extinct.length) supplements.push({ title: 'PGFN - inscrições extintas', note: 'Registros retornados na mesma consulta. Excluídos do conjunto de inscrições ativas; saldo zero informado expressamente pela fonte.', headers: ['Inscrição', 'Situação', 'Saldo retornado', 'Inscrita em'], rows: extinct });
  return validateReport({ id: input.reportId, version: input.version, mode: 'real', company: { name: rfb.name, cnpj, regime: 'Regime atual não confirmado. Ver histórico de opção no documento SITFIS.' }, generatedAt: input.collectedAt,
    scope: 'Levantamento federal limitado às fontes coletadas, na data-base indicada. RFB e PGFN conciliadas por inscrição; as inscrições listadas no SITFIS não são somadas novamente à PGFN. Não inclui outras esferas tributárias nem atualização posterior.', summary, debts,
    sources: [{ id: 'rfb', title: 'Informações de apoio para emissão de certidão - SITFIS', provider: 'Receita Federal / Serpro Integra Contador', collectedAt: input.collectedAt, status: 'coletado', note: `Documento original preservado no acervo. SHA-256: ${input.rfbHash}. As informações PGFN do PDF foram usadas para conciliar natureza e processo, sem duplicação de valores.` }, { id: 'pgfn', title: 'Consulta Dívida Ativa - devedor', provider: 'PGFN / Serpro', collectedAt: input.collectedAt, status: 'coletado', note: `Resposta JSON preservada. SHA-256: ${input.pgfnHash}. ${pgfnDebts.length} inscrições ativas e ${extinct.length} extintas. Valores consolidados; composição não fornecida.` }],
    capag: { rating: null, amount: null, note: pending[0] }, sections: [], pending, recommendations, conclusion, supplements,
    ...(input.annexes?.length ? { annexes: input.annexes } : {}),
    opinion: { scenario: null, capagDebtBasis: null, capagBasisNote: 'Base específica da CAPAG não recebida; não substituir pelo total desta consulta.', annualRevenue: null, revenuePeriod: 'Não informado', deadline: null, releaseDate: null, windowNote: 'Não foi consultada modalidade ou janela oficial de negociação.', rescissionNote: 'Histórico de acordos e rescisões não informado nas fontes.', judicialNote: pending[4], certificateNote: rfb.certificate ? `O SITFIS registra certidão positiva com efeitos de negativa: ${rfb.certificate}. Este registro não é nova emissão nem verificação de autenticidade; confirmar a situação atual antes de utilização.` : 'Certidão não identificada; verificar documento específico.', capagReview: 'Reunir dados contábeis e demonstração econômica para avaliação técnica. Não há conclusão de cabimento de revisão nesta etapa.', legalBasis: [], actions: recommendations.map(action => ({ action, timing: 'Antes da emissão definitiva e de qualquer adesão' })), caveats: pending, conclusion },
  });
}

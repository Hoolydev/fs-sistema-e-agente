"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import CommercialWorkspace from "@/components/comercial/workspace";
import { TeamSettings } from "@/components/controller/team";
import { useController } from "@/components/controller/context";
import { deadlineQueue } from "@/lib/controller/metrics";
import { awaitingDispatch, daysUntil, fieldLabels, formatDay, reviewLabels, reviewStates, searchKey, type ControllerProcess } from "@/lib/controller/model";
import { formatCnpj } from "@/lib/diagnostico/model";
import { documentChecklist, requiredDocumentTypes } from "@/lib/documentos/tipos";
import { ArrowRight, ArrowUpRight, BriefcaseBusiness, Building2, Calculator, CalendarDays, Check, ChevronRight, CircleCheck, Clock3, Download, FileChartColumn, FolderOpen, Plus, RotateCcw, Scale, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge, Panel, Picker } from "./primitives";

function downloadCsv(name: string, rows: string[][]) {
  // Texto digitado que começa com =, +, - ou @ é neutralizado para não virar fórmula ao abrir no Excel.
  const cell = (c: string) => '"' + (/^[=+\-@\t\r]/.test(c) ? "'" + c : c).replace(/"/g, '""') + '"';
  const body = "\ufeff" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvHeader = ["Empresa", "CNPJ", "Objeto", "Status adm. / habilitação", "Data do protocolo", "Contagem", "Nº do processo adm.", "Última atualização", "Status", "Observações", "Revisão"];
const csvRow = (p: ControllerProcess) => [p.company, formatCnpj(p.cnpj), p.object, p.admStatus, formatDay(p.protocolDate), formatDay(p.deadline), p.processNumber, formatDay(p.updatedOn), p.dispatchStatus, p.notes, reviewLabels[p.reviewState]];
const stamp = () => new Date().toISOString().slice(0, 10);

function Summary({ items }: { items: { label: string; value: string; note: string; icon: typeof Clock3 }[] }) {
  return (
    <div className="summary-grid">
      {items.map((item) => (
        <div className="summary-card" key={item.label}>
          <div>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </div>
          <span className="summary-icon">
            <item.icon size={22} strokeWidth={1.5} />
          </span>
        </div>
      ))}
    </div>
  );
}
// Estados comuns a todas as telas que dependem dos registros do Controller.
function DataState() {
  const { loading, error, reload } = useController();
  if (loading) return <div className="panel empty-state"><Clock3 size={28} /><strong>Carregando registros…</strong></div>;
  if (error) return <div className="panel empty-state" role="alert"><TriangleAlert size={28} /><strong>Não foi possível carregar</strong><p>{error}</p><Button variant="outline" onClick={() => void reload()}>Tentar novamente</Button></div>;
  return null;
}
function Distribution({ rows, total }: { rows: { label: string; count: number }[]; total: number }) {
  if (!rows.length) return <div className="empty-state"><p>Sem registros.</p></div>;
  return (
    <div className="department-performance">
      {rows.map((d, i) => (
        <div key={d.label}>
          <div>
            <span>{d.label}</span>
            <strong>{d.count}</strong>
          </div>
          <div className="progress-line">
            <i style={{ width: `${total ? (d.count / total) * 100 : 0}%`, background: i % 2 ? "#bd974e" : "#234761" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
const monthName = (month: string) => new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`)).replace(".", "");
function MonthBars({ rows }: { rows: { month: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <div className="empty-state"><p>Nenhum protocolo registrado.</p></div>;
  return (
    <div className="ctrl-months" role="img" aria-label={`Protocolos por mês: ${rows.map((r) => `${monthName(r.month)} ${r.count}`).join(", ")}`}>
      {rows.map((r) => (
        <div key={r.month}>
          <span>{r.count}</span>
          <i style={{ height: Math.max(4, Math.round((r.count / max) * 120)) }} />
          <small>{monthName(r.month)}</small>
        </div>
      ))}
    </div>
  );
}
function Countdown({ process }: { process: ControllerProcess }) {
  const days = daysUntil(process.deadline);
  if (days === null) return <span className="muted">—</span>;
  if (!awaitingDispatch(process)) return <>{formatDay(process.deadline)}</>;
  return <span className={days < 0 ? "ctrl-late" : days <= 7 ? "gold-text" : undefined}>{formatDay(process.deadline)}<small>{days < 0 ? `encerrada há ${-days} d` : days === 0 ? "encerra hoje" : `faltam ${days} d`}</small></span>;
}
function ProcessList({ rows, empty }: { rows: ControllerProcess[]; empty: string }) {
  const { open } = useController();
  return (
    <>
      <div className="desktop-process-table"><Table className="process-table ctrl-table">
        <TableHeader>
          <TableRow>
            {["Empresa", "Status adm.", "Nº do processo", "Contagem", "Status", "Observações", "Revisão", ""].map((h, i) => <TableHead key={i}>{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <button className="client-link" onClick={() => open(p)}>
                  <strong>{p.company}</strong>
                  <small>{formatCnpj(p.cnpj)} · {p.object}</small>
                </button>
              </TableCell>
              <TableCell><Badge>{p.admStatus}</Badge></TableCell>
              <TableCell className="date-cell">{p.processNumber || "—"}<small>{p.protocolDate ? `protocolo em ${formatDay(p.protocolDate)}` : "sem protocolo"}</small></TableCell>
              <TableCell className="date-cell"><Countdown process={p} /></TableCell>
              <TableCell><Badge>{p.dispatchStatus}</Badge></TableCell>
              <TableCell className="ctrl-notes-cell" title={p.notes}><span>{p.notes || "—"}</span></TableCell>
              <TableCell><Badge>{reviewLabels[p.reviewState]}</Badge></TableCell>
              <TableCell>
                <button className="row-action" aria-label={`Abrir processo de ${p.company}`} onClick={() => open(p)}>
                  <ChevronRight size={17} />
                </button>
              </TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={8}>
                <div className="empty-state"><Search /><strong>{empty}</strong></div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table></div>
      <div className="mobile-process-list">
        {rows.map((p) => (
          <button className="mobile-process-card" key={p.id} onClick={() => open(p)} aria-label={`Abrir processo de ${p.company}`}>
            <span className="mobile-process-title"><span><strong>{p.company}</strong><small>{formatCnpj(p.cnpj)} · {p.processNumber || "sem nº"}</small></span><ChevronRight size={18}/></span>
            <span className="mobile-process-department">{p.object} · {p.notes || "sem observações"}</span>
            <span className="mobile-process-state"><Badge>{p.dispatchStatus}</Badge><span><CalendarDays size={14}/>{formatDay(p.deadline)}</span></span>
            <span className="mobile-process-owner"><Badge>{reviewLabels[p.reviewState]}</Badge><span>Atualizado em {formatDay(p.updatedOn)}</span></span>
          </button>
        ))}
        {!rows.length && <div className="empty-state"><Search/><strong>{empty}</strong></div>}
      </div>
    </>
  );
}
function Deadlines({ limit }: { limit?: number }) {
  const { processes, open } = useController();
  const queue = deadlineQueue(processes);
  return (
    <>
      <div className="priorities">
        {queue.slice(0, limit).map((p) => {
          const days = daysUntil(p.deadline) ?? 0;
          return (
            <button key={p.id} className="priority" onClick={() => open(p)}>
              <span className={`priority-icon ${days < 0 ? "urgent" : ""}`}><Clock3 size={20} strokeWidth={1.6} /></span>
              <span className="priority-content">
                <strong>{p.company}</strong>
                <small>{p.notes || p.object}</small>
              </span>
              <span className="due">
                <small>{days < 0 ? "Encerrada em" : "Encerra em"}</small>
                <strong>{formatDay(p.deadline)}</strong>
              </span>
              <ChevronRight size={16} />
            </button>
          );
        })}
        {!queue.length && <div className="empty-state"><CircleCheck size={28} /><p>Nenhum processo aguardando despacho.</p></div>}
      </div>
      {queue.length > 0 && <div className="priority-foot"><span className="tiny-dot" />{queue.length} {queue.length === 1 ? "processo aguarda" : "processos aguardam"} despacho da Receita Federal</div>}
    </>
  );
}
function overview(m: ReturnType<typeof useController>["metrics"], review: boolean, inbox: number) {
  return [
    { label: "Processos acompanhados", value: String(m.total), note: `${m.companies} ${m.companies === 1 ? "empresa" : "empresas"} no Controller`, icon: BriefcaseBusiness },
    { label: "Aguardando despacho", value: String(m.awaiting), note: `${m.dispatched} com despacho · ${m.archived} arquivado${m.archived === 1 ? "" : "s"}`, icon: Clock3 },
    { label: "Contagem encerrada", value: String(m.overdue), note: `Sem despacho · ${m.dueSoon} encerra${m.dueSoon === 1 ? "" : "m"} em até 7 dias`, icon: TriangleAlert },
    { label: review ? "Aguardando sua revisão" : "Ajustes pedidos", value: String(inbox), note: review ? "Registros incluídos ou editados pela equipe" : `${m.pendingReview} aguardando revisão`, icon: ShieldCheck },
  ];
}
function Home() {
  const { processes, metrics, allowed, inbox, loading, error } = useController();
  if (loading || error) return <DataState />;
  return (
    <>
      <Summary items={overview(metrics, allowed.review, inbox.length)} />
      <div className="overview-grid">
        <Panel title="Situação dos processos" subtitle="Distribuição por status na Receita Federal" action={<span className="small-label">{metrics.lastUpdate ? `Atualizado em ${formatDay(metrics.lastUpdate)}` : ""}</span>}>
          <Distribution rows={metrics.byDispatch} total={metrics.total} />
        </Panel>
        <Panel title="Contagens e prazos" subtitle="Processos sem despacho, da contagem mais antiga para a mais recente" action={<Link className="text-link" href="/controller">Ver todos <ArrowUpRight size={14} /></Link>}>
          <Deadlines limit={4} />
        </Panel>
      </div>
      <Panel title="Acompanhamento dos processos" subtitle="Atualizações mais recentes do Controller" action={<Link className="text-link" href="/controller">Ver todos os processos <ArrowRight size={15} /></Link>} className="table-panel">
        <ProcessList rows={[...processes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)} empty="Nenhum processo registrado" />
        <div className="table-footer">
          <span>Exibindo {Math.min(processes.length, 5)} de {processes.length} processos</span>
          <Link href="/controller">Abrir o Controller <ChevronRight size={14} /></Link>
        </div>
      </Panel>
    </>
  );
}
function Executive() {
  const { metrics, allowed, inbox, loading, error } = useController();
  if (loading || error) return <DataState />;
  return (
    <>
      <Summary items={overview(metrics, allowed.review, inbox.length)} />
      <div className="analytics-grid">
        <Panel title="Status na Receita Federal" subtitle="Processos por situação do despacho">
          <Distribution rows={metrics.byDispatch} total={metrics.total} />
        </Panel>
        <Panel title="Encaminhamento atual" subtitle="Processos por observação registrada no Controller">
          <Distribution rows={metrics.byNotes} total={metrics.total} />
        </Panel>
      </div>
      <div className="analytics-grid">
        <Panel title="Protocolos por mês" subtitle="Quantidade de processos pela data do protocolo">
          <MonthBars rows={metrics.byMonth} />
        </Panel>
        <Panel title="Status administrativo" subtitle="Situação da habilitação">
          <Distribution rows={metrics.byAdmStatus} total={metrics.total} />
        </Panel>
      </div>
    </>
  );
}
function Indicators() {
  const { processes, metrics, loading, error } = useController();
  if (loading || error) return <DataState />;
  const reviewed = processes.filter((p) => p.reviewState === "aprovado").length;
  return (
    <>
      <Summary
        items={[
          { label: "Contagem encerrada", value: String(metrics.overdue), note: "Sem despacho da Receita Federal", icon: TriangleAlert },
          { label: "Encerram em até 7 dias", value: String(metrics.dueSoon), note: "Contagens ainda em curso", icon: Clock3 },
          { label: "Registros revisados", value: `${reviewed} de ${metrics.total}`, note: `${metrics.pendingReview} aguardando revisão · ${metrics.adjustments} com ajustes`, icon: ShieldCheck },
          { label: "Última atualização", value: formatDay(metrics.lastUpdate), note: "Data mais recente informada nos registros", icon: CalendarDays },
        ]}
      />
      <div className="analytics-grid">
        <Panel title="Contagens em aberto" subtitle="Processos sem despacho, da contagem mais antiga para a mais recente">
          <Deadlines />
        </Panel>
        <Panel title="Protocolos por mês" subtitle="Quantidade de processos pela data do protocolo">
          <MonthBars rows={metrics.byMonth} />
        </Panel>
      </div>
      <Panel title="Revisão dos registros" subtitle="Situação dos registros do Controller na esteira de revisão">
        <Distribution rows={reviewStates.map((s) => ({ label: reviewLabels[s], count: processes.filter((p) => p.reviewState === s).length }))} total={metrics.total} />
      </Panel>
    </>
  );
}
function ControllerView() {
  const { processes, metrics, allowed, inbox, open, notify, loading, error } = useController();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos os status");
  const [tab, setTab] = useState("todos");
  if (loading || error) return <DataState />;
  const term = searchKey(query);
  const rows = processes.filter((p) =>
    (status === "Todos os status" || p.dispatchStatus === status) &&
    (tab === "todos" || (tab === "abertos" ? awaitingDispatch(p) : p.reviewState !== "aprovado")) &&
    (!term || [p.company, p.cnpj, p.processNumber, p.notes].some((v) => searchKey(v).includes(term))));
  const ordered = tab === "abertos" ? deadlineQueue(rows).concat(rows.filter((p) => !p.deadline)) : rows;
  return (
    <>
      <Summary items={overview(metrics, allowed.review, inbox.length)} />
      <Panel
        title="Gestão de processos"
        subtitle="Procedimento administrativo e prazo — habilitação e acompanhamento na Receita Federal"
        action={
          <div className="ctrl-panel-actions">
            <Button variant="outline" disabled={!rows.length} onClick={() => { downloadCsv(`controller-processos-${stamp()}.csv`, [csvHeader, ...ordered.map(csvRow)]); notify("Lista exportada em CSV."); }}>
              <Download size={15} />
              Exportar lista
            </Button>
            {allowed.create && <Button onClick={() => open("novo")}><Plus size={16} />Novo processo</Button>}
          </div>
        }
      >
        <Tabs value={tab} onValueChange={setTab} className="operation-tabs">
          <TabsList variant="line">
            <TabsTrigger value="todos">Todos os processos</TabsTrigger>
            <TabsTrigger value="abertos">Aguardando despacho</TabsTrigger>
            <TabsTrigger value="revisao">Em revisão</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={16} />
            <Input placeholder="Buscar empresa, CNPJ ou nº do processo..." aria-label="Buscar empresa, CNPJ ou número do processo" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <Picker label="Filtrar status" value={status} onChange={setStatus} options={["Todos os status", ...metrics.byDispatch.map((d) => d.label)]} />
        </div>
        <ProcessList rows={ordered} empty={processes.length ? "Nenhum processo encontrado para os filtros" : "Nenhum processo registrado"} />
        <div className="table-footer">
          <span>{ordered.length} de {processes.length} processos</span>
          <span>{metrics.lastUpdate ? `Última atualização informada: ${formatDay(metrics.lastUpdate)}` : ""}</span>
        </div>
      </Panel>
    </>
  );
}
function Administrative() {
  const { processes, companies, allowed, openCompany, loading, error } = useController();
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState<{ cnpj: string; docType?: string | null; kind: string }[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/documentos", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { documents: [] })).then((d) => { if (active) setDocs(d.documents ?? []); }).catch(() => {});
    return () => { active = false; };
  }, [processes, companies]);
  if (loading || error) return <DataState />;
  const term = searchKey(query);
  const rows = companies.filter((c) => !term || searchKey(c.name).includes(term) || c.cnpj.includes(term)).map((c) => {
    const own = processes.filter((p) => p.cnpj === c.cnpj), checklist = documentChecklist(docs.filter((d) => d.cnpj === c.cnpj));
    return { ...c, own, done: checklist.filter((i) => i.done).length, total: checklist.length, updatedOn: own.map((p) => p.updatedOn ?? "").sort().at(-1) || null };
  });
  const complete = companies.filter((c) => documentChecklist(docs.filter((d) => d.cnpj === c.cnpj)).every((i) => i.done)).length;
  return (
    <>
      <Summary
        items={[
          { label: "Empresas", value: String(companies.length), note: `${companies.filter((c) => c.registered).length} com cadastro próprio`, icon: Building2 },
          { label: "Documentação completa", value: String(complete), note: `${requiredDocumentTypes.length} documentos obrigatórios por empresa`, icon: CircleCheck },
          { label: "Documentação pendente", value: String(companies.length - complete), note: "Empresas com algum documento faltando", icon: TriangleAlert },
          { label: "No Controller", value: String(new Set(processes.map((p) => p.cnpj)).size), note: "Empresas com processo em andamento", icon: BriefcaseBusiness },
        ]}
      />
      <Panel title="Base de clientes" subtitle="Empresas cadastradas; é daqui que elas seguem para o Controller" action={allowed.create ? <Button onClick={() => openCompany("nova")}><Plus size={16} />Nova empresa</Button> : undefined}>
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={16} />
            <Input aria-label="Buscar empresa ou CNPJ" placeholder="Buscar empresa ou CNPJ..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <span className="small-label">{companies.length} {companies.length === 1 ? "empresa" : "empresas"}</span>
        </div>
        <Table className="process-table">
          <TableHeader>
            <TableRow>
              {["Empresa", "CNPJ", "Documentação", "Processos", "Última atualização", ""].map((s, i) => <TableHead key={i}>{s}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.cnpj}>
                <TableCell>
                  <button className="company-cell" onClick={() => openCompany(c.cnpj)}>
                    <span className="company-icon"><Building2 size={19} /></span>
                    <span><strong>{c.name}</strong><small>{c.registered ? `Cadastrada por ${c.createdBy}` : "Presente só no Controller"}</small></span>
                  </button>
                </TableCell>
                <TableCell>{formatCnpj(c.cnpj)}</TableCell>
                <TableCell><Badge>{c.done === c.total ? "Completa" : `${c.done} de ${c.total}`}</Badge></TableCell>
                <TableCell>{c.own.length}</TableCell>
                <TableCell>{formatDay(c.updatedOn)}</TableCell>
                <TableCell>
                  <button className="row-action" aria-label={`Abrir empresa ${c.name}`} onClick={() => openCompany(c.cnpj)}><ChevronRight size={17} /></button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && <div className="empty-state"><Search /><strong>{companies.length ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"}</strong></div>}
      </Panel>
    </>
  );
}
function EmptyModule({ screen }: { screen: string }) {
  const legal = screen === "juridico";
  return (
    <>
      <div className="panel empty-state ctrl-empty-module">
        {legal ? <Scale size={34} strokeWidth={1.4} /> : <Calculator size={34} strokeWidth={1.4} />}
        <strong>Nenhum registro neste módulo</strong>
        <p>{legal ? "As demandas jurídicas ainda não são registradas aqui." : "As análises contábeis e fiscais ainda não são registradas aqui."} Os processos administrativos em andamento estão no Controller.</p>
        <Link className="text-link" href="/controller">Abrir o Controller <ArrowRight size={14} /></Link>
      </div>
    </>
  );
}
function Approvals() {
  const { processes, allowed, inbox, open, loading, error } = useController();
  const [tab, setTab] = useState("pendentes");
  if (loading || error) return <DataState />;
  const waiting = processes.filter((p) => p.reviewState === "pendente");
  const adjustments = processes.filter((p) => p.reviewState === "ajustes");
  const visible = tab === "pendentes" ? waiting : tab === "ajustes" ? adjustments : processes.filter((p) => p.reviewState === "aprovado" && p.reviewedAt).sort((a, b) => b.reviewedAt!.localeCompare(a.reviewedAt!)).slice(0, 30);
  return (
    <>
      <Summary
        items={[
          { label: "Aguardando revisão", value: String(waiting.length), note: allowed.review ? "Disponíveis para sua decisão" : "Na fila dos revisores", icon: ShieldCheck },
          { label: "Ajustes solicitados", value: String(adjustments.length), note: allowed.review ? "Devolvidos a quem incluiu" : "Corrija e salve para reenviar", icon: RotateCcw },
          { label: "Registros revisados", value: String(processes.length - waiting.length - adjustments.length), note: `De ${processes.length} registros no Controller`, icon: CircleCheck },
          { label: "Sua fila", value: String(inbox.length), note: allowed.review ? "Perfil revisor" : "Perfil de inclusão de dados", icon: Clock3 },
        ]}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="standalone-tabs">
          <TabsTrigger value="pendentes">Aguardando revisão <span className="tab-counter">{waiting.length}</span></TabsTrigger>
          <TabsTrigger value="ajustes">Ajustes solicitados <span className="tab-counter">{adjustments.length}</span></TabsTrigger>
          <TabsTrigger value="historico">Revisados</TabsTrigger>
        </TabsList>
        <div className="approval-grid">
          {visible.map((p) => (
            <section className="panel approval-card" key={p.id}>
              <div className="approval-top">
                <span className="priority-icon"><ShieldCheck size={20} /></span>
                <Badge>{reviewLabels[p.reviewState]}</Badge>
              </div>
              <small className="eyebrow">{p.object}</small>
              <h2>{p.company}</h2>
              <p>{formatCnpj(p.cnpj)} · {p.processNumber || "sem nº de processo"}</p>
              {p.reviewState === "ajustes" && <p className="ctrl-alert">{p.reviewNote}</p>}
              <div className="approval-meta">
                <div><small>{p.reviewState === "aprovado" ? "Revisado por" : "Salvo por"}</small><strong>{p.reviewState === "aprovado" ? p.reviewedBy : p.updatedBy}</strong></div>
                <div><small>{fieldLabels.dispatchStatus}</small><strong>{p.dispatchStatus}</strong></div>
              </div>
              <div className="approval-actions">
                <Button variant={allowed.review && p.reviewState === "pendente" ? "default" : "outline"} onClick={() => open(p)}>
                  {allowed.review && p.reviewState === "pendente" ? <><Check size={16} />Revisar registro</> : <>Abrir registro <ArrowUpRight size={14} /></>}
                </Button>
              </div>
            </section>
          ))}
        </div>
        {!visible.length && (
          <div className="panel empty-state">
            <CircleCheck size={32} />
            <strong>{tab === "pendentes" ? "Tudo revisado por aqui" : tab === "ajustes" ? "Nenhum ajuste em aberto" : "Nenhuma revisão registrada"}</strong>
            <p>{tab === "pendentes" ? "Registros incluídos ou editados pela equipe de inclusão aparecem aqui para revisão." : tab === "ajustes" ? "Os pedidos de ajuste feitos pelos revisores aparecem aqui." : "As decisões dos revisores aparecerão aqui."}</p>
          </div>
        )}
      </Tabs>
    </>
  );
}
function Reports() {
  const { processes, metrics, notify, loading, error } = useController();
  if (loading || error) return <DataState />;
  const open = deadlineQueue(processes);
  const reports = [
    { title: "Processos do Controller", text: "Todos os registros com status, contagem, observações e situação de revisão.", icon: BriefcaseBusiness, area: "Operação", count: processes.length, run: () => downloadCsv(`controller-processos-${stamp()}.csv`, [csvHeader, ...processes.map(csvRow)]) },
    { title: "Contagens em aberto", text: "Processos sem despacho, da contagem mais antiga para a mais recente.", icon: Clock3, area: "Prazos", count: open.length, run: () => downloadCsv(`controller-contagens-${stamp()}.csv`, [csvHeader, ...open.map(csvRow)]) },
    { title: "Fila de revisão", text: "Registros aguardando revisão ou com ajustes solicitados.", icon: ShieldCheck, area: "Governança", count: metrics.pendingReview + metrics.adjustments, run: () => downloadCsv(`controller-revisao-${stamp()}.csv`, [csvHeader, ...processes.filter((p) => p.reviewState !== "aprovado").map(csvRow)]) },
  ];
  return (
    <>
      <div className="section-toolbar">
        <div>
          <h2>Relatórios do escritório</h2>
          <p>Exportações geradas na hora a partir dos registros do sistema.</p>
        </div>
      </div>
      <div className="report-grid">
        {reports.map((r) => (
          <section className="panel report-card" key={r.title}>
            <span className="report-icon"><r.icon size={26} strokeWidth={1.5} /></span>
            <small className="eyebrow">{r.area}</small>
            <h2>{r.title}</h2>
            <p>{r.text}</p>
            <div>
              <span>{r.count} {r.count === 1 ? "registro" : "registros"}</span>
              <Button variant="outline" disabled={!r.count} onClick={() => { r.run(); notify("Relatório exportado em CSV."); }}>
                <Download size={15} /> Exportar CSV
              </Button>
            </div>
          </section>
        ))}
        <section className="panel report-card">
          <span className="report-icon"><FileChartColumn size={26} strokeWidth={1.5} /></span>
          <small className="eyebrow">Diagnóstico fiscal</small>
          <h2>Pareceres e diagnósticos</h2>
          <p>Pareceres emitidos e documentos de apoio ficam no acervo, agrupados por empresa.</p>
          <div>
            <span>Acervo de documentos</span>
            <Button variant="outline" asChild><Link href="/documentos"><FolderOpen size={15} /> Abrir acervo</Link></Button>
          </div>
        </section>
      </div>
    </>
  );
}
export default function ModuleView({ screen }: { screen: string }) {
  switch (screen) {
    case "inicio":
      return <Home />;
    case "painel-executivo":
      return <Executive />;
    case "indicadores":
      return <Indicators />;
    case "comercial":
      return <CommercialWorkspace />;
    case "administrativo":
      return <Administrative />;
    case "controller":
      return <ControllerView />;
    case "contabilidade":
    case "juridico":
      return <EmptyModule screen={screen} />;
    case "aprovacoes":
      return <Approvals />;
    case "relatorios":
      return <Reports />;
    case "configuracoes":
      return <TeamSettings />;
    default:
      return null;
  }
}

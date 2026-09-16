"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import CommercialWorkspace from "@/components/comercial/workspace";
import {
  Building2,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Search,
  Download,
  FileText,
  FolderOpen,
  ChevronRight,
  BriefcaseBusiness,
  Clock3,
  CircleCheck,
  ChartNoAxesCombined,
  Scale,
  Calculator,
  MoreHorizontal,
  Check,
  RotateCcw,
  CheckCheck,
  Users,
  ShieldCheck,
  Mail,
  Link2,
  Monitor,
  Save,
  Bell,
  Settings,
  FileChartColumn,
  Eye,
  SlidersHorizontal,
  CalendarDays,
  TriangleAlert,
  CircleDollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Badge,
  Panel,
  Picker,
  ProcessTable,
  Stats,
  SlaChart,
} from "./dashboard";
import { processes, type Process } from "./data";

type ViewProps = {
  screen: string;
  period: string;
  onSelect: (p: Process) => void;
  notify: (s: string) => void;
};
const departmentData = [
  { label: "Administrativo / Cadastro", value: 94, total: 46 },
  { label: "Contabilidade", value: 89, total: 38 },
  { label: "Jurídico", value: 86, total: 35 },
  { label: "Comercial", value: 92, total: 19 },
  { label: "Controller", value: 96, total: 10 },
];
function downloadCsv(name: string, rows: string[][]) {
  const body =
    "\ufeff" +
    rows
      .map((r) => r.map((c) => '"' + c.replace(/"/g, '""') + '"').join(";"))
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([body], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Summary({
  items,
}: {
  items: { label: string; value: string; note: string; icon: typeof Users }[];
}) {
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
function Bars({ period }: { period: string }) {
  const values =
    period === "Agosto de 2026"
      ? [38, 45, 41, 57, 64, 70]
      : [45, 41, 57, 64, 70, 83];
  const months =
    period === "Agosto de 2026"
      ? ["Mar", "Abr", "Mai", "Jun", "Jul", "Ago"]
      : ["Abr", "Mai", "Jun", "Jul", "Ago", "Set"];
  return (
    <div
      className="bar-chart"
      role="img"
      aria-label={`Processos concluídos: ${months.map((m, i) => `${m} ${values[i]}`).join(", ")}`}
    >
      <div className="chart-scale">
        {[100, 75, 50, 25, 0].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div className="chart-plot">
        <div className="chart-grid" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        {values.map((value, i) => (
          <div className="bar-column" key={i}>
            <div className="bar-space">
              <div
                className={`chart-bar ${i === 5 ? "highlight" : ""}`}
                style={{ height: `${value}%` }}
              >
                <span>{value}</span>
              </div>
            </div>
            <small>{months[i]}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
function Performance() {
  return (
    <div className="department-performance">
      {departmentData.map((d, i) => (
        <div key={d.label}>
          <div>
            <span>{d.label}</span>
            <strong>{d.value}%</strong>
          </div>
          <div className="progress-line">
            <i
              style={{
                width: `${d.value}%`,
                background: i === 2 ? "#bd974e" : "#234761",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
function Executive({ period }: ViewProps) {
  return (
    <>
      <Stats kind="executive" period={period} />
      <div className="analytics-grid">
        <Panel
          title="Evolução das entregas"
          subtitle="Processos concluídos nos últimos seis meses"
          action={
            <span className="chart-key">
              <i className="legend-dot navy" />
              Concluídos
            </span>
          }
        >
          <Bars period={period} />
        </Panel>
        <Panel
          title="Eficiência por departamento"
          subtitle="Entregas realizadas dentro do prazo"
        >
          <Performance />
          <div className="panel-bottom">
            <CircleCheck size={16} />
            <span>Meta do escritório: 90% de entregas no prazo</span>
          </div>
        </Panel>
      </div>
      <div className="analytics-grid">
        <Panel
          title="Composição da carteira"
          subtitle="Clientes ativos por frente de atuação"
        >
          <div className="portfolio-list">
            {[
              ["Planejamento tributário", "36 clientes", "39%", 39],
              ["Recuperação de créditos", "28 clientes", "31%", 31],
              ["Transação tributária", "18 clientes", "20%", 20],
              ["Contencioso tributário", "10 clientes", "10%", 10],
            ].map(([name, count, pct, width], i) => (
              <div key={name}>
                <span className={`portfolio-icon color-${i}`}>
                  <BriefcaseBusiness size={18} />
                </span>
                <div>
                  <strong>{name}</strong>
                  <small>{count}</small>
                </div>
                <span className="portfolio-track">
                  <i style={{ width: `${Number(width) * 2}%` }} />
                </span>
                <b>{pct}</b>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Objetivos do trimestre"
          subtitle="Julho — setembro de 2026"
        >
          <div className="objective-list">
            {[
              ["Novos clientes", "18 / 24", 75],
              ["Receita de honorários", "R$ 486 mil / R$ 600 mil", 81],
              ["Satisfação dos clientes", "96% / 95%", 100],
            ].map(([title, value, pct]) => (
              <div key={title}>
                <div>
                  <strong>{title}</strong>
                  <span>{value}</span>
                </div>
                <div className="progress-line">
                  <i style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
function Indicators({ period }: ViewProps) {
  return (
    <>
      <Stats kind="indicators" period={period} />
      <div className="analytics-grid">
        <Panel
          title="SLA por departamento"
          subtitle="Percentual de entregas realizadas no prazo"
        >
          <Performance />
        </Panel>
        <Panel
          title="Volume de entregas"
          subtitle="Evolução mensal de processos concluídos"
        >
          <Bars period={period} />
        </Panel>
      </div>
      <Panel
        title="Desempenho operacional"
        subtitle="Indicadores para acompanhar a qualidade de cada área"
      >
        <Table className="process-table">
          <TableHeader>
            <TableRow>
              {[
                "Departamento",
                "Processos ativos",
                "SLA no prazo",
                "Tempo médio",
                "Avaliação",
              ].map((t) => (
                <TableHead key={t}>{t}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {departmentData.map((d, i) => (
              <TableRow key={d.label}>
                <TableCell>
                  <strong>{d.label}</strong>
                </TableCell>
                <TableCell>{d.total}</TableCell>
                <TableCell>
                  <span className={d.value >= 90 ? "positive" : "gold-text"}>
                    {d.value}%
                  </span>
                </TableCell>
                <TableCell>{[3.2, 4.8, 5.4, 2.1, 3.8][i]} dias</TableCell>
                <TableCell>
                  <Badge>{d.value >= 90 ? "Regular" : "Em análise"}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </>
  );
}
function CreateSheet({
  open,
  onOpenChange,
  title,
  label,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  label: string;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="detail-sheet">
        <SheetHeader>
          <span className="eyebrow">DEMONSTRAÇÃO</span>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            Preencha os dados para visualizar o cadastro nesta sessão.
          </SheetDescription>
        </SheetHeader>
        <form
          className="sheet-body fs-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSave(name.trim());
            setName("");
            onOpenChange(false);
          }}
        >
          <div className="form-field">
            <Label htmlFor="entry-name">{label}</Label>
            <Input
              id="entry-name"
              autoComplete="off"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Horizonte Comércio Ltda."
            />
          </div>
          <div className="form-field">
            <Label htmlFor="entry-contact">Nome do contato</Label>
            <Input id="entry-contact" placeholder="Nome completo" />
          </div>
          <div className="form-field">
            <Label htmlFor="entry-email">E-mail</Label>
            <Input
              type="email"
              id="entry-email"
              placeholder="contato@empresa.com.br"
            />
          </div>
          <div className="form-field">
            <Label htmlFor="entry-notes">Observações</Label>
            <Textarea
              id="entry-notes"
              placeholder="Informações importantes para a equipe..."
            />
          </div>
          <p className="demo-note">
            Os dados ficam disponíveis apenas nesta demonstração e são
            descartados ao recarregar a página.
          </p>
          <Button type="submit">
            <Plus size={16} />
            Adicionar à demonstração
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
function Administrative({ onSelect, notify }: ViewProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);
  const clients = [...processes.map((p) => p.client), ...extra];
  return (
    <>
      <Summary
        items={[
          {
            label: "Clientes cadastrados",
            value: String(92 + extra.length),
            note: "Empresas em acompanhamento",
            icon: Building2,
          },
          {
            label: "Cadastros completos",
            value: "84",
            note: "91% da base de clientes",
            icon: CircleCheck,
          },
          {
            label: "Documentos pendentes",
            value: "8",
            note: "Aguardando envio do cliente",
            icon: FileText,
          },
          {
            label: "Novos cadastros",
            value: "8",
            note: "Neste mês",
            icon: Users,
          },
        ]}
      />
      <Panel
        title="Base de clientes"
        subtitle="Informações e situação cadastral"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} />
            Novo cliente
          </Button>
        }
      >
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={16} />
            <Input
              aria-label="Buscar cliente"
              placeholder="Buscar empresa..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <span className="small-label">
            {clients.length} clientes nesta demonstração
          </span>
        </div>
        <Table className="process-table">
          <TableHeader>
            <TableRow>
              {[
                "Empresa",
                "Regime tributário",
                "Documentação",
                "Responsável",
                "Cadastro",
                "",
              ].map((s, i) => (
                <TableHead key={i}>{s}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients
              .filter((c) => c.toLowerCase().includes(query.toLowerCase()))
              .map((c, i) => (
                <TableRow key={c}>
                  <TableCell>
                    <button
                      className="company-cell"
                      onClick={() =>
                        onSelect({
                          ...processes[i % 6],
                          client: c,
                          subject: "Cadastro do cliente",
                        })
                      }
                    >
                      <span className="company-icon">
                        <Building2 size={19} />
                      </span>
                      <span>
                        <strong>{c}</strong>
                        <small>Goiânia · GO</small>
                      </span>
                    </button>
                  </TableCell>
                  <TableCell>
                    {
                      ["Lucro presumido", "Lucro real", "Simples Nacional"][
                        i % 3
                      ]
                    }
                  </TableCell>
                  <TableCell>
                    <Badge>{i === 3 ? "Em análise" : "Regular"}</Badge>
                  </TableCell>
                  <TableCell>{processes[i % 6].owner}</TableCell>
                  <TableCell>{i === 3 ? "08/09/2026" : "02/09/2026"}</TableCell>
                  <TableCell>
                    <button
                      className="row-action"
                      aria-label={`Ver cadastro de ${c}`}
                      onClick={() =>
                        onSelect({
                          ...processes[i % 6],
                          client: c,
                          subject: "Cadastro do cliente",
                        })
                      }
                    >
                      <ChevronRight size={17} />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {!clients.some((c) =>
          c.toLowerCase().includes(query.toLowerCase()),
        ) && (
          <div className="empty-state">
            <Search />
            <strong>Nenhum cliente encontrado</strong>
          </div>
        )}
      </Panel>
      <CreateSheet
        open={open}
        onOpenChange={setOpen}
        title="Novo cliente"
        label="Razão social"
        onSave={(name) => {
          setExtra([...extra, name]);
          notify("Cliente adicionado à demonstração.");
        }}
      />
    </>
  );
}
function Operations({ screen, onSelect, notify }: ViewProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos os status");
  const [tab, setTab] = useState("todos");
  const dept =
    screen === "contabilidade"
      ? "Contabilidade"
      : screen === "juridico"
        ? "Jurídico"
        : null;
  const rows = processes.filter(
    (p) =>
      (!dept || p.department === dept) &&
      (status === "Todos os status" || p.status === status) &&
      (tab !== "prioritarios" || p.progress < 80) &&
      `${p.client} ${p.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  const title =
    dept === "Jurídico"
      ? "Demandas jurídicas"
      : dept === "Contabilidade"
        ? "Análises contábeis e fiscais"
        : "Visão geral dos processos";
  return (
    <>
      <Summary
        items={[
          {
            label: dept ? "Demandas em andamento" : "Processos em andamento",
            value: dept === "Jurídico" ? "35" : dept ? "38" : "148",
            note: "Acompanhamento da equipe",
            icon:
              dept === "Jurídico"
                ? Scale
                : dept
                  ? Calculator
                  : BriefcaseBusiness,
          },
          {
            label: "Entregas no prazo",
            value: dept === "Jurídico" ? "86%" : dept ? "89%" : "89%",
            note: "Indicador de nível de serviço",
            icon: Clock3,
          },
          {
            label: "Aguardando aprovação",
            value: dept === "Jurídico" ? "5" : dept ? "4" : "12",
            note: "Disponíveis para revisão",
            icon: ShieldCheck,
          },
          {
            label: "Concluídos no mês",
            value: dept === "Jurídico" ? "21" : dept ? "28" : "83",
            note: "Etapas finalizadas",
            icon: CircleCheck,
          },
        ]}
      />
      <Panel
        title={title}
        subtitle="Acompanhe responsáveis, etapas e próximos prazos"
        action={
          <Button
            variant="outline"
            onClick={() => {
              downloadCsv("processos-demonstracao.csv", [
                ["Processo", "Cliente", "Departamento", "Status", "Prazo"],
                ...rows.map((p) => [
                  p.id,
                  p.client,
                  p.department,
                  p.status,
                  p.date,
                ]),
              ]);
              notify("Lista demonstrativa exportada em CSV.");
            }}
          >
            <Download size={15} />
            Exportar lista
          </Button>
        }
      >
        <Tabs value={tab} onValueChange={setTab} className="operation-tabs">
          <TabsList variant="line">
            <TabsTrigger value="todos">Todos os processos</TabsTrigger>
            <TabsTrigger value="prioritarios">Prioridades</TabsTrigger>
            <TabsTrigger value="prazos">Agenda de prazos</TabsTrigger>
          </TabsList>
          <div className="table-toolbar">
            <label className="search-field">
              <Search size={16} />
              <Input
                placeholder="Buscar processo ou cliente..."
                aria-label="Buscar processo ou cliente"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <Picker
              label="Filtrar status"
              value={status}
              onChange={setStatus}
              options={[
                "Todos os status",
                "Em andamento",
                "Em análise",
                "Aguardando aprovação",
                "Concluído",
              ]}
            />
          </div>
          <TabsContent value="todos">
            <ProcessTable rows={rows} onSelect={onSelect} />
          </TabsContent>
          <TabsContent value="prioritarios">
            <ProcessTable rows={rows} onSelect={onSelect} />
          </TabsContent>
          <TabsContent value="prazos">
            <div className="agenda">
              {rows.map((p) => (
                <button key={p.id} onClick={() => onSelect(p)}>
                  <span className="calendar-date">
                    <strong>{p.date.slice(0, 2)}</strong>
                    <small>SET</small>
                  </span>
                  <span>
                    <strong>{p.subject}</strong>
                    <small>
                      {p.client} · {p.owner}
                    </small>
                  </span>
                  <Badge>{p.status}</Badge>
                  <ChevronRight size={18} />
                </button>
              ))}
              {!rows.length && (
                <div className="empty-state">
                  Nenhum prazo para os filtros selecionados.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <div className="table-footer">
          <span>{rows.length} processos demonstrativos</span>
          <span>Setembro de 2026</span>
        </div>
      </Panel>
      {dept && (
        <div className="module-bottom">
          <span className="module-bottom-icon">
            {dept === "Jurídico" ? <Scale /> : <Calculator />}
          </span>
          <div>
            <h3>
              {dept === "Jurídico"
                ? "Prazos sob controle. Estratégias bem conduzidas."
                : "Informação fiscal organizada, decisões mais precisas."}
            </h3>
            <p>
              {dept === "Jurídico"
                ? "Consulte os documentos e pareceres associados às demandas da equipe."
                : "Acesse a central de documentos para acompanhar as fontes de cada análise."}
            </p>
          </div>
          <Link href="/documentos">
            Abrir documentos <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </>
  );
}
function Approvals({ onSelect, notify }: ViewProps) {
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("pendentes");
  const items = [processes[2], processes[1], processes[3]];
  const pending = items.filter((p) => !decisions[p.id]);
  const visible =
    tab === "pendentes" ? pending : items.filter((p) => decisions[p.id]);
  return (
    <>
      <Summary
        items={[
          {
            label: "Aguardando decisão",
            value: String(12 - Object.keys(decisions).length),
            note: "3 solicitações nesta demonstração",
            icon: ShieldCheck,
          },
          {
            label: "Prioridade alta",
            value: decisions[items[0].id] ? "1" : "2",
            note: "Decisões necessárias em até 48h",
            icon: TriangleAlert,
          },
          {
            label: "Aprovadas no mês",
            value: String(
              34 +
                Object.values(decisions).filter((x) => x === "Aprovado").length,
            ),
            note: "Processos liberados para a equipe",
            icon: CheckCheck,
          },
          {
            label: "Tempo médio de decisão",
            value: "1,4 dias",
            note: "Dentro da meta de 2 dias",
            icon: Clock3,
          },
        ]}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="standalone-tabs">
          <TabsTrigger value="pendentes">
            Aguardando aprovação{" "}
            <span className="tab-counter">{pending.length}</span>
          </TabsTrigger>
          <TabsTrigger value="historico">Histórico da sessão</TabsTrigger>
        </TabsList>
        <div className="approval-grid">
          {visible.map((p, i) => (
            <section className="panel approval-card" key={p.id}>
              <div className="approval-top">
                <span className="priority-icon">
                  <ShieldCheck size={20} />
                </span>
                <Badge>{decisions[p.id] || "Aguardando aprovação"}</Badge>
              </div>
              <small className="eyebrow">{p.department}</small>
              <h2>{p.subject}</h2>
              <p>{p.client}</p>
              <div className="approval-meta">
                <div>
                  <small>Solicitado por</small>
                  <strong>{p.owner}</strong>
                </div>
                <div>
                  <small>Prazo para decisão</small>
                  <strong>{p.date}</strong>
                </div>
              </div>
              <button className="text-link" onClick={() => onSelect(p)}>
                Revisar detalhes do processo <ArrowUpRight size={14} />
              </button>
              {!decisions[p.id] && (
                <div className="approval-actions">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDecisions({ ...decisions, [p.id]: "Em análise" });
                      notify(
                        "Solicitação devolvida para ajustes nesta demonstração.",
                      );
                    }}
                  >
                    <RotateCcw size={14} />
                    Pedir ajustes
                  </Button>
                  <Button
                    onClick={() => {
                      setDecisions({ ...decisions, [p.id]: "Aprovado" });
                      notify(
                        "Aprovação simulada. Nenhum processo real foi alterado.",
                      );
                    }}
                  >
                    <Check size={16} />
                    Aprovar
                  </Button>
                </div>
              )}
            </section>
          ))}
        </div>
        {!visible.length && (
          <div className="panel empty-state">
            <CircleCheck size={32} />
            <strong>
              {tab === "pendentes"
                ? "Tudo revisado por aqui"
                : "Nenhuma decisão nesta sessão"}
            </strong>
            <p>
              {tab === "pendentes"
                ? "As decisões simuladas estão disponíveis no histórico."
                : "As aprovações e pedidos de ajuste aparecerão aqui."}
            </p>
          </div>
        )}
      </Tabs>
    </>
  );
}
const docs = [
  {
    title: "Relatório de situação fiscal",
    client: "Alfa Engenharia Ltda.",
    type: "Fiscal",
    size: "248 KB",
    date: "11 set. 2026",
  },
  {
    title: "Parecer de análise tributária",
    client: "Beta Indústria S.A.",
    type: "Pareceres",
    size: "1,2 MB",
    date: "10 set. 2026",
  },
  {
    title: "Contrato de prestação de serviços",
    client: "Gama Comércio Ltda.",
    type: "Contratos",
    size: "384 KB",
    date: "09 set. 2026",
  },
  {
    title: "Documentação cadastral",
    client: "Delta Serviços Ltda.",
    type: "Cadastral",
    size: "860 KB",
    date: "09 set. 2026",
  },
  {
    title: "Relatório consolidado de débitos",
    client: "Épsilon Transportes Ltda.",
    type: "Fiscal",
    size: "516 KB",
    date: "08 set. 2026",
  },
  {
    title: "Parecer de revisão administrativa",
    client: "Horizonte Alimentos S.A.",
    type: "Pareceres",
    size: "920 KB",
    date: "08 set. 2026",
  },
];
function Documents() {
  const [category, setCategory] = useState("Todos os documentos");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<(typeof docs)[number] | null>(null);
  const filtered = docs.filter(
    (d) =>
      (category === "Todos os documentos" || category === d.type) &&
      `${d.title} ${d.client}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="folder-grid">
        {["Fiscal", "Pareceres", "Contratos", "Cadastral"].map((name, i) => (
          <button
            key={name}
            className={`folder-card ${category === name ? "selected" : ""}`}
            onClick={() =>
              setCategory(category === name ? "Todos os documentos" : name)
            }
          >
            <span className={`folder-icon color-${i}`}>
              <FolderOpen size={26} strokeWidth={1.4} />
            </span>
            <h3>{name}</h3>
            <p>
              {docs.filter((d) => d.type === name).length} documentos
              demonstrativos
            </p>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      <Panel
        title="Central de documentos"
        subtitle="Arquivos organizados por empresa e categoria"
      >
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={16} />
            <Input
              aria-label="Buscar documento"
              placeholder="Buscar documento ou cliente..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Picker
            label="Categoria de documento"
            value={category}
            onChange={setCategory}
            options={[
              "Todos os documentos",
              "Fiscal",
              "Pareceres",
              "Contratos",
              "Cadastral",
            ]}
          />
        </div>
        <Table className="process-table">
          <TableHeader>
            <TableRow>
              {[
                "Documento",
                "Cliente",
                "Categoria",
                "Atualização",
                "Tamanho",
                "",
              ].map((s, i) => (
                <TableHead key={i}>{s}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((d) => (
              <TableRow key={d.title}>
                <TableCell>
                  <button
                    className="document-name"
                    onClick={() => setSelected(d)}
                  >
                    <span className="pdf-icon">
                      <FileText size={20} />
                      <small>PDF</small>
                    </span>
                    <strong>{d.title}</strong>
                  </button>
                </TableCell>
                <TableCell>{d.client}</TableCell>
                <TableCell>
                  <span className="category-tag">{d.type}</span>
                </TableCell>
                <TableCell>{d.date}</TableCell>
                <TableCell>{d.size}</TableCell>
                <TableCell>
                  <button
                    className="row-action"
                    onClick={() => setSelected(d)}
                    aria-label={`Visualizar ${d.title}`}
                  >
                    <Eye size={18} />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!filtered.length && (
          <div className="empty-state">
            <FolderOpen />
            <strong>Nenhum documento encontrado</strong>
            <p>Selecione outra categoria ou altere sua busca.</p>
          </div>
        )}
      </Panel>
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <SheetTitle>{selected?.title}</SheetTitle>
            <SheetDescription>{selected?.client}</SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            <div className="document-preview">
              <img src="/brand/logo-dark.svg" alt="FS Soluções Tributárias" />
              <span>DOCUMENTO DEMONSTRATIVO</span>
              <h3>{selected?.title}</h3>
              <p>
                <strong>Empresa:</strong> {selected?.client}
              </p>
              <p>
                <strong>Categoria:</strong> {selected?.type}
              </p>
              <div className="document-rule" />
              <h4>Resumo do documento</h4>
              <p>
                Esta prévia apresenta a organização visual dos documentos da
                empresa. Os arquivos reais serão vinculados na implementação do
                módulo.
              </p>
              <div className="document-rule" />
              <small>FS Soluções Tributárias · {selected?.date}</small>
            </div>
            <p className="demo-note">
              Prévia ilustrativa. Nenhum PDF fiscal real foi enviado para este
              sistema.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
function Reports({ notify }: ViewProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [period, setPeriod] = useState("Setembro de 2026");
  const reports = [
    {
      title: "Visão executiva",
      text: "Resultados, carteira e desempenho do escritório.",
      icon: ChartNoAxesCombined,
      area: "Gestão",
    },
    {
      title: "Relatório de processos",
      text: "Situação dos processos, responsáveis e prazos.",
      icon: BriefcaseBusiness,
      area: "Operação",
    },
    {
      title: "Indicadores de SLA",
      text: "Entregas e eficiência de cada departamento.",
      icon: Clock3,
      area: "Qualidade",
    },
    {
      title: "Pendências documentais",
      text: "Documentos e cadastros que precisam de atenção.",
      icon: FolderOpen,
      area: "Administrativo",
    },
    {
      title: "Análise fiscal",
      text: "Visão das análises e demandas contábeis.",
      icon: Calculator,
      area: "Contabilidade",
    },
    {
      title: "Acompanhamento jurídico",
      text: "Prazos, demandas e aprovações da equipe jurídica.",
      icon: Scale,
      area: "Jurídico",
    },
  ];
  return (
    <>
      <div className="section-toolbar">
        <div>
          <h2>Relatórios do escritório</h2>
          <p>Selecione uma visão para consultar os dados demonstrativos.</p>
        </div>
        <Picker
          label="Período do relatório"
          value={period}
          onChange={setPeriod}
          options={["Setembro de 2026", "Agosto de 2026"]}
        />
      </div>
      <div className="report-grid">
        {reports.map((r) => (
          <section className="panel report-card" key={r.title}>
            <span className="report-icon">
              <r.icon size={26} strokeWidth={1.5} />
            </span>
            <small className="eyebrow">{r.area}</small>
            <h2>{r.title}</h2>
            <p>{r.text}</p>
            <div>
              <span>Atualização mensal</span>
              <Button variant="outline" onClick={() => setSelected(r.title)}>
                Visualizar <ArrowUpRight size={15} />
              </Button>
            </div>
          </section>
        ))}
      </div>
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <span className="eyebrow">RELATÓRIO DEMONSTRATIVO</span>
            <SheetTitle>{selected}</SheetTitle>
            <SheetDescription>
              {period} · FS Soluções Tributárias
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            <div className="report-summary">
              <span>
                Processos acompanhados
                <strong>{period.startsWith("Setembro") ? "148" : "136"}</strong>
              </span>
              <span>
                Entregas no prazo
                <strong>{period.startsWith("Setembro") ? "89%" : "86%"}</strong>
              </span>
            </div>
            <h3>Distribuição por departamento</h3>
            <Performance />
            <p className="demo-note">
              A prévia utiliza dados ilustrativos. Os relatórios específicos de
              cada módulo serão construídos na próxima etapa.
            </p>
            <Button
              className="full-button"
              onClick={() => {
                downloadCsv("indicadores-demonstracao.csv", [
                  ["Relatório demonstrativo", selected || ""],
                  ["Período", period],
                  ["Departamento", "SLA no prazo"],
                  ...departmentData.map((d) => [d.label, `${d.value}%`]),
                ]);
                notify("Dados demonstrativos exportados em CSV.");
              }}
            >
              <Download size={16} />
              Exportar dados demonstrativos
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
function Preferences({ notify }: ViewProps) {
  const [name, setName] = useState("Maximiano");
  const [email, setEmail] = useState("");
  const [alerts, setAlerts] = useState(true);
  const [approvals, setApprovals] = useState(true);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("fs-ui-preferences") || "null",
      );
      if (saved) {
        setName(saved.name);
        setEmail(saved.email);
        setAlerts(saved.alerts);
        setApprovals(saved.approvals);
      }
    } catch {}
  }, []);
  return (
    <Tabs defaultValue="geral" className="preferences">
      <TabsList variant="line" className="standalone-tabs">
        <TabsTrigger value="geral">Geral</TabsTrigger>
        <TabsTrigger value="equipe">Equipe e permissões</TabsTrigger>
        <TabsTrigger value="integracoes">Integrações</TabsTrigger>
      </TabsList>
      <TabsContent value="geral">
        <div className="settings-grid">
          <Panel
            title="Meu perfil"
            subtitle="Informações de identificação no sistema"
          >
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                localStorage.setItem(
                  "fs-ui-preferences",
                  JSON.stringify({ name, email, alerts, approvals }),
                );
                notify("Preferências salvas neste navegador.");
              }}
            >
              <div className="profile-card">
                <span className="user-avatar">{name[0] || "M"}</span>
                <div>
                  <strong>{name}</strong>
                  <small>Administrador · Perfil demonstrativo</small>
                </div>
              </div>
              <div className="form-field">
                <Label htmlFor="profile-name">Nome completo</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <Label htmlFor="profile-email">E-mail de contato</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  placeholder="seu.email@empresa.com.br"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="form-field">
                <Label>Organização</Label>
                <Input
                  aria-label="Organização"
                  value="FS Soluções Tributárias"
                  readOnly
                />
              </div>
              <Button type="submit">
                <Save size={16} />
                Salvar preferências
              </Button>
            </form>
          </Panel>
          <Panel
            title="Notificações"
            subtitle="Escolha o que deseja acompanhar"
          >
            <div className="settings-options">
              <div>
                <span>
                  <strong>Alertas de prazo</strong>
                  <small>Lembretes de processos próximos do vencimento.</small>
                </span>
                <Switch
                  aria-label="Alertas de prazo"
                  checked={alerts}
                  onCheckedChange={setAlerts}
                />
              </div>
              <div>
                <span>
                  <strong>Solicitações de aprovação</strong>
                  <small>Novos processos aguardando sua decisão.</small>
                </span>
                <Switch
                  aria-label="Solicitações de aprovação"
                  checked={approvals}
                  onCheckedChange={setApprovals}
                />
              </div>
              <p className="demo-note">
                Preferências locais da interface. O envio de notificações será
                conectado na implementação dos módulos.
              </p>
            </div>
          </Panel>
        </div>
      </TabsContent>
      <TabsContent value="equipe">
        <Panel
          title="Equipe do escritório"
          subtitle="Exemplo de organização dos acessos por área"
        >
          <Table className="process-table">
            <TableHeader>
              <TableRow>
                {["Pessoa", "Departamento", "Perfil", "Situação"].map((t) => (
                  <TableHead key={t}>{t}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {processes.slice(0, 5).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="owner">
                      <span className="avatar">{p.initials}</span>
                      {p.owner}
                    </div>
                  </TableCell>
                  <TableCell>{p.department}</TableCell>
                  <TableCell>
                    {p.initials === "JR" ? "Gestor de área" : "Colaborador"}
                  </TableCell>
                  <TableCell>
                    <Badge>Regular</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="panel-bottom">
            Perfis ilustrativos. O controle de acesso ainda será implementado.
          </div>
        </Panel>
      </TabsContent>
      <TabsContent value="integracoes">
        <div className="integration-grid">
          {[
            {
              title: "Conector Mac",
              icon: Monitor,
              desc: "Coleta assistida no ambiente do escritório.",
              status: "Não conectado",
            },
            {
              title: "WhatsApp",
              icon: Mail,
              desc: "Solicitações e entrega de documentos pelo assistente.",
              status: "Não conectado",
            },
            {
              title: "Análise com IA",
              icon: ChartNoAxesCombined,
              desc: "Apoio à organização dos dados e elaboração de pareceres.",
              status: "Não conectado",
            },
          ].map((i) => (
            <Panel title={i.title} key={i.title}>
              <div className="integration-body">
                <i.icon size={30} strokeWidth={1.4} />
                <p>{i.desc}</p>
                <span className="category-tag">{i.status}</span>
              </div>
            </Panel>
          ))}
        </div>
        <p className="demo-note">
          As conexões serão configuradas na próxima etapa. Esta interface não
          acessa o e-CAC, certificados ou credenciais.
        </p>
      </TabsContent>
    </Tabs>
  );
}
export default function ModuleView(props: ViewProps) {
  switch (props.screen) {
    case "painel-executivo":
      return <Executive {...props} />;
    case "indicadores":
      return <Indicators {...props} />;
    case "comercial":
      return <CommercialWorkspace />;
    case "administrativo":
      return <Administrative {...props} />;
    case "controller":
    case "contabilidade":
    case "juridico":
      return <Operations {...props} />;
    case "aprovacoes":
      return <Approvals {...props} />;
    case "documentos":
      return <Documents />;
    case "relatorios":
      return <Reports {...props} />;
    case "configuracoes":
      return <Preferences {...props} />;
    default:
      return null;
  }
}

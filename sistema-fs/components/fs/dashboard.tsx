"use client";
import {
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { UserMenu } from "@/components/auth/user-menu";
import ModuleView from "./views";
import {
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  BriefcaseBusiness,
  ClipboardCheck,
  Clock3,
  TriangleAlert,
  FileText,
  Calculator,
  Scale,
  FolderOpen,
  Check,
  CircleCheck,
  CircleHelp,
  Plus,
  Download,
  SlidersHorizontal,
  ArrowRight,
  X,
  PanelLeftClose,
} from "lucide-react";
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  navigation,
  descriptions,
  processes,
  priorities,
  tone,
  type Process,
} from "./data";

export function Badge({ children }: { children: string }) {
  return <span className={`status ${tone(children)}`}>{children}</span>;
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Picker({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="fs-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem value={o} key={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Navigation({ screen }: { screen: string }) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar className="fs-sidebar">
      <SidebarHeader className="brand-header"><button className="mobile-nav-close" aria-label="Fechar menu" onClick={() => setOpenMobile(false)}><X size={20}/></button>
        <Link href="/" aria-label="FS Soluções Tributárias — início">
          <img
            src="/brand/logo-white.svg"
            alt="FS Soluções Tributárias"
            className="brand-logo"
          />
        </Link>
        <span className="brand-caption">GESTÃO TRIBUTÁRIA</span>
      </SidebarHeader>
      <SidebarContent className="nav-content">
        {navigation.map((g) => (
          <div className="nav-group" key={g.group}>
            <span className="nav-label">{g.group}</span>
            {g.items.map((item) => (
              <Link
                key={item.id}
                href={item.id === "inicio" ? "/inicio" : `/${item.id}`}
                aria-current={screen === item.id ? "page" : undefined}
                onClick={() => setOpenMobile(false)}
                className={`nav-item ${screen === item.id ? "active" : ""}`}
              >
                <item.icon size={19} strokeWidth={1.65} />
                <span>{item.label}</span>
                {item.id === "aprovacoes" && (
                  <span className="nav-count">12</span>
                )}
                {screen === item.id && <span className="active-indicator" />}
              </Link>
            ))}
          </div>
        ))}
      </SidebarContent>
      <SidebarFooter className="nav-footer">
        <div className="workspace-mark">FS</div>
        <div>
          <strong>FS Soluções Tributárias</strong>
          <span>Espaço de trabalho</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
export function Stats({
  kind = "home",
  period = "Setembro de 2026",
}: {
  kind?: string;
  period?: string;
}) {
  const alternate = period === "Agosto de 2026";
  const values =
    kind === "executive"
      ? ["R$ 2,4 mi", "R$ 486 mil", "92", "94%"]
      : kind === "indicators"
        ? ["89%", "4,2 dias", "96%", "148"]
        : [
            alternate ? "136" : "148",
            alternate ? "9" : "12",
            alternate ? "86%" : "89%",
            alternate ? "5" : "7",
          ];
  const labels =
    kind === "executive"
      ? [
          "Créditos em análise",
          "Honorários previstos",
          "Clientes ativos",
          "Retenção de clientes",
        ]
      : kind === "indicators"
        ? [
            "SLA no prazo",
            "Tempo médio de entrega",
            "Satisfação dos clientes",
            "Processos acompanhados",
          ]
        : [
            "Processos ativos",
            "Aprovações pendentes",
            "SLA no prazo",
            "Prazos críticos",
          ];
  const icons = [BriefcaseBusiness, ClipboardCheck, Clock3, TriangleAlert];
  return (
    <div className="stats-grid">
      {labels.map((label, i) => {
        const Icon = icons[i];
        return (
          <div className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <Icon size={21} strokeWidth={1.45} />
            </div>
            <div className="stat-value">
              <strong>{values[i]}</strong>
              <div className="mini-bars" aria-hidden="true">
                {[9, 17, 13, 25, 32, 29, 39].map((h, j) => (
                  <i key={j} style={{ height: h - i * 2 }} />
                ))}
              </div>
            </div>
            <div className="stat-foot">
              {i === 0 || i === 2 ? (
                <>
                  <ArrowUpRight size={14} />
                  <b>{i === 0 ? "+12,5%" : "+3%"}</b>
                  <span>em relação ao mês anterior</span>
                </>
              ) : i === 1 ? (
                <>
                  <span className="tiny-dot" />
                  <span>4 aguardando sua decisão</span>
                </>
              ) : (
                <>
                  <span className="tiny-dot" />
                  <span>2 vencem nas próximas 48h</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
export function SlaChart() {
  return (
    <Panel
      title="Controle de SLA"
      subtitle="Distribuição dos processos por área"
      action={<span className="small-label">Este mês</span>}
    >
      <div className="sla-main">
        <div
          className="donut"
          role="img"
          aria-label="Administrativo 62%, Judicial 38%"
        >
          <span className="ring-label first">62%</span>
          <span className="ring-label second">38%</span>
          <div className="donut-center">
            <div className="brand-symbol">
              <img src="/brand/logo-white.svg" alt="" />
            </div>
          </div>
        </div>
        <div className="chart-legend">
          <div>
            <i className="legend-dot navy" />
            <span>
              Administrativo
              <strong>
                62% <small>92 processos</small>
              </strong>
            </span>
          </div>
          <div>
            <i className="legend-dot gold" />
            <span>
              Judicial
              <strong>
                38% <small>56 processos</small>
              </strong>
            </span>
          </div>
        </div>
      </div>
      <div className="sla-foot">
        <div>
          <CircleCheck />
          <span>No prazo</span>
          <strong>89%</strong>
        </div>
        <div>
          <Clock3 />
          <span>Em atenção</span>
          <strong>7%</strong>
        </div>
        <div>
          <TriangleAlert />
          <span>Em atraso</span>
          <strong>4%</strong>
        </div>
      </div>
    </Panel>
  );
}
export function ProcessTable({
  rows,
  onSelect,
  compact = false,
}: {
  rows: Process[];
  onSelect: (p: Process) => void;
  compact?: boolean;
}) {
  return (
    <>
    <div className="desktop-process-table"><Table className="process-table">
      <TableHeader>
        <TableRow>
          {[
            "Processo / cliente",
            "Departamento",
            "Status",
            "Prazo",
            "Responsável",
            "",
          ].map((h, i) => (
            <TableHead key={i}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p.id}>
            <TableCell>
              <button className="client-link" onClick={() => onSelect(p)}>
                <strong>{p.client}</strong>
                <small>{p.id}</small>
              </button>
            </TableCell>
            <TableCell>
              {p.department === "Administrativo / Cadastro" ? (
                <>
                  Administrativo <span className="muted">/ Cadastro</span>
                </>
              ) : (
                p.department
              )}
            </TableCell>
            <TableCell>
              <Badge>{p.status}</Badge>
            </TableCell>
            <TableCell className="date-cell">{p.date}</TableCell>
            <TableCell>
              <div className="owner">
                <span className={`avatar avatar-${p.initials}`}>
                  {p.initials}
                </span>
                <span>{p.owner}</span>
              </div>
            </TableCell>
            <TableCell>
              <button
                className="row-action"
                aria-label={`Ver processo ${p.id}`}
                onClick={() => onSelect(p)}
              >
                <ChevronRight size={17} />
              </button>
            </TableCell>
          </TableRow>
        ))}
        {!rows.length && (
          <TableRow>
            <TableCell colSpan={6}>
              <div className="empty-state">
                <Search />
                <strong>Nenhum processo encontrado</strong>
                <p>Tente outro cliente ou altere os filtros.</p>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table></div>
    <div className="mobile-process-list">
      {rows.map(p => <button className="mobile-process-card" key={p.id} onClick={() => onSelect(p)} aria-label={`Ver processo ${p.id}`}>
        <span className="mobile-process-title"><span><strong>{p.client}</strong><small>{p.id}</small></span><ChevronRight size={18}/></span>
        <span className="mobile-process-department">{p.department}</span>
        <span className="mobile-process-state"><Badge>{p.status}</Badge><span><CalendarDays size={14}/>{p.date}</span></span>
        <span className="mobile-process-owner"><span className={`avatar avatar-${p.initials}`}>{p.initials}</span><span>{p.owner}</span></span>
      </button>)}
      {!rows.length && <div className="empty-state"><Search/><strong>Nenhum processo encontrado</strong><p>Tente outro cliente ou altere os filtros.</p></div>}
    </div></>
  );
}
function Home({
  onSelect,
  period,
}: {
  onSelect: (p: Process) => void;
  period: string;
}) {
  const [filter, setFilter] = useState("Todos os departamentos");
  const [query, setQuery] = useState("");
  const rows = processes.filter(
    (p) =>
      (filter === "Todos os departamentos" || p.department === filter) &&
      `${p.client} ${p.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Stats period={period} />
      <div className="overview-grid">
        <SlaChart />
        <Panel
          title="Prioridades e prazos"
          subtitle="O que precisa da sua atenção"
          action={
            <Link className="text-link" href="/controller">
              Ver todos <ArrowUpRight size={14} />
            </Link>
          }
        >
          <div className="priorities">
            {priorities.map((p, i) => {
              const Icon = [FileText, Calculator, Scale, FolderOpen][i];
              return (
                <button
                  key={p.title}
                  className="priority"
                  onClick={() => onSelect(processes[p.index])}
                >
                  <span className={`priority-icon ${i === 0 ? "urgent" : ""}`}>
                    <Icon size={20} strokeWidth={1.6} />
                  </span>
                  <span className="priority-content">
                    <strong>{p.title}</strong>
                    <small>{p.department}</small>
                  </span>
                  <span className="due">
                    <small>Vence em</small>
                    <strong>{p.days} dias</strong>
                  </span>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
          <div className="priority-foot">
            <span className="tiny-dot" />7 processos com prazo nos próximos 7
            dias
          </div>
        </Panel>
      </div>
      <Panel
        title="Acompanhamento dos processos"
        subtitle="Movimentações recentes da sua operação"
        action={
          <Link className="text-link" href="/controller">
            Ver todos os processos <ArrowRight size={15} />
          </Link>
        }
        className="table-panel"
      >
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={17} />
            <Input
              placeholder="Buscar processo ou cliente..."
              aria-label="Buscar processo ou cliente"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Picker
            label="Filtrar departamento"
            value={filter}
            onChange={setFilter}
            options={[
              "Todos os departamentos",
              "Administrativo / Cadastro",
              "Contabilidade",
              "Jurídico",
            ]}
          />
        </div>
        <ProcessTable rows={rows.slice(0, 5)} onSelect={onSelect} />
        <div className="table-footer">
          <span>
            Exibindo {Math.min(rows.length, 5)} de {rows.length} processos
            demonstrativos
          </span>
          <Link href="/controller">
            Visualizar operação completa <ChevronRight size={14} />
          </Link>
        </div>
      </Panel>
    </>
  );
}

export default function Dashboard({ screen, children }: { screen: string; children?: ReactNode }) {
  const title = screen === "conta" ? "Minha conta" :
    navigation.flatMap((g) => g.items).find((i) => i.id === screen)?.label ||
    "Página inicial";
  const [period, setPeriod] = useState("Setembro de 2026");
  const [selected, setSelected] = useState<Process | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const [notifications, setNotifications] = useState(false);
  const [message, setMessage] = useState("");
  const showMessage = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 4500);
  };
  return (
    <SidebarProvider style={{ "--sidebar-width": "256px" } as CSSProperties}>
      <Navigation screen={screen} />
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <SidebarTrigger aria-label="Abrir ou recolher menu" />
            <span className="breadcrumb-label">
              Workspace <ChevronRight size={14} />
              <strong>{title}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <div className="global-search">
              <Search size={17} />
              <Input
                ref={searchRef}
                aria-label="Buscar no sistema"
                placeholder="Buscar no sistema..."
                value={query}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              />
              <kbd>⌘ K</kbd>
              {searchOpen && query && (
                <div className="search-results">
                  <small>RESULTADOS</small>
                  {navigation
                    .flatMap((g) => g.items)
                    .filter((i) =>
                      i.label.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((i) => (
                      <Link
                        href={i.id === "inicio" ? "/" : `/${i.id}`}
                        key={i.id}
                      >
                        <i.icon size={16} />
                        {i.label}
                        <ChevronRight size={14} />
                      </Link>
                    ))}
                  {processes
                    .filter((p) =>
                      p.client.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelected(p);
                          setSearchOpen(false);
                        }}
                      >
                        <BriefcaseBusiness size={16} />
                        {p.client}
                      </button>
                    ))}
                  {!navigation
                    .flatMap((g) => g.items)
                    .some((i) =>
                      i.label.toLowerCase().includes(query.toLowerCase()),
                    ) &&
                    !processes.some((p) =>
                      p.client.toLowerCase().includes(query.toLowerCase()),
                    ) && <p>Nenhum resultado encontrado.</p>}
                </div>
              )}
            </div>
            <button
              className="notification-button"
              aria-label="Abrir notificações"
              onClick={() => setNotifications(true)}
            >
              <Bell size={21} strokeWidth={1.6} />
              <span>3</span>
            </button>
            <div className="topbar-divider" />
            <UserMenu/>
          </div>
        </header>
        <main className="main-content">
          {screen !== "diagnostico" && <div className="page-heading fs-page-hero">
            <div>
              <div className="eyebrow">
                FS SOLUÇÕES TRIBUTÁRIAS <span /> COCKPIT OPERACIONAL
              </div>
              <h1>{title}</h1>
              <p>{screen === "conta" ? "Gerencie seu acesso ao sistema FS." : descriptions[screen]}</p>
            </div>
            {!children && <div className="heading-actions">
              <span className="demo-tag">{screen === "comercial" ? "Contatos do site" : "Demonstração"}</span>
              <div className="period-picker">
                <CalendarDays size={16} />
                <span className="period-label">Setembro de 2026</span>
              </div>
            </div>}
          </div>
          }
          {children ?? (screen === "inicio" ? (
            <Home onSelect={setSelected} period={period} />
          ) : (
            <ModuleView
              screen={screen}
              period={period}
              onSelect={setSelected}
              notify={showMessage}
            />
          ))}
          <footer className="page-footer">
            <span>
              FS Soluções Tributárias <span>© 2026</span>
            </span>
            <span>{screen === "comercial" ? "Comercial · Solicitações recebidas pelo site" : "Ambiente de demonstração · Dados ilustrativos"}</span>
          </footer>
        </main>
      </div>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <span className="eyebrow">DETALHES DO PROCESSO</span>
            <SheetTitle>{selected?.subject}</SheetTitle>
            <SheetDescription>
              {selected?.id} · {selected?.client}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="sheet-body">
              <Badge>{selected.status}</Badge>
              <div className="detail-grid">
                <div>
                  <small>Departamento</small>
                  <strong>{selected.department}</strong>
                </div>
                <div>
                  <small>Prazo de entrega</small>
                  <strong>{selected.date}</strong>
                </div>
                <div>
                  <small>Responsável</small>
                  <strong>{selected.owner}</strong>
                </div>
                <div>
                  <small>Cliente</small>
                  <strong>{selected.client}</strong>
                </div>
              </div>
              <h3>Andamento</h3>
              <div className="progress-line">
                <i style={{ width: `${selected.progress}%` }} />
              </div>
              <p className="muted">
                {selected.progress}% das etapas concluídas
              </p>
              <h3>Histórico de atividades</h3>
              <div className="timeline">
                <div>
                  <i />
                  <strong>Processo recebido</strong>
                  <p>Documentação inicial registrada.</p>
                  <small>08 set. 2026 · 09:40</small>
                </div>
                <div>
                  <i />
                  <strong>Responsável designado</strong>
                  <p>{selected.owner} assumiu o acompanhamento.</p>
                  <small>09 set. 2026 · 14:20</small>
                </div>
                <div>
                  <i />
                  <strong>Análise em andamento</strong>
                  <p>Equipe avaliando os documentos do cliente.</p>
                  <small>11 set. 2026 · 10:15</small>
                </div>
              </div>
              <p className="demo-note">
                Exemplo de acompanhamento. Nenhuma informação está vinculada a
                um processo real.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Sheet open={notifications} onOpenChange={setNotifications}>
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <SheetTitle>Notificações</SheetTitle>
            <SheetDescription>
              Atualizações da sua operação demonstrativa.
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body notification-list">
            {[
              "2 processos vencem nas próximas 48 horas",
              "4 aprovações aguardam sua decisão",
              "Relatório mensal disponível para revisão",
            ].map((n, i) => (
              <button
                key={n}
                onClick={() => {
                  setNotifications(false);
                  setSelected(processes[i]);
                }}
              >
                <span className="priority-icon">
                  <Bell size={18} />
                </span>
                <span>
                  <strong>{n}</strong>
                  <small>Hoje · {9 + i}:30</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      {message && (
        <div role="status" className="toast">
          <CircleCheck size={18} />
          {message}
          <button onClick={() => setMessage("")} aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      )}
    </SidebarProvider>
  );
}

"use client";
import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import Link from "next/link";
import { UserMenu } from "@/components/auth/user-menu";
import { ControllerProvider, useController } from "@/components/controller/context";
import { ProcessSheet } from "@/components/controller/process-sheet";
import { deadlineQueue } from "@/lib/controller/metrics";
import { daysUntil, formatDay, reviewLabels, searchKey as normalizeSearch } from "@/lib/controller/model";
import ModuleView from "./views";
import { Search, Bell, ChevronRight, BriefcaseBusiness, CircleCheck, Clock3, ShieldCheck, X } from "lucide-react";
import { Sidebar, SidebarProvider, SidebarContent, SidebarHeader, SidebarFooter, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { navigation, descriptions } from "./data";

function Navigation({ screen }: { screen: string }) {
  const { setOpenMobile } = useSidebar();
  const { inbox } = useController();
  return (
    <Sidebar className="fs-sidebar">
      <SidebarHeader className="brand-header"><button className="mobile-nav-close" aria-label="Fechar menu" onClick={() => setOpenMobile(false)}><X size={20}/></button>
        <Link href="/" aria-label="FS Soluções Tributárias — início">
          <img src="/brand/logo-white.svg" alt="FS Soluções Tributárias" className="brand-logo" />
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
                href={`/${item.id}`}
                aria-current={screen === item.id ? "page" : undefined}
                onClick={() => setOpenMobile(false)}
                className={`nav-item ${screen === item.id ? "active" : ""}`}
              >
                <item.icon size={19} strokeWidth={1.65} />
                <span>{item.label}</span>
                {item.id === "aprovacoes" && inbox.length > 0 && <span className="nav-count">{inbox.length}</span>}
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

function Shell({ screen, children }: { screen: string; children?: ReactNode }) {
  const title = screen === "conta" ? "Minha conta" : navigation.flatMap((g) => g.items).find((i) => i.id === screen)?.label || "Página inicial";
  const { processes, inbox, allowed, open, notice, notify } = useController();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const [notifications, setNotifications] = useState(false);
  const term = normalizeSearch(query);
  const pages = navigation.flatMap((g) => g.items).filter((i) => normalizeSearch(i.label).includes(term));
  const found = term ? processes.filter((p) => [p.company, p.cnpj, p.processNumber].some((v) => normalizeSearch(v).includes(term))).slice(0, 8) : [];
  // Contagens que pedem atenção agora: encerram em até 7 dias e ainda não têm despacho. As já encerradas ficam nos indicadores.
  const deadlines = deadlineQueue(processes).filter((p) => { const days = daysUntil(p.deadline); return days !== null && days >= 0 && days <= 7; });
  const alerts = inbox.length + deadlines.length;
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
              {searchOpen && term && (
                <div className="search-results">
                  <small>RESULTADOS</small>
                  {pages.map((i) => (
                    <Link href={`/${i.id}`} key={i.id}>
                      <i.icon size={16} />
                      {i.label}
                      <ChevronRight size={14} />
                    </Link>
                  ))}
                  {found.map((p) => (
                    <button key={p.id} onClick={() => { open(p); setSearchOpen(false); setQuery(""); }}>
                      <BriefcaseBusiness size={16} />
                      {p.company}
                    </button>
                  ))}
                  {!pages.length && !found.length && <p>Nenhum resultado encontrado.</p>}
                </div>
              )}
            </div>
            <button className="notification-button" aria-label={`Abrir notificações${alerts ? ` (${alerts})` : ""}`} onClick={() => setNotifications(true)}>
              <Bell size={21} strokeWidth={1.6} />
              {alerts > 0 && <span>{alerts > 9 ? "9+" : alerts}</span>}
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
            {screen === "comercial" && <div className="heading-actions"><span className="demo-tag">Contatos do site</span></div>}
          </div>
          }
          {children ?? <ModuleView screen={screen} />}
          <footer className="page-footer">
            <span>
              FS Soluções Tributárias <span>© 2026</span>
            </span>
            <span>{screen === "comercial" ? "Comercial · Solicitações recebidas pelo site" : "Sistema interno · Acesso restrito à equipe FS"}</span>
          </footer>
        </main>
      </div>
      <ProcessSheet />
      <Sheet open={notifications} onOpenChange={setNotifications}>
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <SheetTitle>Notificações</SheetTitle>
            <SheetDescription>{allowed.review ? "Registros aguardando sua revisão e contagens que encerram em até 7 dias." : "Ajustes pedidos pelos revisores e contagens que encerram em até 7 dias."}</SheetDescription>
          </SheetHeader>
          <div className="sheet-body notification-list">
            {inbox.map((p) => (
              <button key={p.id} onClick={() => { setNotifications(false); open(p); }}>
                <span className="priority-icon"><ShieldCheck size={18} /></span>
                <span>
                  <strong>{p.company}</strong>
                  <small>{reviewLabels[p.reviewState]} · salvo por {p.updatedBy}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
            {deadlines.map((p) => (
              <button key={`prazo-${p.id}`} onClick={() => { setNotifications(false); open(p); }}>
                <span className="priority-icon"><Clock3 size={18} /></span>
                <span>
                  <strong>{p.company}</strong>
                  <small>Contagem encerra em {formatDay(p.deadline)}, ainda sem despacho</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
            {!alerts && <div className="empty-state"><CircleCheck size={30} /><strong>Nada pendente</strong><p>Nenhuma revisão ou contagem pede sua atenção agora.</p></div>}
          </div>
        </SheetContent>
      </Sheet>
      {notice && (
        <div role="status" className="toast">
          <CircleCheck size={18} />
          {notice}
          <button onClick={() => notify("")} aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      )}
    </SidebarProvider>
  );
}

export default function Dashboard({ screen, children }: { screen: string; children?: ReactNode }) {
  return <ControllerProvider><Shell screen={screen}>{children}</Shell></ControllerProvider>;
}

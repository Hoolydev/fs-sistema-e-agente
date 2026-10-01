"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { can, type Role } from "@/lib/auth/roles";
import { controllerMetrics, type ControllerMetrics } from "@/lib/controller/metrics";
import type { ControllerProcess } from "@/lib/controller/model";
import type { Company } from "@/lib/empresas/store";

// Novo processo pode nascer de uma empresa cadastrada, já com nome e CNPJ preenchidos.
export type NewProcess = { novo: true; company?: string; cnpj?: string };

type Value = {
  processes: ControllerProcess[]; metrics: ControllerMetrics; role: Role; loading: boolean; error: string;
  reload: () => Promise<void>;
  // Processo aberto no painel lateral: um registro existente, "novo" ou nenhum.
  selected: ControllerProcess | "novo" | NewProcess | null; open: (target: ControllerProcess | "novo" | NewProcess | null) => void;
  // Empresas cadastradas (Administrativo) e as presentes no Controller; painel da empresa aberto.
  companies: Company[]; companySelected: string | "nova" | null; openCompany: (target: string | "nova" | null) => void;
  allowed: { create: boolean; edit: boolean; review: boolean; remove: boolean; users: boolean };
  // O que pede ação de quem está logado: revisores veem o que aguarda revisão; inclusão de dados vê os ajustes pedidos.
  inbox: ControllerProcess[];
  notice: string; notify: (text: string) => void;
};
const Context = createContext<Value | null>(null);
export function useController() { const value = useContext(Context); if (!value) throw new Error("ControllerProvider ausente"); return value; }

type Loaded = { processes: ControllerProcess[]; role: Role; companies: Company[] } | { error: string };
async function load(): Promise<Loaded> {
  try {
    const response = await fetch("/api/controller/processos", { cache: "no-store" });
    if (response.status === 401) { window.location.assign("/login"); return { processes: [], role: "operador", companies: [] }; }
    const data = await response.json();
    if (!response.ok) return { error: data.message || "Não foi possível carregar os processos." };
    const companies = await fetch("/api/empresas", { cache: "no-store" }).then(r => r.ok ? r.json() : { companies: [] }).then(d => d.companies ?? []).catch(() => []);
    return { processes: data.processes, role: data.role, companies };
  } catch { return { error: "Não foi possível carregar os processos. Verifique sua conexão." }; }
}
export function ControllerProvider({ children }: { children: ReactNode }) {
  const [processes, setProcesses] = useState<ControllerProcess[]>([]);
  const [role, setRole] = useState<Role>("operador");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, open] = useState<Value["selected"]>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companySelected, openCompany] = useState<Value["companySelected"]>(null);
  const [notice, setNotice] = useState("");
  const notify = useCallback((text: string) => { setNotice(text); if (text) setTimeout(() => setNotice(current => current === text ? "" : current), 4500); }, []);
  const apply = useCallback((result: Loaded) => {
    if ("error" in result) setError(result.error); else { setProcesses(result.processes); setRole(result.role); setCompanies(result.companies); setError(""); }
    setLoading(false);
  }, []);
  const reload = useCallback(async () => apply(await load()), [apply]);
  useEffect(() => { let active = true; void load().then(result => { if (active) apply(result); }); return () => { active = false; }; }, [apply]);
  const value = useMemo<Value>(() => {
    const review = can(role, { processo: ["revisar"] });
    return {
      processes, metrics: controllerMetrics(processes), role, loading, error, reload, selected, open, companies, companySelected, openCompany,
      allowed: { create: can(role, { processo: ["incluir"] }), edit: can(role, { processo: ["editar"] }), review, remove: can(role, { processo: ["excluir"] }), users: can(role, { user: ["create"] }) },
      inbox: processes.filter(p => p.reviewState === (review ? "pendente" : "ajustes")),
      notice, notify,
    };
  }, [processes, role, loading, error, reload, selected, companies, companySelected, notice, notify]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

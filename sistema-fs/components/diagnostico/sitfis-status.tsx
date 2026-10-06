"use client";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

type Status = { status: "solicitado" | "concluido" | "revisao" | "falhou"; message: string; resultUrl: string | null; isResult: boolean; createdAt: string };
const time = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
// Andamento da consulta da Receita Federal (SITFIS) deste parecer; atualiza a cada 15 s enquanto o agente trabalha.
export function SitfisStatus({ documentId }: { documentId: string }) {
  const [state, setState] = useState<Status | null>(null);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const data = await fetch(`/api/diagnosticos/sitfis?documento=${documentId}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!active) return;
      setState(data?.request ?? null);
      if (data?.request?.status === "solicitado") timer = setTimeout(load, 15_000);
    };
    void load();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [documentId]);
  if (!state || state.isResult) return null;
  if (state.status === "solicitado") return <div className="diag-alert" role="status"><LoaderCircle className="spin" size={18} /><p><strong>Receita Federal em consulta.</strong> Pedido enviado ao agente em {time(state.createdAt)}. A versão completa (Receita + PGFN) aparece aqui quando o Serpro liberar o relatório; esta página se atualiza sozinha.</p></div>;
  if (state.status === "concluido" && state.resultUrl) return <div className="diag-alert" role="status"><p><strong>Versão completa disponível.</strong> {state.message} <a href={state.resultUrl}>Abrir o parecer completo</a></p></div>;
  return <div className="diag-alert" role="alert"><p><strong>Receita Federal: {state.status === "revisao" ? "revisão necessária" : "consulta não concluída"}.</strong> {state.message}</p></div>;
}

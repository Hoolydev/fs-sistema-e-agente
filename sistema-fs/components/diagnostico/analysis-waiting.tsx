"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, LoaderCircle } from "lucide-react";

type Props = { documentId: string; company: string; cnpj: string; requestedAt: string; pgfnCount: number };
const elapsed = (from: string, now: number) => {
  const s = Math.max(0, Math.floor((now - Date.parse(from)) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};
// Tela de espera da análise completa: enquanto a Receita Federal (SITFIS) é consultada, não se mostra parecer com
// "Não informado". Só lê o andamento no sistema (sem custo de API); concluída, abre a versão completa.
export function AnalysisWaiting({ documentId, company, cnpj, requestedAt, pgfnCount }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const load = async () => {
      const data = await fetch(`/api/diagnosticos/sitfis?documento=${documentId}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!active) return;
      const request = data?.request;
      if (request?.status === "concluido" && request.resultUrl) { window.location.assign(request.resultUrl); return; }
      if (request && request.status !== "solicitado") { window.location.reload(); return; }
      timer = setTimeout(load, 5_000);
    };
    void load();
    return () => { active = false; clearInterval(tick); if (timer) clearTimeout(timer); };
  }, [documentId]);
  const steps = [
    { label: "Dívida ativa (PGFN)", detail: `${pgfnCount} inscriç${pgfnCount === 1 ? "ão" : "ões"} recebida${pgfnCount === 1 ? "" : "s"}`, done: true },
    { label: "Situação fiscal na Receita Federal", detail: "Consulta única ao Serpro, já paga; não é repetida", done: false, active: true },
    { label: "Parecer completo", detail: "Montado assim que a Receita responder", done: false },
  ];
  return (
    <section className="diag-wait" aria-live="polite">
      <LoaderCircle className="spin diag-wait-icon" size={34} />
      <p className="diag-eyebrow">ANÁLISE EM ANDAMENTO</p>
      <h1>{company}</h1>
      <p className="diag-wait-sub">{cnpj} · consultando há {elapsed(requestedAt, now)}</p>
      <ol className="diag-wait-steps">
        {steps.map(s => (
          <li key={s.label} className={s.done ? "done" : s.active ? "active" : ""}>
            {s.done ? <CheckCircle2 size={18} /> : s.active ? <LoaderCircle className="spin" size={18} /> : <Circle size={18} />}
            <div><strong>{s.label}</strong><small>{s.detail}</small></div>
          </li>
        ))}
      </ol>
      <p className="diag-wait-note">Costuma levar poucos minutos. A tela abre o parecer completo sozinha; se preferir, pode sair: o parecer fica no acervo e você recebe um aviso quando ficar pronto.</p>
    </section>
  );
}

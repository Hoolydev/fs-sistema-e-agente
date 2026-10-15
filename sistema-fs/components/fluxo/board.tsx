"use client";
import { useCallback, useEffect, useState, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, GripVertical, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCnpj } from "@/lib/diagnostico/model";
import { searchKey } from "@/lib/controller/model";
import {
  atOrPastApproval, lastSubstage, needsApproval, nextSector, previousSector, sectorLabels, sectorScreens, sectors, since, substages, substageLabel,
  type FlowCard, type Sector,
} from "@/lib/fluxo/model";

type Pending = { card: FlowCard; direction: "proximo" | "anterior" } | null;
const tones = ["navy", "blue", "gold", "green", "teal"];

// Último quadro de cada área, mantido entre as trocas de tela: abre na hora e atualiza em segundo plano.
const boards = new Map<Sector, { cards: FlowCard[]; canWork: boolean; canAdvance: boolean }>();
// Quadro de etapas de uma área: um cartão por CNPJ, arrastado entre as subetapas. Na última subetapa um revisor
// valida e envia o cliente para a próxima área, que assume o atendimento.
export function FlowBoard({ sector, extra, onOpen, refreshKey }: { sector: Sector; extra?: (card: FlowCard) => ReactNode; onOpen?: (card: FlowCard) => void; refreshKey?: unknown }) {
  const [cards, setCards] = useState<FlowCard[]>(() => boards.get(sector)?.cards ?? []);
  const [rights, setRights] = useState(() => { const b = boards.get(sector); return { canWork: b?.canWork ?? false, canAdvance: b?.canAdvance ?? false }; });
  const [loading, setLoading] = useState(() => !boards.has(sector));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState("");
  const next = nextSector(sector), previous = previousSector(sector), last = lastSubstage(sector);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/fluxo?setor=${sector}`, { cache: "no-store" }), data = await res.json();
      if (!res.ok) throw new Error(data.message || "Não foi possível carregar o quadro.");
      setCards(data.cards); setRights({ canWork: data.canWork, canAdvance: data.canAdvance }); setError("");
      boards.set(sector, { cards: data.cards, canWork: data.canWork, canAdvance: data.canAdvance });
    } catch (e) { setError(e instanceof Error ? e.message : "Falha na conexão."); }
    finally { setLoading(false); }
  }, [sector]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load, refreshKey]);

  useEffect(() => { const b = boards.get(sector); if (b) boards.set(sector, { ...b, cards }); }, [cards, sector]);
  async function move(card: FlowCard, substage: string) {
    if (!rights.canWork || substage === card.substage) return;
    if (!rights.canAdvance && needsApproval(sector, card.substage, substage)) { setError("Este passo é a aprovação da chefia da área. Peça ao responsável para mover o cartão."); return; }
    const before = cards;
    setCards(list => list.map(c => (c.cnpj === card.cnpj ? { ...c, substage, substageAt: new Date().toISOString() } : c)));
    setBusy(card.cnpj); setNotice("");
    try {
      const res = await fetch("/api/fluxo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj: card.cnpj, substage, version: card.updatedAt }) }), data = await res.json();
      if (!res.ok) throw new Error(data.message || "Não foi possível mover o cartão.");
      setCards(list => list.map(c => (c.cnpj === card.cnpj ? data.card : c))); setError("");
    } catch (e) { setCards(before); setError(e instanceof Error ? e.message : "Não foi possível mover o cartão."); if (String(e).includes("alterado")) void load(); }
    finally { setBusy(null); }
  }
  async function changeSector() {
    if (!pending) return;
    const { card, direction } = pending;
    setBusy(card.cnpj);
    try {
      const res = await fetch("/api/fluxo/avancar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj: card.cnpj, version: card.updatedAt, direction, note }) }), data = await res.json();
      if (!res.ok) throw new Error(data.message || "Não foi possível mudar a área.");
      setCards(list => list.filter(c => c.cnpj !== card.cnpj));
      setNotice(`${card.company} foi para o ${sectorLabels[data.card.sector as Sector]}, em ${substageLabel(data.card.sector, data.card.substage)}. A área foi avisada.`);
      setPending(null); setNote(""); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível mudar a área."); }
    finally { setBusy(null); }
  }
  const drop = (substage: string) => (event: DragEvent) => {
    event.preventDefault(); setOver(null);
    const card = cards.find(c => c.cnpj === (event.dataTransfer.getData("text/plain") || dragging));
    setDragging(null);
    if (card) void move(card, substage);
  };

  const term = searchKey(query);
  const visible = cards.filter(c => !term || searchKey(c.company).includes(term) || c.cnpj.includes(term.replace(/\D/g, "") || "§"));
  return (
    <section className="flow-board" aria-label={`Etapas do ${sectorLabels[sector]}`}>
      <ol className="flow-steps" aria-label="Fluxo do cliente">
        {sectors.map((s, i) => (
          <li key={s} className={s === sector ? "current" : ""}>
            {s === sector ? <span>{i + 1}. {sectorLabels[s]}</span> : <Link href={sectorScreens[s]}>{i + 1}. {sectorLabels[s]}</Link>}
            {i < sectors.length - 1 && <ArrowRight size={13} aria-hidden />}
          </li>
        ))}
      </ol>
      <div className="flow-toolbar">
        <p>
          {rights.canWork ? "Arraste os cartões entre as subetapas." : "Você acompanha este quadro; mover cartões é com a equipe desta área."}
          {next ? ` Na última subetapa, um revisor valida e envia o cliente para o ${sectorLabels[next]}.` : " Última área do fluxo."}
        </p>
        <label className="search-field flow-search">
          <Search size={15} />
          <input aria-label="Buscar empresa ou CNPJ no quadro" placeholder="Empresa ou CNPJ" value={query} onChange={e => setQuery(e.target.value)} />
        </label>
        <Button variant="outline" onClick={() => { setLoading(true); void load(); }} disabled={loading}><RefreshCw size={14} />Atualizar</Button>
      </div>
      {error && <p role="alert" className="flow-error">{error}</p>}
      {notice && <p role="status" className="flow-notice">{notice}</p>}
      {loading && !cards.length ? <p role="status" className="flow-loading">Carregando o quadro…</p> : (
        <div className="flow-columns" style={{ ["--flow-cols" as string]: substages[sector].length }}>
          {substages[sector].map((stage, i) => {
            const list = visible.filter(c => c.substage === stage.id);
            return (
              <section
                key={stage.id}
                className={`flow-column ${tones[i % tones.length]} ${over === stage.id ? "over" : ""}`}
                onDragOver={e => { if (rights.canWork && dragging) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== stage.id) setOver(stage.id); } }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
                onDrop={drop(stage.id)}
                aria-label={`${stage.label}${stage.hint ? ` (${stage.hint})` : ""}: ${list.length} clientes`}
              >
                <header>
                  <h3>{stage.label}<span>{list.length}</span></h3>
                  {stage.hint && <small>{stage.hint}</small>}
                  {stage.id === last && next && <small className="flow-exit">Saída para o {sectorLabels[next]}</small>}
                </header>
                {list.map(card => (
                  <article
                    key={card.cnpj}
                    className={`flow-card ${dragging === card.cnpj ? "dragging" : ""} ${busy === card.cnpj ? "busy" : ""}`}
                    draggable={rights.canWork && busy !== card.cnpj && (rights.canAdvance || !atOrPastApproval(sector, card.substage))}
                    onDragStart={e => { e.dataTransfer.setData("text/plain", card.cnpj); e.dataTransfer.effectAllowed = "move"; setDragging(card.cnpj); }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                  >
                    <div className="flow-card-top">
                      {rights.canWork && <GripVertical size={14} className="flow-grip" aria-hidden />}
                      <button type="button" className="flow-card-title" onClick={() => onOpen?.(card)} disabled={!onOpen}>
                        <strong>{card.company}</strong>
                        <small>{formatCnpj(card.cnpj)}</small>
                      </button>
                    </div>
                    {extra?.(card)}
                    <div className="flow-card-meta">
                      <span title={`Nesta subetapa desde ${new Date(card.substageAt).toLocaleString("pt-BR")}`}><Clock3 size={12} />{since(card.substageAt)}</span>
                      <span>{card.updatedBy}</span>
                    </div>
                    {rights.canWork && (
                      <label className="flow-move">
                        <span className="sr-only">Mover {card.company} para</span>
                        <select value={card.substage} disabled={busy === card.cnpj} onChange={e => void move(card, e.target.value)}>
                          {substages[sector].map(s => <option key={s.id} value={s.id} disabled={!rights.canAdvance && s.id !== card.substage && needsApproval(sector, card.substage, s.id)}>{s.label}{s.hint ? ` (${s.hint})` : ""}</option>)}
                        </select>
                      </label>
                    )}
                    {rights.canAdvance && (
                      <div className="flow-card-actions">
                        {previous && card.substage === substages[sector][0]!.id && (
                          <button type="button" className="flow-back" onClick={() => { setPending({ card, direction: "anterior" }); setNote(""); }}><ArrowLeft size={13} />Devolver ao {sectorLabels[previous]}</button>
                        )}
                        {next && card.substage === last && (
                          <button type="button" className="flow-advance" onClick={() => { setPending({ card, direction: "proximo" }); setNote(""); }}>Enviar para o {sectorLabels[next]}<ArrowRight size={13} /></button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
                {!list.length && <div className="flow-empty">{query ? "Nenhum cliente na busca." : rights.canWork ? "Arraste um cartão para cá." : "Nenhum cliente nesta subetapa."}</div>}
              </section>
            );
          })}
        </div>
      )}
      <Dialog open={!!pending} onOpenChange={open => { if (!open) { setPending(null); setNote(""); } }}>
        <DialogContent className="flow-dialog">
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle>{pending.direction === "proximo" ? `Enviar para o ${sectorLabels[next!]}` : `Devolver ao ${sectorLabels[previous!]}`}</DialogTitle>
                <DialogDescription>
                  {pending.card.company} · {formatCnpj(pending.card.cnpj)}
                </DialogDescription>
              </DialogHeader>
              <p className="flow-dialog-text">
                <ShieldCheck size={16} />
                {pending.direction === "proximo"
                  ? `Você valida que a etapa ${sectorLabels[sector]} foi concluída. O cliente entra no ${sectorLabels[next!]} em "${substageLabel(next!, substages[next!][0]!.id)}" e a equipe dessa área é avisada.${next === "controller" ? " Se ainda não houver processo no Controller, um registro é criado para ser preenchido." : ""}`
                  : `O cliente volta para o ${sectorLabels[previous!]} em "${substageLabel(previous!, lastSubstage(previous!))}". Explique o motivo para a equipe dessa área.`}
              </p>
              <label className="flow-note">
                {pending.direction === "proximo" ? "Observação (opcional)" : "Motivo da devolução"}
                <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3} />
              </label>
              {error && <p role="alert" className="flow-error">{error}</p>}
              <div className="flow-dialog-actions">
                <Button variant="outline" onClick={() => { setPending(null); setNote(""); }}>Cancelar</Button>
                <Button onClick={() => void changeSector()} disabled={busy === pending.card.cnpj || (pending.direction === "anterior" && note.trim().length < 3)}>
                  {pending.direction === "proximo" ? "Validar e enviar" : "Devolver"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

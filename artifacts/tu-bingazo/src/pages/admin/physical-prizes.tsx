import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";
import { compressImage } from "@/lib/utils";
import { useSetLayoutConfig } from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const PAGE_SIZE = 10;

type PhysicalPrize = {
  id: number;
  game_id: number | null;
  game_title: string | null;
  prize_type: string;
  prize_amount: number;
  prize_physical_name: string | null;
  delivery_status: string | null;
  delivery_address: string | null;
  delivery_phone: string | null;
  delivery_receipt_url: string | null;
  delivery_notes: string | null;
  created_at: string;
  user_id: number;
  user_name: string | null;
  user_ci: string | null;
  user_phone: string | null;
  user_department: string | null;
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:          { label: "⏳ Sin dirección",      color: "hsl(42 98% 30%)",   bg: "hsl(42 98% 52% / 0.1)",   border: "hsl(42 98% 52% / 0.3)" },
  address_submitted:{ label: "📍 Dirección recibida", color: "hsl(217 91% 35%)", bg: "hsl(217 91% 50% / 0.1)", border: "hsl(217 91% 50% / 0.3)" },
  shipped:          { label: "🚚 Enviado",             color: "hsl(262 80% 35%)",   bg: "hsl(262 80% 50% / 0.1)",  border: "hsl(262 80% 50% / 0.3)" },
  delivered:        { label: "✅ Entregado",            color: "hsl(142 70% 30%)",   bg: "hsl(142 70% 45% / 0.1)",  border: "hsl(142 70% 45% / 0.3)" },
};

function openReceipt(url: string) {
  if (url.startsWith("data:")) {
    fetch(url)
      .then(r => r.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const w = window.open(blobUrl, "_blank");
        if (!w) {
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = "boleta.jpg";
          a.click();
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      })
      .catch(() => toast.error("No se pudo abrir la boleta"));
  } else {
    window.open(url, "_blank");
  }
}

export default function AdminPhysicalPrizesPage() {
  useSetLayoutConfig({});
  const [, navigate] = useLocation();
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);

  const [prizes, setPrizes] = useState<PhysicalPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const [shipModal, setShipModal] = useState<PhysicalPrize | null>(null);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [shipNotes, setShipNotes] = useState("");
  const [shipLoading, setShipLoading] = useState(false);

  const [deliverModal, setDeliverModal] = useState<PhysicalPrize | null>(null);
  const [deliverNotes, setDeliverNotes] = useState("");
  const [deliverLoading, setDeliverLoading] = useState(false);

  const [inPersonModal, setInPersonModal] = useState<PhysicalPrize | null>(null);
  const [inPersonNotes, setInPersonNotes] = useState("");
  const [inPersonLoading, setInPersonLoading] = useState(false);

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/physical-prizes`, { headers: auth() });
      if (r.ok) setPrizes(await r.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function changeFilter(key: string) {
    setFilterStatus(key);
    setPage(0);
  }

  async function handleShip() {
    if (!shipModal) return;
    setShipLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/physical-prizes/${shipModal.id}/ship`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({
          delivery_receipt_url: receiptImage ?? undefined,
          delivery_notes: shipNotes || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "Error al actualizar"); return; }
      toast.success("🚚 Premio marcado como enviado");
      setShipModal(null); setReceiptImage(null); setShipNotes("");
      load();
    } catch { toast.error("Error de red"); } finally { setShipLoading(false); }
  }

  async function handleDeliver() {
    if (!deliverModal) return;
    setDeliverLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/physical-prizes/${deliverModal.id}/deliver`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ delivery_notes: deliverNotes || undefined }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "Error al actualizar"); return; }
      toast.success("✅ Premio marcado como entregado");
      setDeliverModal(null); setDeliverNotes("");
      load();
    } catch { toast.error("Error de red"); } finally { setDeliverLoading(false); }
  }

  async function handleInPersonDeliver() {
    if (!inPersonModal) return;
    setInPersonLoading(true);
    try {
      const notes = inPersonNotes.trim()
        ? `Entregado en persona. ${inPersonNotes.trim()}`
        : "Entregado en persona";
      const r = await fetch(`${BASE}/api/admin/physical-prizes/${inPersonModal.id}/deliver`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ delivery_notes: notes }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "Error al actualizar"); return; }
      toast.success("🤝 Premio marcado como entregado en persona");
      setInPersonModal(null); setInPersonNotes("");
      load();
    } catch { toast.error("Error de red"); } finally { setInPersonLoading(false); }
  }

  if (!user?.is_admin) return null;

  const filtered = filterStatus === "all" ? prizes : prizes.filter(p => p.delivery_status === filterStatus);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <>
      {/* Ship modal */}
      {shipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => { if (!shipLoading) { setShipModal(null); setReceiptImage(null); setShipNotes(""); } }}>
          <div className="rounded-3xl p-5 max-w-sm w-full space-y-4" style={{ background: "hsl(var(--background))" }}
            onClick={e => e.stopPropagation()}>
            <p className="font-black text-lg">🚚 Marcar como enviado</p>
            <p className="text-sm text-muted-foreground">
              Premio: <strong>{shipModal.prize_physical_name ?? "Objeto físico"}</strong><br />
              Ganador: {shipModal.user_name} — {shipModal.delivery_address}
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Boleta de envío (opcional)</label>
                {receiptImage ? (
                  <div className="relative rounded-xl overflow-hidden border">
                    <img src={receiptImage} alt="Boleta" className="w-full h-32 object-contain" />
                    <button type="button" onClick={() => setReceiptImage(null)}
                      className="absolute top-1 right-1 text-xs px-2 py-0.5 rounded cursor-pointer"
                      style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}>✕</button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center w-full h-20 rounded-xl border-2 border-dashed cursor-pointer hover:border-primary/50"
                    style={{ borderColor: "hsl(var(--border))" }}>
                    <span className="text-sm text-muted-foreground">📎 Subir imagen boleta</span>
                    <input type="file" accept="image/*" className="hidden" onChange={async e => {
                      const f = e.target.files?.[0]; if (!f) return;
                      setReceiptImage(await compressImage(f, 1200)); e.target.value = "";
                    }} />
                  </label>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notas (opcional)</label>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ background: "hsl(var(--background))", borderColor: "hsl(var(--border))" }}
                  placeholder="Empresa de envío, número de guía…"
                  value={shipNotes}
                  onChange={e => setShipNotes(e.target.value)}
                />
              </div>
              <button onClick={handleShip} disabled={shipLoading}
                className="w-full py-3 rounded-2xl font-black text-white text-sm disabled:opacity-50 cursor-pointer"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                {shipLoading ? "Guardando…" : "🚚 Confirmar envío"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-person deliver modal */}
      {inPersonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => { if (!inPersonLoading) { setInPersonModal(null); setInPersonNotes(""); } }}>
          <div className="rounded-3xl p-5 max-w-sm w-full space-y-4" style={{ background: "hsl(var(--background))" }}
            onClick={e => e.stopPropagation()}>
            <p className="font-black text-lg">🤝 Entregar en persona</p>
            <p className="text-sm text-muted-foreground">
              Vas a marcar <strong>{inPersonModal.prize_physical_name ?? "el premio físico"}</strong> como entregado directamente a <strong>{inPersonModal.user_name}</strong>, sin envío a domicilio.
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notas (opcional)</label>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ background: "hsl(var(--background))", borderColor: "hsl(var(--border))" }}
                  placeholder="Quién entregó, lugar, fecha…"
                  value={inPersonNotes}
                  onChange={e => setInPersonNotes(e.target.value)}
                />
              </div>
              <button onClick={handleInPersonDeliver} disabled={inPersonLoading}
                className="w-full py-3 rounded-2xl font-black text-white text-sm disabled:opacity-50 cursor-pointer"
                style={{ background: "linear-gradient(135deg, #0ea5e9, #0369a1)" }}>
                {inPersonLoading ? "Guardando…" : "🤝 Confirmar entrega en persona"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deliver modal */}
      {deliverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => { if (!deliverLoading) { setDeliverModal(null); setDeliverNotes(""); } }}>
          <div className="rounded-3xl p-5 max-w-sm w-full space-y-4" style={{ background: "hsl(var(--background))" }}
            onClick={e => e.stopPropagation()}>
            <p className="font-black text-lg">✅ Confirmar entrega</p>
            <p className="text-sm text-muted-foreground">
              Marca el premio <strong>{deliverModal.prize_physical_name ?? "Objeto físico"}</strong> como entregado a {deliverModal.user_name}.
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notas (opcional)</label>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ background: "hsl(var(--background))", borderColor: "hsl(var(--border))" }}
                  placeholder="Fecha de entrega, persona que recibió…"
                  value={deliverNotes}
                  onChange={e => setDeliverNotes(e.target.value)}
                />
              </div>
              <button onClick={handleDeliver} disabled={deliverLoading}
                className="w-full py-3 rounded-2xl font-black text-white text-sm disabled:opacity-50 cursor-pointer"
                style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
                {deliverLoading ? "Guardando…" : "✅ Confirmar entrega"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 max-w-2xl mx-auto pb-8">
        <div className="mb-4">
          <button onClick={() => navigate("/admin")} className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">
            ← Volver al admin
          </button>
        </div>
        <h1 className="text-2xl font-black mb-1">📦 Premios Físicos</h1>
        <p className="text-sm text-muted-foreground mb-4">Gestiona la entrega de premios físicos a los ganadores</p>

        {/* Filter bar */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
          {[
            { key: "all", label: "Todos" },
            { key: "pending", label: "Sin dirección" },
            { key: "address_submitted", label: "Dirección recibida" },
            { key: "shipped", label: "Enviados" },
            { key: "delivered", label: "Entregados" },
          ].map(f => (
            <button key={f.key} onClick={() => changeFilter(f.key)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer"
              style={{
                background: filterStatus === f.key ? "hsl(var(--primary))" : "transparent",
                color: filterStatus === f.key ? "white" : "hsl(var(--muted-foreground))",
                borderColor: filterStatus === f.key ? "transparent" : "hsl(var(--border))",
              }}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-2">📦</p>
            <p className="font-semibold">No hay premios físicos {filterStatus !== "all" ? "en este estado" : ""}</p>
          </div>
        ) : (
          <>
            {/* Count */}
            <p className="text-xs text-muted-foreground mb-3">
              {filtered.length} premio{filtered.length !== 1 ? "s" : ""} · página {page + 1} de {totalPages}
            </p>

            <div className="space-y-3">
              {paginated.map(p => {
                const sCfg = p.delivery_status ? STATUS_LABELS[p.delivery_status] : null;
                const isPhysicalOnly = p.prize_type === "physical";
                const hasCashComponent = !isPhysicalOnly && p.prize_amount > 0;

                return (
                  <div key={p.id} className="bg-card border rounded-2xl overflow-hidden">
                    {/* Banda de color según estado */}
                    <div className="h-1 w-full" style={{ background: sCfg ? sCfg.border.replace("/ 0.3)", ")") : "hsl(var(--border))" }} />

                    <div className="p-4 space-y-3">
                      {/* Fila 1: Premio + estado */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black text-base leading-tight truncate">{p.prize_physical_name ?? "Premio físico"}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            🎮 {p.game_title ?? "Juego"}
                            {hasCashComponent ? ` · Bs ${p.prize_amount.toLocaleString("es-BO", { minimumFractionDigits: 0 })} + objeto` : ""}
                          </p>
                        </div>
                        {sCfg && (
                          <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                            style={{ background: sCfg.bg, border: `1px solid ${sCfg.border}`, color: sCfg.color }}>
                            {sCfg.label}
                          </span>
                        )}
                      </div>

                      {/* Fila 2: Grilla 2 columnas — ganador | contacto */}
                      <div className="grid grid-cols-2 gap-2">
                        {/* Col izq: identidad */}
                        <div className="rounded-xl px-3 py-2.5 space-y-0.5" style={{ background: "hsl(var(--muted) / 0.5)" }}>
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Ganador</p>
                          <p className="text-sm font-bold leading-tight break-words">{p.user_name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">CI {p.user_ci ?? "—"}</p>
                          {p.user_department && (
                            <p className="text-xs text-muted-foreground">📍 {p.user_department}</p>
                          )}
                        </div>
                        {/* Col der: contacto */}
                        <div className="rounded-xl px-3 py-2.5 space-y-1.5" style={{ background: "hsl(var(--muted) / 0.5)" }}>
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Contacto</p>
                          {p.user_phone ? (
                            <a
                              href={`https://wa.me/591${p.user_phone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white w-fit"
                              style={{ background: "#25d366" }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.534 5.859L0 24l6.336-1.511A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.001-1.37l-.358-.214-3.723.888.924-3.638-.234-.374A9.818 9.818 0 1112 21.818z"/></svg>
                              Contactar
                            </a>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">Sin teléfono</p>
                          )}
                        </div>
                      </div>

                      {/* Dirección de entrega — colapsable */}
                      {p.delivery_address && (
                        <div className="rounded-xl px-3 py-2.5" style={{ background: "hsl(var(--muted) / 0.5)" }}>
                          <button
                            onClick={() => toggleExpand(p.id)}
                            className="w-full flex items-center justify-between cursor-pointer"
                          >
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">🏠 Dirección de entrega</p>
                            <span className="text-xs font-bold text-muted-foreground shrink-0 ml-2">
                              {expanded.has(p.id) ? "▲ Ver menos" : "▼ Ver más"}
                            </span>
                          </button>
                          {expanded.has(p.id) && (
                            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap mt-2">{p.delivery_address}</p>
                          )}
                        </div>
                      )}

                      {/* Notas de entrega — colapsable */}
                      {p.delivery_notes && (
                        <div className="rounded-xl px-3 py-2.5" style={{ background: "hsl(42 98% 52% / 0.06)", border: "1px solid hsl(42 98% 52% / 0.2)" }}>
                          <button
                            onClick={() => toggleExpand(p.id)}
                            className="w-full flex items-center justify-between cursor-pointer"
                          >
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">📝 Instrucciones / Notas</p>
                            <span className="text-xs font-bold text-muted-foreground shrink-0 ml-2">
                              {expanded.has(p.id) ? "▲ Ver menos" : "▼ Ver más"}
                            </span>
                          </button>
                          {expanded.has(p.id) && (
                            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap mt-2">{p.delivery_notes}</p>
                          )}
                        </div>
                      )}

                      {/* Separador + Actions */}
                      <div className="pt-1 border-t flex flex-wrap gap-2" style={{ borderColor: "hsl(var(--border))" }}>
                        {/* Pending */}
                        {p.delivery_status === "pending" && (
                          <>
                            <div className="flex-1 min-w-[140px] py-2 rounded-xl text-xs font-bold text-center"
                              style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.3)", color: "hsl(42 98% 35%)" }}>
                              ⏳ En espera de dirección
                            </div>
                            <button onClick={() => { setInPersonModal(p); setInPersonNotes(""); }}
                              className="px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer shrink-0"
                              style={{ background: "linear-gradient(135deg, #0ea5e9, #0369a1)" }}>
                              🤝 En persona
                            </button>
                          </>
                        )}

                        {/* Address submitted */}
                        {p.delivery_status === "address_submitted" && (
                          <>
                            <button onClick={() => { setShipModal(p); setReceiptImage(null); setShipNotes(""); }}
                              className="flex-1 min-w-[120px] py-2 rounded-xl text-xs font-bold text-white cursor-pointer"
                              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                              🚚 Marcar enviado
                            </button>
                            <button onClick={() => { setInPersonModal(p); setInPersonNotes(""); }}
                              className="px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer shrink-0"
                              style={{ background: "linear-gradient(135deg, #0ea5e9, #0369a1)" }}>
                              🤝 En persona
                            </button>
                          </>
                        )}

                        {/* Shipped */}
                        {p.delivery_status === "shipped" && (
                          <button onClick={() => { setDeliverModal(p); setDeliverNotes(""); }}
                            className="flex-1 py-2 rounded-xl text-xs font-bold text-white cursor-pointer"
                            style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
                            ✅ Marcar entregado
                          </button>
                        )}

                        {p.delivery_receipt_url && (
                          <button onClick={() => openReceipt(p.delivery_receipt_url!)}
                            className="px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer shrink-0"
                            style={{ borderColor: "hsl(var(--border))" }}>
                            📎 Boleta
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t" style={{ borderColor: "hsl(var(--border))" }}>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 rounded-xl text-sm font-bold border cursor-pointer disabled:opacity-40"
                  style={{ borderColor: "hsl(var(--border))" }}>
                  ← Anterior
                </button>
                <span className="text-xs text-muted-foreground font-medium">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-4 py-2 rounded-xl text-sm font-bold border cursor-pointer disabled:opacity-40"
                  style={{ borderColor: "hsl(var(--border))" }}>
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

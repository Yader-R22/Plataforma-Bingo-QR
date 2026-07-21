import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";
import { compressImage } from "@/lib/utils";
import { useSetLayoutConfig } from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:          { label: "⏳ Sin dirección",   color: "hsl(42 98% 30%)",   bg: "hsl(42 98% 52% / 0.1)",   border: "hsl(42 98% 52% / 0.3)" },
  address_submitted:{ label: "📍 Dirección recibida", color: "hsl(217 91% 35%)", bg: "hsl(217 91% 50% / 0.1)", border: "hsl(217 91% 50% / 0.3)" },
  shipped:          { label: "🚚 Enviado",          color: "hsl(262 80% 35%)",   bg: "hsl(262 80% 50% / 0.1)",  border: "hsl(262 80% 50% / 0.3)" },
  delivered:        { label: "✅ Entregado",         color: "hsl(142 70% 30%)",   bg: "hsl(142 70% 45% / 0.1)",  border: "hsl(142 70% 45% / 0.3)" },
};

export default function AdminPhysicalPrizesPage() {
  useSetLayoutConfig({});
  const [, navigate] = useLocation();
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);

  const [prizes, setPrizes] = useState<PhysicalPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [shipModal, setShipModal] = useState<PhysicalPrize | null>(null);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [shipNotes, setShipNotes] = useState("");
  const [shipLoading, setShipLoading] = useState(false);

  const [deliverModal, setDeliverModal] = useState<PhysicalPrize | null>(null);
  const [deliverNotes, setDeliverNotes] = useState("");
  const [deliverLoading, setDeliverLoading] = useState(false);

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/physical-prizes`, { headers: auth() });
      if (r.ok) setPrizes(await r.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

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
      toast.success("✅ Premio marcado como enviado");
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

  if (!user?.is_admin) return null;

  const filtered = filterStatus === "all" ? prizes : prizes.filter(p => p.delivery_status === filterStatus);

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

      <div className="p-4 max-w-2xl mx-auto">
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
            <button key={f.key} onClick={() => setFilterStatus(f.key)}
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
          <div className="space-y-3">
            {filtered.map(p => {
              const sCfg = p.delivery_status ? STATUS_LABELS[p.delivery_status] : null;
              return (
                <div key={p.id} className="bg-card border rounded-2xl p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-black text-base truncate">{p.prize_physical_name ?? "Premio físico"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.game_title ?? "Juego"} · Bs {p.prize_amount.toLocaleString("es-BO", { minimumFractionDigits: 0 })}</p>
                      <p className="text-xs font-medium mt-0.5">{p.user_name} <span className="text-muted-foreground">CI: {p.user_ci}</span></p>
                    </div>
                    {sCfg && (
                      <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{ background: sCfg.bg, border: `1px solid ${sCfg.border}`, color: sCfg.color }}>
                        {sCfg.label}
                      </span>
                    )}
                  </div>

                  {/* Delivery info */}
                  {p.delivery_address && (
                    <div className="rounded-xl px-3 py-2 space-y-1"
                      style={{ background: "hsl(var(--muted) / 0.5)" }}>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Datos de entrega</p>
                      <p className="text-sm font-medium">{p.delivery_address}</p>
                      <p className="text-xs text-muted-foreground">📞 {p.delivery_phone}</p>
                    </div>
                  )}

                  {p.delivery_notes && (
                    <p className="text-xs text-muted-foreground px-1">📝 {p.delivery_notes}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {(p.delivery_status === "pending" || p.delivery_status === "address_submitted") && (
                      <button onClick={() => { setShipModal(p); setReceiptImage(null); setShipNotes(""); }}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                        🚚 Marcar enviado
                      </button>
                    )}
                    {p.delivery_status === "shipped" && (
                      <button onClick={() => { setDeliverModal(p); setDeliverNotes(""); }}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer"
                        style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
                        ✅ Marcar entregado
                      </button>
                    )}
                    {p.delivery_receipt_url && (
                      <button onClick={() => window.open(p.delivery_receipt_url!, "_blank")}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold border cursor-pointer"
                        style={{ borderColor: "hsl(var(--border))" }}>
                        📎 Boleta
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

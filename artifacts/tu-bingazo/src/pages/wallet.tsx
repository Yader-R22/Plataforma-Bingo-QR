import { useState, useRef, useMemo } from "react";
import { useGetWallet, useListWithdrawals, useListEarnings } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const BANKS = ["Banco BNB", "Banco Económico", "Banco Unión", "Banco Mercantil", "Banco BISA"];

function statusConfig(status: string) {
  if (status === "pending") return { label: "⏳ Pendiente", bg: "hsl(42 98% 52% / 0.12)", border: "hsl(42 98% 52% / 0.3)", color: "hsl(42 98% 35%)" };
  if (status === "paid") return { label: "✓ Pagado", bg: "hsl(142 70% 45% / 0.12)", border: "hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" };
  return { label: "Rechazado", bg: "hsl(0 75% 52% / 0.12)", border: "hsl(0 75% 52% / 0.3)", color: "hsl(0 75% 40%)" };
}

export default function WalletPage() {
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const [step, setStep] = useState<"idle" | "amount" | "method" | "qr-upload" | "bank-form">("idle");
  const [amount, setAmount] = useState("");
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [bank, setBank] = useState(BANKS[0]);
  const [loading, setLoading] = useState(false);
  const [proofModal, setProofModal] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // History filter state
  type HistoryFilter = "all" | "week" | "month" | "year" | "custom";
  const [histFilter, setHistFilter] = useState<HistoryFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showAll, setShowAll] = useState(false);
  const PAGE = 5;

  const [histTab, setHistTab] = useState<"earnings" | "withdrawals">("earnings");

  const { data: wallet, refetch: refetchWallet } = useGetWallet();
  const { data: withdrawals, refetch: refetchWithdrawals } = useListWithdrawals();
  const { data: earnings } = useListEarnings();

  const filteredWithdrawals = useMemo(() => {
    const all = (withdrawals as any[]) ?? [];
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;
    if (histFilter === "week") {
      const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
      from = new Date(now); from.setDate(now.getDate() - day); from.setHours(0,0,0,0);
    } else if (histFilter === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (histFilter === "year") {
      from = new Date(now.getFullYear(), 0, 1);
    } else if (histFilter === "custom") {
      if (customFrom) { from = new Date(customFrom); from.setHours(0,0,0,0); }
      if (customTo) { to = new Date(customTo); to.setHours(23,59,59,999); }
    }
    return all.filter(w => {
      const d = new Date(w.created_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [withdrawals, histFilter, customFrom, customTo]);

  function handleQrFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target?.result as string;
      setQrBase64(b64);
      setQrPreview(b64);
    };
    reader.readAsDataURL(file);
  }

  async function submitWithdrawal(method: "qr" | "bank") {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) { toast.error("Ingresa un monto válido"); return; }
    if (wallet && numAmount > wallet.balance) { toast.error("Saldo insuficiente"); return; }

    let bankAccountInfo: string;
    let bankQrUrl: string | null = null;

    if (method === "qr") {
      if (!qrBase64) { toast.error("Por favor sube tu imagen QR"); return; }
      bankQrUrl = qrBase64;
      bankAccountInfo = JSON.stringify({ method: "qr" });
    } else {
      bankAccountInfo = JSON.stringify({
        method: "bank",
        bank,
        whatsapp: user?.phone ?? "",
        full_name: user?.full_name,
        ci: user?.ci,
      });
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/wallet/withdrawals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          amount: numAmount,
          method: "bank_transfer",
          bank_qr_url: bankQrUrl,
          bank_account_info: bankAccountInfo,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al solicitar retiro"); return; }
      toast.success("✅ Solicitud enviada. El administrador procesará tu retiro en 1-3 días hábiles.");
      setStep("idle"); setAmount(""); setQrPreview(null); setQrBase64(null);
      refetchWallet(); refetchWithdrawals();
    } catch {
      toast.error("Error al procesar la solicitud");
    } finally {
      setLoading(false);
    }
  }

  const numAmount = parseFloat(amount) || 0;

  return (
    <AppLayout>
      {proofModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setProofModal(null)}>
          <div className="bg-white rounded-3xl p-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-black">Comprobante de pago</p>
              <button onClick={() => setProofModal(null)} className="text-muted-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <img src={proofModal} alt="Comprobante" className="w-full rounded-2xl object-contain max-h-96" />
          </div>
        </div>
      )}

      <div className="hero-bg px-4 py-5 text-white">
        <h1 className="text-2xl font-black" style={{ fontFamily: "'Poppins', sans-serif" }}>💰 Mi Billetera</h1>
        <p className="text-white/60 text-sm">Saldo y retiros</p>
      </div>

      <div className="px-4 py-4 max-w-xl mx-auto space-y-4">
        {/* Balance card */}
        <div className="rounded-3xl p-6 text-white relative overflow-hidden stars-bg"
          style={{ background: "linear-gradient(135deg, #1a0050, #3b00b8)" }}>
          <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full opacity-10" style={{ background: "rgba(255,255,255,0.5)" }} />
          <div className="relative z-10">
            <p className="text-white/60 text-sm mb-1">Saldo disponible</p>
            <p className="font-black text-5xl prize-text" style={{ fontFamily: "'Poppins', sans-serif" }}>
              Bs {(wallet?.balance ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 2 })}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-white/15">
              {[
                { label: "Total ganado", value: wallet?.total_won ?? 0 },
                { label: "Retirado", value: wallet?.total_withdrawn ?? 0 },
                { label: "En proceso", value: wallet?.pending_withdrawals ?? 0 },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-white/50 text-xs">{item.label}</p>
                  <p className="font-bold text-sm mt-0.5">Bs {item.value.toLocaleString("es-BO", { minimumFractionDigits: 0 })}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* --- Withdrawal flow --- */}
        {step === "idle" && (
          <button className="btn-gold" onClick={() => setStep("amount")}
            disabled={!wallet || wallet.balance <= 0}>
            💸 Solicitar Retiro
          </button>
        )}

        {/* Step 1: Amount */}
        {step === "amount" && (
          <div className="bg-card border rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>¿Cuánto quieres retirar?</h3>
              <button onClick={() => setStep("idle")} className="text-muted-foreground p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <label className="flex items-center gap-2 rounded-xl border-2 px-4 py-3 bg-white cursor-text transition-all focus-within:border-primary"
              style={{ borderColor: "hsl(var(--border))" }}>
              <span className="font-bold text-xl shrink-0" style={{ color: "hsl(var(--muted-foreground))" }}>Bs</span>
              <input className="flex-1 outline-none text-2xl font-black bg-transparent" type="number"
                placeholder="0.00" min="1" step="0.01" max={wallet?.balance ?? 0}
                value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
            </label>
            {wallet && <p className="text-xs text-muted-foreground">Disponible: Bs {wallet.balance.toFixed(2)}</p>}
            <button className="btn-primary" onClick={() => {
              if (!amount || numAmount <= 0) { toast.error("Ingresa un monto"); return; }
              if (wallet && numAmount > wallet.balance) { toast.error("Saldo insuficiente"); return; }
              setStep("method");
            }}>Continuar →</button>
          </div>
        )}

        {/* Step 2: Method */}
        {step === "method" && (
          <div className="bg-card border rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => setStep("amount")} className="text-muted-foreground p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
              <h3 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>
                Retirar Bs {numAmount.toFixed(2)}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">¿Cómo quieres recibir tu dinero?</p>

            <button onClick={() => setStep("qr-upload")}
              className="w-full p-4 rounded-2xl border-2 text-left transition-all hover:border-primary"
              style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: "hsl(var(--primary) / 0.1)" }}>📱</div>
                <div>
                  <p className="font-black">Retiro por QR</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sube tu QR de cobro. El admin te enviará el dinero directamente.</p>
                </div>
              </div>
            </button>

            <button onClick={() => setStep("bank-form")}
              className="w-full p-4 rounded-2xl border-2 text-left transition-all hover:border-primary"
              style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: "hsl(var(--primary) / 0.1)" }}>🏧</div>
                <div>
                  <p className="font-black">Retiro por Cajero</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Recibirás un PIN para retirar desde cualquier cajero automático.</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Step 3a: QR Upload */}
        {step === "qr-upload" && (
          <div className="bg-card border rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep("method")} className="text-muted-foreground p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
              <h3 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>Sube tu QR de Cobro</h3>
            </div>

            <div
              className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all"
              style={{ borderColor: qrPreview ? "hsl(var(--primary))" : "hsl(var(--border))" }}
              onClick={() => fileRef.current?.click()}
            >
              {qrPreview ? (
                <div className="space-y-2">
                  <img src={qrPreview} alt="QR preview" className="max-h-48 mx-auto rounded-xl object-contain" />
                  <p className="text-xs text-muted-foreground">Toca para cambiar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-4xl">📷</div>
                  <p className="font-bold text-sm">Toca para subir tu QR</p>
                  <p className="text-xs text-muted-foreground">Desde tu galería o toma una foto</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleQrFile} />
            </div>

            <div className="rounded-xl p-3 text-xs flex items-start gap-2"
              style={{ background: "hsl(42 98% 52% / 0.08)", border: "1px solid hsl(42 98% 52% / 0.2)" }}>
              <span>💡</span>
              <span>Abre tu app de banco o billetera digital, ve a "Cobrar" y sube el QR que aparece.</span>
            </div>

            <div className="rounded-2xl p-3 flex items-center justify-between"
              style={{ background: "hsl(var(--muted))" }}>
              <span className="text-sm">Monto a retirar</span>
              <span className="font-black" style={{ color: "hsl(var(--primary))", fontFamily: "'Poppins', sans-serif" }}>
                Bs {numAmount.toFixed(2)}
              </span>
            </div>

            <button className="btn-primary" onClick={() => submitWithdrawal("qr")} disabled={loading || !qrBase64}>
              {loading ? "Enviando..." : "✅ Enviar solicitud"}
            </button>
          </div>
        )}

        {/* Step 3b: Cajero form */}
        {step === "bank-form" && (
          <div className="bg-card border rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep("method")} className="text-muted-foreground p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
              <h3 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>Retiro por Cajero</h3>
            </div>

            {/* Info auto-completada */}
            <div className="rounded-xl p-3 space-y-2" style={{ background: "hsl(var(--muted))" }}>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tus datos (auto-completados)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Nombre</p>
                  <p className="font-bold text-sm">{user?.full_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CI</p>
                  <p className="font-bold text-sm">{user?.ci}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">WhatsApp</p>
                  <p className="font-bold text-sm">{user?.phone || "—"}</p>
                </div>
              </div>
            </div>

            {/* Bank selection */}
            <div>
              <label className="text-sm font-bold block mb-2">🏦 Banco preferido</label>
              <div className="grid grid-cols-2 gap-2">
                {BANKS.map(b => (
                  <button key={b} onClick={() => setBank(b)}
                    className="py-2.5 px-3 rounded-xl border-2 text-xs font-bold transition-all text-center"
                    style={{
                      borderColor: bank === b ? "hsl(var(--primary))" : "hsl(var(--border))",
                      background: bank === b ? "hsl(var(--primary) / 0.08)" : "transparent",
                      color: bank === b ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                    }}>
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl p-3 text-xs flex items-start gap-2"
              style={{ background: "hsl(42 98% 52% / 0.08)", border: "1px solid hsl(42 98% 52% / 0.2)" }}>
              <span>🏧</span>
              <span>El admin te enviará un <strong>PIN de retiro</strong> por WhatsApp. Úsalo en cualquier cajero automático de {bank}.</span>
            </div>

            <div className="rounded-2xl p-3 flex items-center justify-between"
              style={{ background: "hsl(var(--muted))" }}>
              <span className="text-sm">Monto a retirar</span>
              <span className="font-black" style={{ color: "hsl(var(--primary))", fontFamily: "'Poppins', sans-serif" }}>
                Bs {numAmount.toFixed(2)}
              </span>
            </div>

            <button className="btn-primary" onClick={() => submitWithdrawal("bank")} disabled={loading}>
              {loading ? "Enviando..." : "✅ Enviar solicitud"}
            </button>
          </div>
        )}

        {/* History tabs */}
        <div>
          {/* Tab switcher */}
          <div className="grid grid-cols-2 gap-1.5 mb-4">
            {([
              { key: "earnings", label: "🏆 Premios ganados" },
              { key: "withdrawals", label: "💸 Retiros" },
            ] as const).map(t => (
              <button key={t.key} type="button"
                onClick={() => { setHistTab(t.key); setShowAll(false); }}
                className="py-2.5 rounded-xl text-xs font-bold border transition-all"
                style={{
                  background: histTab === t.key ? "hsl(var(--primary))" : "transparent",
                  color: histTab === t.key ? "white" : "hsl(var(--muted-foreground))",
                  borderColor: histTab === t.key ? "transparent" : "hsl(var(--border))",
                  boxShadow: histTab === t.key ? "0 2px 10px hsl(var(--primary) / 0.3)" : "none",
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Earnings panel */}
          {histTab === "earnings" && (() => {
            const list = (earnings as any[]) ?? [];
            const shown = list.slice(0, showAll ? undefined : PAGE);
            return list.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-4xl mb-2">🎱</p>
                <p className="font-semibold">Aún no has ganado ningún premio</p>
                <p className="text-sm mt-1">¡Juega y reclama tu bingo!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {shown.map((e: any) => {
                  const typeLabel: Record<string, string> = { daily: "Bingo Diario", weekly: "Bingo Semanal", monthly: "Bingo Mensual" };
                  return (
                    <div key={e.id} className="bg-card border rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(142 70% 30%)" }}>
                          +Bs {parseFloat(e.prize_amount).toLocaleString("es-BO", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm font-medium mt-0.5">{e.game_title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {typeLabel[e.game_type] ?? e.game_type} · {new Date(e.credited_at).toLocaleDateString("es-BO")}
                        </p>
                      </div>
                      <div className="text-xs font-bold px-3 py-1.5 rounded-full"
                        style={{ background: "hsl(142 70% 45% / 0.12)", border: "1px solid hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" }}>
                        ✓ Acreditado
                      </div>
                    </div>
                  );
                })}
                {list.length > PAGE && (
                  <button type="button" onClick={() => setShowAll(v => !v)}
                    className="w-full py-3 rounded-2xl text-sm font-bold border-2 transition-all"
                    style={{ borderColor: "hsl(var(--primary) / 0.3)", color: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.06)" }}>
                    {showAll ? "▲ Ver menos" : `▼ Ver más (${list.length - PAGE} más)`}
                  </button>
                )}
              </div>
            );
          })()}

          {/* Withdrawals panel */}
          {histTab === "withdrawals" && (<>
          {/* Filter bar */}
          {!!(withdrawals as any[])?.length && (
            <div className="mb-3 space-y-2">
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                {(["all", "week", "month", "year", "custom"] as const).map(f => {
                  const labels: Record<string, string> = { all: "Todo", week: "Esta semana", month: "Este mes", year: "Este año", custom: "Personalizado" };
                  const active = histFilter === f;
                  return (
                    <button key={f} type="button"
                      onClick={() => { setHistFilter(f); setShowAll(false); }}
                      className="text-xs font-bold px-3 py-1.5 rounded-full border transition-all shrink-0"
                      style={{
                        background: active ? "hsl(var(--primary))" : "transparent",
                        color: active ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                        borderColor: active ? "hsl(var(--primary))" : "hsl(var(--border))",
                      }}>
                      {labels[f]}
                    </button>
                  );
                })}
              </div>
              {histFilter === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">Desde</p>
                    <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setShowAll(false); }}
                      className="w-full border rounded-xl px-3 py-2 text-sm bg-background" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">Hasta</p>
                    <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setShowAll(false); }}
                      className="w-full border rounded-xl px-3 py-2 text-sm bg-background" />
                  </div>
                </div>
              )}
            </div>
          )}

          {!filteredWithdrawals.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-4xl mb-2">💸</p>
              <p className="font-semibold">{!(withdrawals as any[])?.length ? "Sin retiros todavía" : "Sin movimientos en este período"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredWithdrawals.slice(0, showAll ? undefined : PAGE).map((w: any) => {
                const isAdminCredit = w.method === "admin_credit";
                const isAdminDebit = w.method === "admin_debit";
                const isAdmin = isAdminCredit || isAdminDebit;

                let methodInfo: any = {};
                try { methodInfo = JSON.parse(w.bank_account_info ?? "{}"); } catch {}
                const isQr = methodInfo.method === "qr";
                const isBank = methodInfo.method === "bank";

                let methodLabel: string;
                if (isAdminCredit) methodLabel = "💰 Acreditado por Admin";
                else if (isAdminDebit) methodLabel = "💸 Débito por Admin";
                else if (isQr) methodLabel = "📱 QR";
                else if (isBank) methodLabel = `🏧 Cajero · ${methodInfo.bank ?? ""}`;
                else methodLabel = "Transferencia";

                // For admin adjustments override the status chip
                const sc = isAdminCredit
                  ? { label: "✓ Acreditado", bg: "hsl(142 70% 45% / 0.12)", border: "hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" }
                  : isAdminDebit
                  ? { label: "Débito", bg: "hsl(0 75% 52% / 0.12)", border: "hsl(0 75% 52% / 0.3)", color: "hsl(0 75% 40%)" }
                  : statusConfig(w.status);

                return (
                  <div key={w.id} className="bg-card border rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-black text-lg" style={{
                          fontFamily: "'Poppins', sans-serif",
                          color: isAdminCredit ? "hsl(142 70% 30%)" : isAdminDebit ? "hsl(0 75% 40%)" : undefined,
                        }}>
                          {isAdminCredit ? "+" : isAdminDebit ? "−" : "−"}Bs {parseFloat(w.amount).toLocaleString("es-BO", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {methodLabel} · {new Date(w.created_at).toLocaleDateString("es-BO")}
                        </p>
                      </div>
                      <div className="text-xs font-bold px-3 py-1.5 rounded-full"
                        style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}>
                        {sc.label}
                      </div>
                    </div>

                    {/* Admin note / comment */}
                    {isAdmin && w.notes && (
                      <div className="flex items-start gap-2 rounded-xl px-3 py-2"
                        style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
                        <span className="text-sm mt-0.5">🗒️</span>
                        <div>
                          <p className="text-xs text-muted-foreground">Nota del administrador</p>
                          <p className="text-sm font-medium">{w.notes}</p>
                        </div>
                      </div>
                    )}

                    {/* Paid QR: show proof button */}
                    {w.status === "paid" && isQr && w.payment_proof_url && (
                      <button
                        onClick={() => setProofModal(w.payment_proof_url)}
                        className="w-full py-2 rounded-xl text-xs font-bold border-2 transition-all"
                        style={{ borderColor: "hsl(142 70% 45% / 0.4)", color: "hsl(142 70% 30%)", background: "hsl(142 70% 45% / 0.08)" }}>
                        🧾 Ver comprobante de pago
                      </button>
                    )}

                    {/* Paid Bank: show PIN */}
                    {w.status === "paid" && isBank && w.withdrawal_pin && (
                      <div className="flex items-center gap-2 rounded-xl px-3 py-2"
                        style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.2)" }}>
                        <span className="text-base">🔑</span>
                        <div>
                          <p className="text-xs text-muted-foreground">PIN de retiro en cajero</p>
                          <p className="font-black text-lg tracking-[0.2em]" style={{ color: "hsl(var(--primary))", fontFamily: "'Poppins', sans-serif" }}>
                            {w.withdrawal_pin}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Ver más / Ver menos */}
              {filteredWithdrawals.length > PAGE && (
                <button
                  type="button"
                  onClick={() => setShowAll(v => !v)}
                  className="w-full py-3 rounded-2xl text-sm font-bold border-2 transition-all"
                  style={{
                    borderColor: "hsl(var(--primary) / 0.3)",
                    color: "hsl(var(--primary))",
                    background: "hsl(var(--primary) / 0.06)",
                  }}>
                  {showAll
                    ? "▲ Ver menos"
                    : `▼ Ver más (${filteredWithdrawals.length - PAGE} más)`}
                </button>
              )}
            </div>
          )}
          </>)}
        </div>
      </div>
    </AppLayout>
  );
}

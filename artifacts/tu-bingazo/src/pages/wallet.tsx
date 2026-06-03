import { useState } from "react";
import { useGetWallet, useListWithdrawals } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const METHODS = [
  { value: "cash", label: "💵 Efectivo en caja" },
  { value: "bank_transfer", label: "🏦 Transferencia bancaria (QR)" },
];

function statusConfig(status: string) {
  if (status === "pending") return { label: "Pendiente", bg: "hsl(42 98% 52% / 0.12)", border: "hsl(42 98% 52% / 0.3)", color: "hsl(42 98% 35%)" };
  if (status === "paid") return { label: "Pagado ✓", bg: "hsl(142 70% 45% / 0.12)", border: "hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" };
  return { label: "Rechazado", bg: "hsl(0 75% 52% / 0.12)", border: "hsl(0 75% 52% / 0.3)", color: "hsl(0 75% 40%)" };
}

export default function WalletPage() {
  const token = useAuthStore(s => s.token);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [bankInfo, setBankInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: wallet, refetch: refetchWallet } = useGetWallet();
  const { data: withdrawals, refetch: refetchWithdrawals } = useListWithdrawals();

  async function requestWithdrawal(e: React.FormEvent) {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) { toast.error("Ingresa un monto válido"); return; }
    if (wallet && numAmount > wallet.balance) { toast.error("Saldo insuficiente"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/wallet/withdrawals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ amount: numAmount, method, bank_account_info: bankInfo || null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al solicitar retiro"); return; }
      toast.success("✅ Solicitud enviada. El administrador procesará tu pago en 2-3 días hábiles.");
      setShowForm(false); setAmount("");
      refetchWallet(); refetchWithdrawals();
    } catch {
      toast.error("Error al procesar la solicitud");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="hero-bg px-4 py-5 text-white">
        <h1 className="text-2xl font-black" style={{ fontFamily: "'Poppins', sans-serif" }}>💰 Mi Billetera</h1>
        <p className="text-white/60 text-sm">Saldo y retiros</p>
      </div>

      <div className="px-4 py-4 max-w-xl mx-auto space-y-4">
        {/* Balance card */}
        <div
          className="rounded-3xl p-6 text-white relative overflow-hidden stars-bg"
          style={{ background: "linear-gradient(135deg, #1a0050, #3b00b8)" }}
        >
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

        {/* Withdrawal form */}
        {!showForm ? (
          <button
            className="btn-gold"
            onClick={() => setShowForm(true)}
            disabled={!wallet || wallet.balance <= 0}
          >
            💸 Solicitar Retiro
          </button>
        ) : (
          <div className="bg-card border rounded-2xl p-5">
            <h3 className="font-black text-lg mb-4" style={{ fontFamily: "'Poppins', sans-serif" }}>
              Solicitar Retiro
            </h3>
            <form onSubmit={requestWithdrawal} className="space-y-4">
              <div>
                <label className="text-sm font-bold block mb-1.5">Monto a retirar (Bs)</label>
                <input
                  className="input-field"
                  type="number"
                  placeholder="0.00"
                  min="1"
                  step="0.01"
                  max={wallet?.balance ?? 0}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                />
                {wallet && <p className="text-xs text-muted-foreground mt-1">Disponible: Bs {wallet.balance.toFixed(2)}</p>}
              </div>
              <div>
                <label className="text-sm font-bold block mb-1.5">Método de cobro</label>
                <div className="space-y-2">
                  {METHODS.map(m => (
                    <label key={m.value} className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all"
                      style={{
                        borderColor: method === m.value ? "hsl(var(--primary))" : "hsl(var(--border))",
                        background: method === m.value ? "hsl(var(--primary) / 0.06)" : "transparent",
                      }}
                    >
                      <input type="radio" name="method" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} className="sr-only" />
                      <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                        style={{ borderColor: method === m.value ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                        {method === m.value && <div className="w-2 h-2 rounded-full" style={{ background: "hsl(var(--primary))" }} />}
                      </div>
                      <span className="text-sm font-semibold">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {method === "bank_transfer" && (
                <div>
                  <label className="text-sm font-bold block mb-1.5">Datos bancarios / QR</label>
                  <textarea
                    className="input-field resize-none"
                    rows={3}
                    placeholder="Banco, N° de cuenta, Titular o adjunta tu QR de cobro"
                    value={bankInfo}
                    onChange={e => setBankInfo(e.target.value)}
                  />
                </div>
              )}

              <div
                className="rounded-xl p-3 flex items-start gap-2 text-xs"
                style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.3)" }}
              >
                <span>⏱️</span>
                <span>El procesamiento del pago toma <strong>2 a 3 días hábiles</strong>. El monto se debitará de tu billetera cuando el administrador confirme la transferencia.</span>
              </div>

              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                  {loading ? "Enviando..." : "Solicitar"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-3 rounded-[14px] border-2 font-bold text-sm"
                  style={{ borderColor: "hsl(var(--border))" }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Withdrawal history */}
        <div>
          <h2 className="font-black text-lg mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>
            Historial de Retiros
          </h2>
          {!withdrawals?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-4xl mb-2">💸</p>
              <p className="font-semibold">Sin retiros todavía</p>
              <p className="text-sm mt-1">Tus retiros aparecerán aquí</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(withdrawals as any[]).map((w: any) => {
                const sc = statusConfig(w.status);
                return (
                  <div key={w.id} className="bg-card border rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>
                        Bs {parseFloat(w.amount).toLocaleString("es-BO", { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {w.method === "cash" ? "💵 Efectivo" : "🏦 Transferencia"} · {new Date(w.created_at).toLocaleDateString("es-BO")}
                      </p>
                    </div>
                    <div
                      className="text-xs font-bold px-3 py-1.5 rounded-full"
                      style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}
                    >
                      {sc.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

import { useState, useRef } from "react";
import { useGetWallet, useListWithdrawals } from "@workspace/api-client-react";
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

type WithdrawMethod = "qr" | "bank";

export default function WalletPage() {
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const [step, setStep] = useState<"idle" | "amount" | "method" | "qr-upload" | "bank-form">("idle");
  const [amount, setAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState<WithdrawMethod>("qr");
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [bank, setBank] = useState(BANKS[0]);
  const [whatsapp, setWhatsapp] = useState(user?.phone ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: wallet, refetch: refetchWallet } = useGetWallet();
  const { data: withdrawals, refetch: refetchWithdrawals } = useListWithdrawals();

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

  async function submitWithdrawal() {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) { toast.error("Ingresa un monto válido"); return; }
    if (wallet && numAmount > wallet.balance) { toast.error("Saldo insuficiente"); return; }

    let bankAccountInfo: string | null = null;
    let bankQrUrl: string | null = null;

    if (withdrawMethod === "qr") {
      if (!qrBase64) { toast.error("Por favor sube tu imagen QR"); return; }
      bankQrUrl = qrBase64;
      bankAccountInfo = JSON.stringify({ method: "qr" });
    } else {
      if (!whatsapp.trim()) { toast.error("Ingresa tu número de WhatsApp"); return; }
      bankAccountInfo = JSON.stringify({
        method: "bank",
        bank,
        account_number: accountNumber,
        whatsapp: whatsapp.trim(),
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
      setStep("idle"); setAmount(""); setQrPreview(null); setQrBase64(null); setAccountNumber("");
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
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">Bs</span>
              <input className="input-field pl-10 text-xl font-black" type="number" placeholder="0.00"
                min="1" step="0.01" max={wallet?.balance ?? 0} value={amount}
                onChange={e => setAmount(e.target.value)} />
            </div>
            {wallet && <p className="text-xs text-muted-foreground">Disponible: Bs {wallet.balance.toFixed(2)}</p>}
            <button className="btn-primary" onClick={() => { if (!amount || numAmount <= 0) { toast.error("Ingresa un monto"); return; } if (wallet && numAmount > wallet.balance) { toast.error("Saldo insuficiente"); return; } setStep("method"); }}>
              Continuar →
            </button>
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

            <button onClick={() => { setWithdrawMethod("qr"); setStep("qr-upload"); }}
              className="w-full p-4 rounded-2xl border-2 text-left transition-all hover:border-primary"
              style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: "hsl(var(--primary) / 0.1)" }}>📱</div>
                <div>
                  <p className="font-black">Retiro por QR</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sube tu QR de cobro de tu app bancaria o billetera digital. El admin te enviará el dinero escaneándolo.</p>
                </div>
              </div>
            </button>

            <button onClick={() => { setWithdrawMethod("bank"); setStep("bank-form"); }}
              className="w-full p-4 rounded-2xl border-2 text-left transition-all hover:border-primary"
              style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: "hsl(var(--primary) / 0.1)" }}>🏦</div>
                <div>
                  <p className="font-black">Retiro por Banco/Cajero</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Especifica tu banco y datos para que el admin realice la transferencia directa a tu cuenta.</p>
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
                  <p className="text-xs text-muted-foreground">Toca para cambiar la imagen</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-4xl">📷</div>
                  <p className="font-bold text-sm">Toca para subir tu QR</p>
                  <p className="text-xs text-muted-foreground">Desde tu galería o captura una foto</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleQrFile} />
            </div>

            <div className="rounded-xl p-3 text-xs flex items-start gap-2"
              style={{ background: "hsl(42 98% 52% / 0.08)", border: "1px solid hsl(42 98% 52% / 0.2)" }}>
              <span>💡</span>
              <span>Abre tu app de banco o billetera digital, ve a "Cobrar" o "Recibir" y sube la imagen del QR que aparece ahí.</span>
            </div>

            <div className="rounded-2xl p-3 flex items-center justify-between"
              style={{ background: "hsl(var(--muted))" }}>
              <span className="text-sm">Monto a retirar</span>
              <span className="font-black" style={{ color: "hsl(var(--primary))", fontFamily: "'Poppins', sans-serif" }}>
                Bs {numAmount.toFixed(2)}
              </span>
            </div>

            <button className="btn-primary" onClick={submitWithdrawal} disabled={loading || !qrBase64}>
              {loading ? "Enviando..." : "✅ Enviar solicitud de retiro"}
            </button>
          </div>
        )}

        {/* Step 3b: Bank form */}
        {step === "bank-form" && (
          <div className="bg-card border rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep("method")} className="text-muted-foreground p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
              <h3 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>Datos para Transferencia</h3>
            </div>

            {/* Auto-filled name and CI */}
            <div className="rounded-xl p-3 space-y-2" style={{ background: "hsl(var(--muted))" }}>
              <p className="text-xs font-bold text-muted-foreground">DATOS AUTO-COMPLETADOS</p>
              <div className="flex gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Nombre completo</p>
                  <p className="font-bold text-sm">{user?.full_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CI</p>
                  <p className="font-bold text-sm">{user?.ci}</p>
                </div>
              </div>
            </div>

            {/* Bank selection */}
            <div>
              <label className="text-sm font-bold block mb-2">🏦 Banco</label>
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

            <div>
              <label className="text-sm font-bold block mb-1.5">📱 WhatsApp</label>
              <input className="input-field" type="tel" placeholder="+591 70000000"
                value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
            </div>

            <div>
              <label className="text-sm font-bold block mb-1.5">🔢 Número de cuenta (opcional)</label>
              <input className="input-field" type="text" placeholder="Número de cuenta bancaria"
                value={accountNumber} onChange={e => setAccountNumber(e.target.value)} />
            </div>

            <div className="rounded-2xl p-3 flex items-center justify-between"
              style={{ background: "hsl(var(--muted))" }}>
              <span className="text-sm">Monto a retirar</span>
              <span className="font-black" style={{ color: "hsl(var(--primary))", fontFamily: "'Poppins', sans-serif" }}>
                Bs {numAmount.toFixed(2)}
              </span>
            </div>

            <button className="btn-primary" onClick={submitWithdrawal} disabled={loading}>
              {loading ? "Enviando..." : "✅ Enviar solicitud de retiro"}
            </button>
          </div>
        )}

        {/* Withdrawal history */}
        <div>
          <h2 className="font-black text-lg mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>
            Historial de Retiros
          </h2>
          {!(withdrawals as any[])?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-4xl mb-2">💸</p>
              <p className="font-semibold">Sin retiros todavía</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(withdrawals as any[]).map((w: any) => {
                const sc = statusConfig(w.status);
                let methodLabel = "Transferencia";
                try {
                  const info = JSON.parse(w.bank_account_info ?? "{}");
                  if (info.method === "qr") methodLabel = "📱 QR";
                  else if (info.bank) methodLabel = `🏦 ${info.bank}`;
                } catch {}
                return (
                  <div key={w.id} className="bg-card border rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>
                        Bs {parseFloat(w.amount).toLocaleString("es-BO", { minimumFractionDigits: 2 })}
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

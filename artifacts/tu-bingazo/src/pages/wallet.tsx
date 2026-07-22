import { useState, useRef, useMemo, useEffect } from "react";
import { useGetWallet, useListWithdrawals, useListEarnings, useListCommissions } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useSetLayoutConfig } from "@/components/AppLayout";
import { compressImage } from "@/lib/utils";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const BANKS = ["Banco BNB", "Banco Económico", "Banco Unión", "Banco Mercantil", "Banco BISA"];

function fmtCompact(n: number): string {
  if (n >= 1_000_000) { const v = n / 1_000_000; return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`; }
  if (n >= 1_000)     { const v = n / 1_000;     return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`; }
  return n.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function statusConfig(status: string) {
  if (status === "pending") return { label: "⏳ Pendiente", bg: "hsl(42 98% 52% / 0.12)", border: "hsl(42 98% 52% / 0.3)", color: "hsl(42 98% 35%)" };
  if (status === "paid") return { label: "✓ Pagado", bg: "hsl(142 70% 45% / 0.12)", border: "hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" };
  return { label: "Rechazado", bg: "hsl(0 75% 52% / 0.12)", border: "hsl(0 75% 52% / 0.3)", color: "hsl(0 75% 40%)" };
}

export default function WalletPage() {
  useSetLayoutConfig({ hideTopBar: true });
  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);
  const site = useSiteSettings();
  const [step, setStep] = useState<"idle" | "amount" | "method" | "qr-upload" | "bank-form">("idle");
  const [amount, setAmount] = useState("");
  const [cajeroError, setCajeroError] = useState(false);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [bank, setBank] = useState(BANKS[0]);
  const [loading, setLoading] = useState(false);
  const [proofModal, setProofModal] = useState<string | null>(null);
  const [addressModal, setAddressModal] = useState<number | null>(null);
  const [addrLine, setAddrLine] = useState("");
  const [addrPhone, setAddrPhone] = useState("");
  const [addrLoading, setAddrLoading] = useState(false);
  const [confirmReceiptId, setConfirmReceiptId] = useState<number | null>(null);
  const [confirmReceiptLoading, setConfirmReceiptLoading] = useState(false);

  // Top-up state
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpStep, setTopUpStep] = useState<"amount" | "generating" | "enlazo-qr" | "static-qr" | "done">("amount");
  const [topUpQrImage, setTopUpQrImage] = useState<string | null>(null);
  const [topUpCheckoutId, setTopUpCheckoutId] = useState<string | null>(null);
  const [topUpReceiptUrl, setTopUpReceiptUrl] = useState<string | null>(null);
  const [topUpUploading, setTopUpUploading] = useState(false);
  const [topUpPollRef, setTopUpPollRef] = useState<ReturnType<typeof setInterval> | null>(null);
  const topUpReceiptFileRef = useRef<HTMLInputElement>(null);

  async function handleConfirmReceipt(winnerId: number) {
    setConfirmReceiptId(winnerId);
    setConfirmReceiptLoading(true);
    try {
      const r = await fetch(`${BASE}/api/wallet/physical-prizes/${winnerId}/confirm-receipt`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      let d: { error?: string } = {};
      try { d = await r.json(); } catch { /* ignore parse errors */ }
      if (!r.ok) { toast.error(d.error || "Error al confirmar"); return; }
      toast.success("✅ ¡Gracias! Premio marcado como recibido");
      refetchEarnings();
    } catch { toast.error("Error de red"); } finally {
      setConfirmReceiptLoading(false);
      setConfirmReceiptId(null);
    }
  }

  const { data: earnings, isLoading: loadingEarnings, refetch: refetchEarnings } = useListEarnings();
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
  const { data: withdrawals, isLoading: loadingWithdrawals, refetch: refetchWithdrawals } = useListWithdrawals();
  // earnings moved above (declared with refetch)
  const { data: commissions, isLoading: loadingCommissions } = useListCommissions();

  // My top-ups (recargas) — fetched separately and merged into Movimientos
  const [myTopUps, setMyTopUps] = useState<any[]>([]);
  const [loadingTopUps, setLoadingTopUps] = useState(true);
  const refetchTopUps = async () => {
    try {
      const r = await fetch(`${BASE}/api/wallet-top-ups/my`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setMyTopUps(await r.json());
    } catch { /* ignore */ }
    finally { setLoadingTopUps(false); }
  };
  useEffect(() => { refetchTopUps(); }, []);

  // Auto-poll balance + withdrawals so the user sees paid/rejected changes in real time.
  // 15s interval + document.hidden guard prevents ghost requests with tab in background.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) { refetchWallet(); refetchWithdrawals(); refetchTopUps(); }
    }, 15_000);
    return () => clearInterval(id);
  }, [refetchWallet, refetchWithdrawals]);

  // Lock body scroll when top-up modal is open
  useEffect(() => {
    if (!showTopUpModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [showTopUpModal]);

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

  const filteredTopUps = useMemo(() => {
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
    return myTopUps.filter(t => {
      const d = new Date(t.created_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [myTopUps, histFilter, customFrom, customTo]);

  async function handleQrFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await compressImage(file, 800);
    setQrBase64(b64);
    setQrPreview(b64);
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

  // ── Top-up helpers ────────────────────────────────────────────────────────
  function openTopUpModal() {
    setShowTopUpModal(true);
    setTopUpStep("amount");
    setTopUpAmount("");
    setTopUpQrImage(null);
    setTopUpCheckoutId(null);
    setTopUpReceiptUrl(null);
  }

  function closeTopUpModal() {
    if (topUpPollRef) { clearInterval(topUpPollRef); setTopUpPollRef(null); }
    setShowTopUpModal(false);
    setTopUpStep("amount");
    setTopUpAmount("");
    setTopUpQrImage(null);
    setTopUpCheckoutId(null);
    setTopUpReceiptUrl(null);
  }

  async function generateTopUpQr() {
    const amt = parseFloat(topUpAmount);
    if (!amt || amt < 5) { toast.error("El monto mínimo es Bs 5"); return; }
    if (amt > 5000) { toast.error("El monto máximo es Bs 5.000"); return; }

    // Always try dynamic QR first — fallback to static only if API returns error
    setTopUpStep("generating");
    try {
      const res = await fetch(`${BASE}/api/wallet-top-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amt }),
      });
      const data = await res.json() as { checkout_id?: string; qr_image?: string; qr_error?: string; error?: string };
      if (!res.ok) { toast.error(data.error || "Error al generar recarga"); setTopUpStep("amount"); return; }

      setTopUpCheckoutId(data.checkout_id ?? null);

      if (data.qr_image && !data.qr_error) {
        setTopUpQrImage(data.qr_image);
        setTopUpStep("enlazo-qr");

        // Start polling
        const interval = setInterval(async () => {
          try {
            const r = await fetch(`${BASE}/api/wallet-top-ups/${data.checkout_id}/status`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!r.ok) return;
            const s = await r.json() as { status: string };
            if (s.status === "completed") {
              clearInterval(interval);
              setTopUpPollRef(null);
              setTopUpStep("done");
              refetchWallet();
              toast.success("💰 ¡Recarga exitosa! Saldo acreditado.");
            }
          } catch { /* ignore */ }
        }, 3000);
        setTopUpPollRef(interval);
      } else {
        // Enlazo failed → fallback to static; clear QR image so "done" shows correct message
        setTopUpQrImage(null);
        setTopUpStep("static-qr");
      }
    } catch {
      toast.error("Error de red. Intenta de nuevo.");
      setTopUpStep("amount");
    }
  }

  function downloadTopUpQR() {
    if (!topUpQrImage) return;
    const W = 480, H = 640, QR = 240, SCALE = 3;
    const qrImg = new Image();
    qrImg.crossOrigin = "anonymous";
    qrImg.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * SCALE; canvas.height = H * SCALE;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(SCALE, SCALE);

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#7c3aed"); grad.addColorStop(1, "#4f46e5");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

      // Decorative circles
      ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(W - 40, 60, 110, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(50, H - 60, 90, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Platform name
      const siteName = site?.site_name ?? "Tu Bingazo";
      const siteEmoji = site?.site_emoji ?? "🎱";
      ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`${siteEmoji}  ${siteName.toUpperCase()}`, W / 2, 44);

      // Title
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 22px sans-serif";
      ctx.fillText("Recarga de billetera", W / 2, 84);

      // Amount
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "14px sans-serif";
      ctx.fillText("Monto a pagar", W / 2, 120);
      ctx.fillStyle = "#fbbf24"; ctx.font = "bold 48px sans-serif";
      ctx.fillText(`Bs ${parseFloat(topUpAmount).toFixed(0)}`, W / 2, 168);

      // Divider
      ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(40, 188); ctx.lineTo(W - 40, 188); ctx.stroke();

      // QR white card
      const qrCardX = (W - QR - 40) / 2, qrCardY = 200;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(qrCardX, qrCardY, QR + 40, QR + 40, 20);
      ctx.fill();
      ctx.drawImage(qrImg, qrCardX + 20, qrCardY + 20, QR, QR);

      // Instruction
      ctx.fillStyle = "rgba(255,255,255,0.65)"; ctx.font = "13px sans-serif";
      ctx.fillText("Escanea con tu app bancaria o billetera digital", W / 2, qrCardY + QR + 58);

      // Footer pill
      const pillW = 180, pillH = 32, pillX = (W - pillW) / 2, pillY = H - 48;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath(); ctx.roundRect(pillX, pillY, pillW, pillH, 16); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "11px sans-serif";
      ctx.fillText(`${siteEmoji}  ${siteName}`, W / 2, pillY + 20);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `recarga-qr-${topUpCheckoutId ?? Date.now()}.png`;
      a.click();
    };
    qrImg.src = topUpQrImage;
  }

  async function handleTopUpReceiptFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTopUpUploading(true);
    try {
      const compressed = await compressImage(file, 1200, 0.85);
      const blob = await fetch(compressed).then(r => r.blob());
      const form = new FormData();
      form.append("receipt", blob, "recarga.jpg");
      const res = await fetch(`${BASE}/api/wallet-top-ups/upload-receipt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) { toast.error(data.error || "Error al subir comprobante"); return; }
      setTopUpReceiptUrl(data.url);
    } catch { toast.error("Error al procesar imagen"); }
    finally { setTopUpUploading(false); }
  }

  async function submitStaticTopUp() {
    if (!topUpReceiptUrl) { toast.error("Sube el comprobante primero"); return; }
    const amt = parseFloat(topUpAmount);
    try {
      const res = await fetch(`${BASE}/api/wallet-top-ups/static`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amt, receipt_url: topUpReceiptUrl }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { toast.error(data.error || "Error al enviar solicitud"); return; }
      setTopUpStep("done");
      toast.success("✅ Solicitud enviada. El administrador revisará tu comprobante.");
    } catch { toast.error("Error de red. Intenta de nuevo."); }
  }

  async function submitAddress() {
    if (!addrLine.trim()) { toast.error("Ingresa las especificaciones de envío"); return; }
    if (!addressModal) return;
    setAddrLoading(true);
    try {
      const res = await fetch(`${BASE}/api/wallet/physical-prizes/${addressModal}/address`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ delivery_address: addrLine.trim(), delivery_phone: user?.phone ?? "" }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al enviar dirección"); return; }
      toast.success("✅ Datos enviados. El administrador coordinará la entrega.");
      setAddressModal(null);
      refetchEarnings();
    } catch {
      toast.error("Error al enviar. Intenta de nuevo.");
    } finally {
      setAddrLoading(false);
    }
  }

  return (
    <>
      {addressModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setAddressModal(null)}>
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-black text-base">📍 Datos de entrega</p>
              <button onClick={() => setAddressModal(null)} className="text-muted-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <p className="text-sm text-muted-foreground -mt-2">El administrador coordinará la entrega usando tu WhatsApp registrado.</p>
            {user?.phone && (
              <div className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <span className="text-base">📱</span>
                <div>
                  <p className="text-[11px] text-green-700 font-bold">WhatsApp registrado</p>
                  <p className="text-sm font-black">{user.phone}</p>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-bold">Especificaciones de envío</label>
              <textarea
                className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-400 resize-none"
                placeholder="Ej: Envíenme a Santa Cruz de la Sierra. Puedo recogerlo en la zona norte de la ciudad."
                rows={3}
                value={addrLine}
                onChange={e => setAddrLine(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Indica cómo o dónde prefieres recibir tu premio.</p>
            </div>
            <button
              onClick={submitAddress}
              disabled={addrLoading}
              className="w-full py-3 rounded-2xl text-sm font-black text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
              {addrLoading ? "Enviando..." : "Enviar datos"}
            </button>
          </div>
        </div>
      )}
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

      {/* ── Top-up modal ─────────────────────────────────────────────── */}
      {showTopUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 pb-24"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
          onClick={e => { if (e.target === e.currentTarget) closeTopUpModal(); }}>
          <div className="modal-pop bg-white rounded-3xl p-5 max-w-sm w-full space-y-4 max-h-[80vh] overflow-y-auto shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between">
              <p className="font-black text-base" style={{ fontFamily: "'Poppins', sans-serif" }}>
                {topUpStep === "done" ? "🎉 ¡Listo!" : "💳 Recargar Billetera"}
              </p>
              <button onClick={closeTopUpModal} className="text-muted-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Step: amount input */}
            {topUpStep === "amount" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground -mt-2">Ingresa el monto que deseas agregar a tu billetera.</p>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold">Monto (Bs)</label>
                  <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-purple-400">
                    <span className="font-black text-muted-foreground">Bs</span>
                    <input
                      type="number" min="5" max="5000" step="1"
                      className="flex-1 outline-none text-xl font-black bg-transparent"
                      placeholder="0"
                      value={topUpAmount}
                      onChange={e => setTopUpAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") generateTopUpQr(); }}
                      autoFocus
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Mínimo Bs 5 — máximo Bs 5.000</p>
                </div>
                {/* Quick amounts */}
                <div className="flex gap-2 flex-wrap">
                  {[20, 50, 100, 200].map(v => (
                    <button key={v} onClick={() => setTopUpAmount(String(v))}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold border"
                      style={{
                        borderColor: topUpAmount === String(v) ? "hsl(var(--primary))" : "hsl(var(--border))",
                        background: topUpAmount === String(v) ? "hsl(var(--primary) / 0.1)" : "transparent",
                        color: topUpAmount === String(v) ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                      }}>
                      Bs {v}
                    </button>
                  ))}
                </div>
                <button onClick={generateTopUpQr}
                  className="w-full py-3 rounded-2xl text-sm font-black text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                  Continuar →
                </button>
              </div>
            )}

            {/* Step: generating */}
            {topUpStep === "generating" && (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                <p className="text-sm font-bold text-muted-foreground">Generando QR de pago...</p>
              </div>
            )}

            {/* Step: Enlazo QR */}
            {topUpStep === "enlazo-qr" && topUpQrImage && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground -mt-2">Escanea el QR con tu banca móvil para pagar <strong>Bs {parseFloat(topUpAmount).toFixed(0)}</strong>. El saldo se acreditará automáticamente.</p>
                <div className="flex justify-center">
                  <div className="p-3 rounded-2xl border-2 border-purple-100 bg-white shadow-inner">
                    <img src={topUpQrImage} alt="QR Enlazo" className="w-52 h-52 object-contain rounded-xl" />
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: "hsl(142 70% 45% / 0.08)", border: "1px solid hsl(142 70% 45% / 0.2)" }}>
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                  <p className="text-xs font-bold text-green-700">Esperando confirmación de pago...</p>
                </div>
                <button onClick={downloadTopUpQR}
                  className="w-full py-2.5 rounded-xl text-sm font-bold border-2 flex items-center justify-center gap-2"
                  style={{ borderColor: "hsl(var(--primary) / 0.35)", color: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.06)" }}>
                  ⬇️ Descargar código QR
                </button>
                <button onClick={() => { if (topUpPollRef) { clearInterval(topUpPollRef); setTopUpPollRef(null); } setTopUpQrImage(null); setTopUpStep("static-qr"); }}
                  className="w-full py-2.5 rounded-xl text-xs font-bold border"
                  style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                  ¿Problemas con el QR? → Pagar con comprobante
                </button>
              </div>
            )}

            {/* Step: static QR + receipt upload */}
            {topUpStep === "static-qr" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground -mt-2">
                  Transfiere <strong>Bs {parseFloat(topUpAmount).toFixed(0)}</strong> escaneando el QR y luego sube el comprobante de pago para que el admin lo revise.
                </p>
                {site?.fallback_qr_image_url && (
                  <div className="flex justify-center">
                    <div className="p-3 rounded-2xl border-2 border-yellow-100 bg-white shadow-inner">
                      <img src={site.fallback_qr_image_url} alt="QR de pago" className="w-52 h-52 object-contain rounded-xl" />
                    </div>
                  </div>
                )}
                {!site?.fallback_qr_image_url && site?.support_whatsapp && (
                  <div className="rounded-xl px-3 py-3 text-sm text-center"
                    style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.25)" }}>
                    <p className="font-bold">Solicita el QR por WhatsApp</p>
                    <a href={`https://wa.me/${site.support_whatsapp.replace(/\D/g, "")}`}
                      className="text-green-600 font-black"
                      target="_blank" rel="noreferrer">
                      {site.support_whatsapp}
                    </a>
                  </div>
                )}
                {/* Receipt upload */}
                <div className="space-y-2">
                  <label className="text-sm font-bold">Comprobante de pago</label>
                  {topUpReceiptUrl ? (
                    <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                      style={{ background: "hsl(142 70% 45% / 0.08)", border: "1px solid hsl(142 70% 45% / 0.2)" }}>
                      <span className="text-green-600">✅</span>
                      <span className="text-sm font-bold text-green-700">Imagen subida correctamente</span>
                      <button onClick={() => setTopUpReceiptUrl(null)} className="ml-auto text-xs text-muted-foreground underline">
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <>
                      <input ref={topUpReceiptFileRef} type="file" accept="image/*" className="hidden"
                        onChange={handleTopUpReceiptFile} />
                      <button onClick={() => topUpReceiptFileRef.current?.click()} disabled={topUpUploading}
                        className="w-full py-3 rounded-xl text-sm font-bold border-2 border-dashed flex items-center justify-center gap-2 disabled:opacity-60"
                        style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                        {topUpUploading ? "Subiendo..." : "📷 Subir imagen del comprobante"}
                      </button>
                    </>
                  )}
                </div>
                <button onClick={submitStaticTopUp} disabled={!topUpReceiptUrl || topUpUploading}
                  className="w-full py-3 rounded-2xl text-sm font-black text-white disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                  Enviar solicitud de recarga
                </button>
              </div>
            )}

            {/* Step: done — "auto" = Enlazo confirmed, "static" = awaiting admin review */}
            {topUpStep === "done" && (
              <div className="flex flex-col items-center justify-center py-6 space-y-4 text-center">
                {topUpQrImage ? (
                  <>
                    <div className="text-5xl">💰</div>
                    <p className="font-black text-xl" style={{ color: "hsl(142 70% 32%)" }}>
                      ¡Bs {parseFloat(topUpAmount).toFixed(0)} acreditados!
                    </p>
                    <p className="text-sm text-muted-foreground">Tu saldo ya fue actualizado.</p>
                  </>
                ) : (
                  <>
                    <div className="text-5xl">⏳</div>
                    <p className="font-black text-base">¡Solicitud enviada!</p>
                    <p className="text-sm text-muted-foreground">El administrador revisará tu comprobante y acreditará el saldo en breve.</p>
                  </>
                )}
                <button onClick={closeTopUpModal}
                  className="w-full py-3 rounded-2xl text-sm font-black text-white"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                  Cerrar
                </button>
              </div>
            )}
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
              Bs {(wallet?.balance ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-white/15">
              {[
                { label: "Total ganado", value: wallet?.total_won ?? 0 },
                { label: "Retirado", value: wallet?.total_withdrawn ?? 0 },
                { label: "En proceso", value: wallet?.pending_withdrawals ?? 0 },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-white/50 text-xs">{item.label}</p>
                  <p className="font-bold text-sm mt-0.5">Bs {fmtCompact(item.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bonus balance card — only shown when > 0 */}
        {(wallet as any)?.bonus_balance > 0 && (() => {
          const expiresAt: string | null = (wallet as any)?.bonus_expires_at ?? user?.bonus_expires_at ?? null;
          const expired = expiresAt != null && new Date(expiresAt) < new Date();
          if (expired) return null;
          const expiresDate = expiresAt ? new Date(expiresAt) : null;
          const now = new Date();
          const diffMs = expiresDate ? expiresDate.getTime() - now.getTime() : null;
          const diffHours = diffMs != null ? Math.floor(diffMs / (1000 * 60 * 60)) : null;
          const diffMins = diffMs != null ? Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)) : null;
          const isExpiringSoon = diffHours != null && diffHours < 24;
          let expiryLabel = "";
          if (diffHours != null && diffHours < 1) {
            expiryLabel = `Vence en ${diffMins} min`;
          } else if (diffHours != null) {
            expiryLabel = `Vence en ${diffHours}h ${diffMins}m`;
          } else if (expiresDate) {
            expiryLabel = `Vence ${expiresDate.toLocaleDateString("es-BO", { day: "2-digit", month: "short" })}`;
          }
          return (
            <div className="rounded-2xl p-4 flex items-center gap-4"
              style={{ background: "hsl(42 98% 52% / 0.1)", border: "1.5px solid hsl(42 98% 52% / 0.35)" }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ background: "hsl(42 98% 52% / 0.15)" }}>🎁</div>
              <div className="flex-1">
                <p className="font-black text-sm" style={{ color: "hsl(42 98% 30%)" }}>Bono disponible</p>
                <p className="font-black text-2xl" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  <span style={{ color: "hsl(42 80% 52%)" }}>Bs </span>
                  <span style={{ color: "hsl(25 95% 40%)" }}>{((wallet as any).bonus_balance ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                </p>
                <p className="text-xs mt-0.5" style={{ color: "hsl(42 98% 40%)" }}>
                  Solo para compra de cartones · No retirable
                  {expiryLabel ? ` · ${expiryLabel}` : ""}
                </p>
              </div>
            </div>
          );
        })()}

        {/* --- Withdrawal + Top-up action row --- */}
        {step === "idle" && (
          <div className="flex gap-3">
            <button className="btn-gold flex-1" onClick={() => setStep("amount")}
              disabled={!wallet || wallet.balance <= 0}>
              💸 Solicitar Retiro
            </button>
            <button
              className="flex-1 py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-1.5 transition-opacity hover:opacity-80"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "white" }}
              onClick={openTopUpModal}>
              💳 Recargar
            </button>
          </div>
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
            {wallet && <p className="text-xs text-muted-foreground">Disponible: Bs {wallet.balance.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>}
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
              <button onClick={() => { setStep("amount"); setCajeroError(false); }} className="text-muted-foreground p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
              <h3 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>
                Retirar Bs {numAmount.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">¿Cómo quieres recibir tu dinero?</p>

            <button onClick={() => { setCajeroError(false); setStep("qr-upload"); }}
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

            <button
              onClick={() => {
                if (numAmount % 10 !== 0) {
                  setCajeroError(true);
                } else {
                  setCajeroError(false);
                  setStep("bank-form");
                }
              }}
              className="w-full p-4 rounded-2xl border-2 text-left transition-all hover:border-primary"
              style={{ borderColor: cajeroError ? "hsl(0 75% 52%)" : "hsl(var(--border))" }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: "hsl(var(--primary) / 0.1)" }}>🏧</div>
                <div>
                  <p className="font-black">Retiro por Cajero</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Recibirás un PIN para retirar desde cualquier cajero automático.</p>
                </div>
              </div>
            </button>

            {cajeroError && (
              <div className="rounded-2xl p-4 space-y-3"
                style={{ background: "hsl(0 75% 52% / 0.07)", border: "1.5px solid hsl(0 75% 52% / 0.3)" }}>
                <p className="text-sm font-bold" style={{ color: "hsl(0 75% 40%)" }}>
                  🏧 Los cajeros solo entregan billetes enteros
                </p>
                <p className="text-xs text-muted-foreground">
                  El monto <strong>Bs {numAmount.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</strong> no es válido para cajero. Elige un múltiplo de 10:
                </p>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const base = Math.floor(numAmount / 10) * 10;
                    const opts = new Set<number>();
                    for (let i = -2; i <= 3; i++) {
                      const v = base + i * 10;
                      if (v >= 10 && v <= (wallet?.balance ?? 0)) opts.add(v);
                    }
                    return Array.from(opts).sort((a, b) => a - b).map(v => (
                      <button key={v} onClick={() => { setAmount(String(v)); setCajeroError(false); setStep("bank-form"); }}
                        className="px-4 py-2 rounded-xl font-black text-sm transition-all"
                        style={{
                          background: "hsl(var(--primary))",
                          color: "white",
                          fontFamily: "'Poppins', sans-serif",
                        }}>
                        Bs {v}
                      </button>
                    ));
                  })()}
                </div>
              </div>
            )}
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
                Bs {numAmount.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
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
                Bs {numAmount.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
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
              { key: "withdrawals", label: "📋 Movimientos" },
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

          {/* Earnings panel — game prizes + activator commissions merged */}
          {histTab === "earnings" && (() => {
            const prizes = ((earnings as any[]) ?? []).map((e: any) => ({ ...e, _kind: "prize" as const }));
            const comms  = ((commissions as any[]) ?? []).map((c: any) => ({ ...c, _kind: "commission" as const }));
            const list = [...prizes, ...comms].sort(
              (a, b) => new Date(b.credited_at).getTime() - new Date(a.credited_at).getTime()
            );
            const shown = list.slice(0, showAll ? undefined : PAGE);
            if (loadingEarnings || loadingCommissions) return (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-card border rounded-2xl p-4 animate-pulse">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="h-5 w-20 rounded-full" style={{ background: "hsl(var(--muted-foreground)/0.15)" }} />
                        <div className="h-3 w-36 rounded-full" style={{ background: "hsl(var(--muted-foreground)/0.1)" }} />
                        <div className="h-3 w-24 rounded-full" style={{ background: "hsl(var(--muted-foreground)/0.1)" }} />
                      </div>
                      <div className="h-6 w-20 rounded-full shrink-0" style={{ background: "hsl(var(--muted-foreground)/0.12)" }} />
                    </div>
                  </div>
                ))}
              </div>
            );
            return list.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-4xl mb-2">🎱</p>
                <p className="font-semibold">Aún no has ganado ningún premio</p>
                <p className="text-sm mt-1">¡Juega y reclama tu bingo!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {shown.map((item: any) => {
                  if (item._kind === "commission") {
                    return (
                      <div key={`c-${item.id}`} className="bg-card border rounded-2xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(217 91% 40%)" }}>
                              +Bs {item.amount.toLocaleString("es-BO", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}
                            </p>
                            <p className="text-sm font-medium mt-0.5">
                              🔗 Comisión por referido · {item.referred_user_name}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {item.game_title ?? "Bingo"} · {new Date(item.credited_at).toLocaleDateString("es-BO")}
                            </p>
                          </div>
                          <div className="text-xs font-bold px-3 py-1.5 rounded-full shrink-0"
                            style={{ background: "hsl(217 91% 50% / 0.12)", border: "1px solid hsl(217 91% 50% / 0.3)", color: "hsl(217 91% 35%)" }}>
                            {item.commission_pct}% comisión
                          </div>
                        </div>
                      </div>
                    );
                  }
                  // prize entry
                  const typeLabel: Record<string, string> = { daily: "Bingo Diario", weekly: "Bingo Semanal", monthly: "Bingo Mensual" };
                  const commDeducted: number | null = item.commission_deducted ?? null;
                  const commPct: number | null = item.commission_pct ?? null;
                  const netAmount = commDeducted ? item.prize_amount - commDeducted : item.prize_amount;
                  const isPhysical = item.prize_type === "physical" || item.prize_type === "mixed";
                  const deliveryStatusConfig: Record<string, { label: string; bg: string; border: string; color: string }> = {
                    pending: { label: "📦 Pendiente dirección", bg: "hsl(42 98% 52% / 0.1)", border: "hsl(42 98% 52% / 0.3)", color: "hsl(42 98% 30%)" },
                    address_submitted: { label: "⏳ Dirección enviada", bg: "hsl(217 91% 50% / 0.1)", border: "hsl(217 91% 50% / 0.3)", color: "hsl(217 91% 35%)" },
                    shipped: { label: "🚚 En camino", bg: "hsl(262 80% 50% / 0.1)", border: "hsl(262 80% 50% / 0.3)", color: "hsl(262 80% 35%)" },
                    delivered: { label: "✅ Entregado", bg: "hsl(142 70% 45% / 0.1)", border: "hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" },
                  };
                  const dsCfg = item.delivery_status ? deliveryStatusConfig[item.delivery_status] : null;
                  return (
                    <div key={`p-${item.id}`} className="bg-card border rounded-2xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          {isPhysical && parseFloat(item.prize_amount) === 0 ? (
                            <p className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(262 80% 40%)" }}>
                              🎁 Premio obtenido
                            </p>
                          ) : (
                            <p className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(142 70% 30%)" }}>
                              +Bs {parseFloat(item.prize_amount).toLocaleString("es-BO", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}
                            </p>
                          )}
                          <p className="text-sm font-medium mt-0.5">{item.game_title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {typeLabel[item.game_type] ?? item.game_type} · {new Date(item.credited_at).toLocaleDateString("es-BO")}
                          </p>
                          {isPhysical && item.prize_physical_name && (
                            <p className="text-xs font-bold mt-0.5" style={{ color: "hsl(262 80% 40%)" }}>📦 {item.prize_physical_name}</p>
                          )}
                        </div>
                        {isPhysical ? (() => {
                          const physBadge: Record<string, { label: string; bg: string; border: string; color: string }> = {
                            pending:          { label: "📦 Pendiente entrega", bg: "hsl(42 98% 52% / 0.12)",  border: "hsl(42 98% 52% / 0.3)",  color: "hsl(42 98% 30%)" },
                            address_submitted: { label: "⏳ En proceso",        bg: "hsl(217 91% 50% / 0.12)", border: "hsl(217 91% 50% / 0.3)", color: "hsl(217 91% 35%)" },
                            shipped:          { label: "🚚 En camino",          bg: "hsl(262 80% 50% / 0.12)", border: "hsl(262 80% 50% / 0.3)", color: "hsl(262 80% 35%)" },
                            delivered:        { label: "✅ Entregado",           bg: "hsl(142 70% 45% / 0.12)", border: "hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" },
                          };
                          const cfg = item.delivery_status ? physBadge[item.delivery_status] : physBadge.pending;
                          return (
                            <div className="text-xs font-bold px-3 py-1.5 rounded-full shrink-0"
                              style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
                              {cfg.label}
                            </div>
                          );
                        })() : (
                          <div className="text-xs font-bold px-3 py-1.5 rounded-full shrink-0"
                            style={{ background: "hsl(142 70% 45% / 0.12)", border: "1px solid hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" }}>
                            ✓ Acreditado
                          </div>
                        )}
                      </div>
                      {commDeducted != null && commDeducted > 0 && (
                        <div className="rounded-xl px-3 py-2 space-y-1"
                          style={{ background: "hsl(0 75% 52% / 0.07)", border: "1px solid hsl(0 75% 52% / 0.2)" }}>
                          <div className="flex items-center justify-between text-xs">
                            <span style={{ color: "hsl(0 75% 40%)" }}>🔗 Comisión activador ({commPct}%)</span>
                            <span className="font-bold" style={{ color: "hsl(0 75% 40%)" }}>
                              −Bs {commDeducted.toLocaleString("es-BO", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs border-t pt-1" style={{ borderColor: "hsl(0 75% 52% / 0.15)" }}>
                            <span className="font-bold text-muted-foreground">Neto acreditado</span>
                            <span className="font-black" style={{ color: "hsl(142 70% 30%)", fontFamily: "'Poppins', sans-serif" }}>
                              Bs {netAmount.toLocaleString("es-BO", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}
                            </span>
                          </div>
                        </div>
                      )}
                      {isPhysical && (
                        <div className="rounded-xl px-3 py-2.5 space-y-2"
                          style={{ background: dsCfg?.bg ?? "hsl(42 98% 52% / 0.1)", border: `1px solid ${dsCfg?.border ?? "hsl(42 98% 52% / 0.3)"}` }}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold" style={{ color: dsCfg?.color ?? "hsl(42 98% 30%)" }}>
                              {dsCfg?.label ?? "📦 Premio físico"}
                            </span>
                          </div>
                          {item.delivery_status === "pending" && (
                            <button
                              onClick={() => { setAddressModal(item.id); setAddrLine(""); setAddrPhone(""); }}
                              className="w-full py-2 rounded-xl text-xs font-black text-white cursor-pointer"
                              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                              📍 Enviar datos de entrega
                            </button>
                          )}
                          {item.delivery_status === "address_submitted" && (
                            <p className="text-xs text-muted-foreground">Tu dirección fue enviada. El administrador coordinará la entrega.</p>
                          )}
                          {item.delivery_status === "shipped" && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium">Tu premio está en camino 🚚</p>
                              {item.delivery_notes && <p className="text-xs text-muted-foreground">{item.delivery_notes}</p>}
                              <div className="flex gap-2">
                                {item.delivery_receipt_url && (
                                  <button
                                    onClick={() => setProofModal(item.delivery_receipt_url!)}
                                    className="flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-colors"
                                    style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.25)", color: "hsl(262 80% 40%)" }}>
                                    🧾 Boleta
                                  </button>
                                )}
                                <button
                                  onClick={() => handleConfirmReceipt(item.id)}
                                  disabled={confirmReceiptLoading && confirmReceiptId === item.id}
                                  className="flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 text-white disabled:opacity-50 transition-colors"
                                  style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
                                  {confirmReceiptLoading && confirmReceiptId === item.id ? "Guardando…" : "✅ Ya lo recibí"}
                                </button>
                              </div>
                            </div>
                          )}
                          {item.delivery_status === "delivered" && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium">¡Premio entregado! ✅</p>
                              {item.delivery_receipt_url && (
                                <button
                                  onClick={() => setProofModal(item.delivery_receipt_url!)}
                                  className="w-full py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-colors"
                                  style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", color: "hsl(142 70% 30%)" }}>
                                  🧾 Ver boleta de envío
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
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

          {(loadingWithdrawals || loadingTopUps) ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-card border rounded-2xl p-4 animate-pulse">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="h-5 w-20 rounded-full" style={{ background: "hsl(var(--muted-foreground)/0.15)" }} />
                      <div className="h-3 w-32 rounded-full" style={{ background: "hsl(var(--muted-foreground)/0.1)" }} />
                      <div className="h-3 w-20 rounded-full" style={{ background: "hsl(var(--muted-foreground)/0.1)" }} />
                    </div>
                    <div className="h-6 w-20 rounded-full shrink-0" style={{ background: "hsl(var(--muted-foreground)/0.12)" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (() => {
            // Merge withdrawals + top-ups into a single chronological list
            const wItems = filteredWithdrawals.map((w: any) => ({ ...w, _kind: "withdrawal" as const }));
            const tItems = filteredTopUps.map((t: any) => ({ ...t, _kind: "topup" as const }));
            const allItems = [...wItems, ...tItems].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            const hasAny = (withdrawals as any[])?.length || myTopUps.length;
            if (!allItems.length) return (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-4xl mb-2">💸</p>
                <p className="font-semibold">{!hasAny ? "Sin movimientos todavía" : "Sin movimientos en este período"}</p>
              </div>
            );
            return (
            <div className="space-y-2">
              {allItems.slice(0, showAll ? undefined : PAGE).map((item: any) => {
              // ── TOP-UP (recarga) ──────────────────────────────────────────
              if (item._kind === "topup") {
                const isManual = !!item.receipt_url;
                const isQrRejected = !isManual && item.status === "rejected";
                const sc = item.status === "approved"
                  ? { label: "✓ Acreditada", bg: "hsl(142 70% 45% / 0.12)", border: "hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" }
                  : isQrRejected
                  ? { label: "No pagado", bg: "hsl(var(--muted))", border: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                  : item.status === "rejected"
                  ? { label: "❌ Rechazada", bg: "hsl(0 75% 52% / 0.12)", border: "hsl(0 75% 52% / 0.3)", color: "hsl(0 75% 40%)" }
                  : item.status === "refunded"
                  ? { label: "🔄 Reembolsada", bg: "hsl(210 80% 52% / 0.12)", border: "hsl(210 80% 52% / 0.3)", color: "hsl(210 80% 35%)" }
                  : { label: "⏳ En revisión", bg: "hsl(42 98% 52% / 0.12)", border: "hsl(42 98% 52% / 0.3)", color: "hsl(42 98% 35%)" };
                const amountColor = item.status === "approved"
                  ? "hsl(142 70% 30%)"
                  : isQrRejected
                  ? "hsl(var(--muted-foreground))"
                  : undefined;
                return (
                  <div key={`tu-${item.id}`} className="bg-card border rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif", color: amountColor }}>
                          {isQrRejected ? "" : "+"}Bs {parseFloat(item.amount).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          💳 Recarga · {isManual ? "Comprobante manual" : "Código QR dinámico"} · {new Date(item.created_at).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <div className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full"
                        style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}>
                        {sc.label}
                      </div>
                    </div>
                    {item.admin_notes && (
                      <div className="flex items-start gap-2 rounded-xl px-3 py-2"
                        style={{ background: item.status === "rejected" ? "hsl(0 75% 52% / 0.08)" : "hsl(var(--muted))", border: `1px solid ${item.status === "rejected" ? "hsl(0 75% 52% / 0.25)" : "hsl(var(--border))"}` }}>
                        <span className="text-sm mt-0.5">{item.status === "rejected" ? "❌" : "🗒️"}</span>
                        <div>
                          <p className="text-xs font-bold" style={{ color: item.status === "rejected" ? "hsl(0 75% 40%)" : undefined }}>
                            {item.status === "rejected" ? "Motivo del rechazo" : "Nota del administrador"}
                          </p>
                          <p className="text-sm">{item.admin_notes}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // ── WITHDRAWAL (retiro) ───────────────────────────────────────
              const w = item;
                const isAdminCredit = w.method === "admin_credit";
                const isAdminDebit = w.method === "admin_debit";
                const isRefund = w.method === "refund";
                const isActivatorPurchase = w.method === "activator_card_purchase";
                const isAdmin = isAdminCredit || isAdminDebit || isRefund;

                let methodInfo: any = {};
                try { methodInfo = JSON.parse(w.bank_account_info ?? "{}"); } catch {}
                const isQr = methodInfo.method === "qr";
                const isBank = methodInfo.method === "bank";

                let methodLabel: string;
                if (isAdminCredit) methodLabel = "💰 Acreditado por Admin";
                else if (isAdminDebit) methodLabel = "💸 Débito por Admin";
                else if (isRefund) methodLabel = "🔄 Reembolso";
                else if (isActivatorPurchase) methodLabel = "🎟️ Compra de cartón";
                else if (isQr) methodLabel = "📱 QR";
                else if (isBank) methodLabel = `🏧 Cajero · ${methodInfo.bank ?? ""}`;
                else methodLabel = "Transferencia";

                // For admin adjustments override the status chip
                const sc = isAdminCredit
                  ? { label: "✓ Acreditado", bg: "hsl(142 70% 45% / 0.12)", border: "hsl(142 70% 45% / 0.3)", color: "hsl(142 70% 30%)" }
                  : isAdminDebit
                  ? { label: "Débito", bg: "hsl(0 75% 52% / 0.12)", border: "hsl(0 75% 52% / 0.3)", color: "hsl(0 75% 40%)" }
                  : isRefund
                  ? { label: "✓ Reembolsado", bg: "hsl(210 80% 52% / 0.12)", border: "hsl(210 80% 52% / 0.3)", color: "hsl(210 80% 35%)" }
                  : statusConfig(w.status);

                // Parse activator purchase notes: "2 cartones para Bingo Diario — Para: Juan Pérez"
                const [purchaseDetail, purchaseTarget] = isActivatorPurchase && w.notes
                  ? w.notes.split(" — ")
                  : [null, null];

                return (
                  <div key={w.id} className="bg-card border rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-lg" style={{
                          fontFamily: "'Poppins', sans-serif",
                          color: isAdminCredit ? "hsl(142 70% 30%)" : isRefund ? "hsl(210 80% 35%)" : isAdminDebit ? "hsl(0 75% 40%)" : undefined,
                        }}>
                          {(isAdminCredit || isRefund) ? "+" : "−"}Bs {parseFloat(w.amount).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {methodLabel} · {new Date(w.created_at).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                        {isActivatorPurchase && purchaseDetail && (
                          <div className="mt-1.5 space-y-0.5">
                            <p className="text-xs font-semibold" style={{ color: "hsl(var(--foreground) / 0.75)" }}>{purchaseDetail}</p>
                            {purchaseTarget && <p className="text-xs text-muted-foreground">{purchaseTarget}</p>}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full"
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

                    {/* Rejection reason for user-initiated withdrawals */}
                    {!isAdmin && w.status === "rejected" && w.notes && (
                      <div className="flex items-start gap-2 rounded-xl px-3 py-2"
                        style={{ background: "hsl(0 75% 52% / 0.08)", border: "1px solid hsl(0 75% 52% / 0.25)" }}>
                        <span className="text-sm mt-0.5">❌</span>
                        <div>
                          <p className="text-xs font-bold" style={{ color: "hsl(0 75% 40%)" }}>Motivo del rechazo</p>
                          <p className="text-sm" style={{ color: "hsl(0 75% 35%)" }}>{w.notes}</p>
                        </div>
                      </div>
                    )}

                    {/* Paid QR: show proof button */}
                    {w.status === "paid" && isQr && w.payment_proof_url && (
                      <button
                        onClick={() => setProofModal(w.payment_proof_url)}
                        className="w-full py-2 rounded-xl text-xs font-bold border-2 transition-all"
                        style={{ borderColor: "hsl(220 80% 55% / 0.45)", color: "hsl(220 80% 40%)", background: "hsl(220 80% 55% / 0.08)" }}>
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

                    {/* Approval note for paid withdrawals — shown below PIN */}
                    {!isAdmin && !isActivatorPurchase && w.status === "paid" && w.notes && (
                      <div className="flex items-start gap-2 rounded-xl px-3 py-2"
                        style={{ background: "hsl(142 70% 45% / 0.08)", border: "1px solid hsl(142 70% 45% / 0.25)" }}>
                        <span className="text-sm mt-0.5">📝</span>
                        <div>
                          <p className="text-xs font-bold" style={{ color: "hsl(142 70% 30%)" }}>Nota del pago</p>
                          <p className="text-sm" style={{ color: "hsl(142 70% 25%)" }}>{w.notes}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Ver más / Ver menos */}
              {allItems.length > PAGE && (
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
                    : `▼ Ver más (${allItems.length - PAGE} más)`}
                </button>
              )}
            </div>
            );
          })()}
          </>)}
        </div>
      </div>
    </>
  );
}

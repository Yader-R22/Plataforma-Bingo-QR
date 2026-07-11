import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

const BASE = "";

interface Game {
  id: number;
  title: string;
  status: string;
  card_price: number;
  scheduled_at: string | null;
}

interface TargetUser {
  id: number;
  full_name: string;
  ci: string;
}

type Step = "game" | "target" | "enlazo-qr" | "static-upload" | "success";

interface Props {
  token: string;
  staticQrUrl?: string | null;
  onClose: () => void;
}

export default function ActivatorSaleModal({ token, staticQrUrl, onClose }: Props) {
  const [step, setStep] = useState<Step>("game");
  const [games, setGames] = useState<Game[]>([]);
  const [settings, setSettings] = useState<{
    card_sale_enabled: boolean;
    card_sale_discount_type: "percentage" | "fixed";
    card_sale_discount_value: number;
  } | null>(null);
  const [loadingGames, setLoadingGames] = useState(true);

  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [ciInput, setCiInput] = useState("");
  const [targetUser, setTargetUser] = useState<TargetUser | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const [purchasing, setPurchasing] = useState(false);
  const [saleId, setSaleId] = useState<number | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<"pending" | "completed" | "failed">("pending");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptSubmitted, setReceiptSubmitted] = useState(false);

  const authH = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/api/activator-sales/games`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${BASE}/api/activator-sales/settings`, { headers: { Authorization: `Bearer ${token}` } }),
    ]).then(async ([gr, sr]) => {
      if (gr.ok) setGames(await gr.json());
      if (sr.ok) setSettings(await sr.json());
    }).finally(() => setLoadingGames(false));
  }, [token]);

  // Polling for Enlazo payment
  useEffect(() => {
    if (step !== "enlazo-qr" || !checkoutId) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${BASE}/api/payments/${checkoutId}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const d = await r.json() as { status: string };
          if (d.status === "completed") {
            setPollStatus("completed");
            setStep("success");
            clearInterval(pollRef.current!);
          } else if (d.status === "failed") {
            setPollStatus("failed");
            clearInterval(pollRef.current!);
          }
        }
      } catch {}
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, checkoutId, token]);

  function calcPrices() {
    if (!selectedGame || !settings) return { original: 0, discount: 0, final: 0 };
    const original = selectedGame.card_price * quantity;
    let discount = 0;
    if (settings.card_sale_discount_type === "percentage") {
      discount = original * (settings.card_sale_discount_value / 100);
    } else {
      discount = settings.card_sale_discount_value * quantity;
    }
    discount = Math.min(parseFloat(discount.toFixed(2)), original);
    const final = Math.max(0, parseFloat((original - discount).toFixed(2)));
    return { original, discount, final };
  }

  async function lookupUser() {
    if (!ciInput.trim()) return;
    setLookingUp(true);
    setTargetUser(null);
    try {
      const r = await fetch(`${BASE}/api/activator-sales/lookup-user?ci=${encodeURIComponent(ciInput.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        setTargetUser(await r.json());
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error((d as any).error || "Usuario no encontrado");
      }
    } finally {
      setLookingUp(false);
    }
  }

  async function purchase() {
    if (!selectedGame || !targetUser) return;
    setPurchasing(true);
    try {
      const r = await fetch(`${BASE}/api/activator-sales/purchase`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({
          game_id: selectedGame.id,
          quantity,
          target_user_id: targetUser.id,
          payment_method: "enlazo",
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "Error al crear venta"); return; }
      setSaleId(d.sale_id);
      setCheckoutId(d.checkout_id || null);
      setQrImage(d.qr_image || null);
      setQrError(d.qr_error || null);
      // Si Enlazo falla (sin QR), cae automáticamente a QR estático
      if (d.qr_image) {
        setStep("enlazo-qr");
      } else {
        setStep("static-upload");
      }
    } finally {
      setPurchasing(false);
    }
  }

  async function submitReceipt() {
    if (!receiptFile || !saleId) return;
    setUploadingReceipt(true);
    try {
      const form = new FormData();
      form.append("receipt", receiptFile);
      const up = await fetch(`${BASE}/api/manual-payments/upload-receipt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!up.ok) { toast.error("Error al subir imagen"); return; }
      const { url } = await up.json() as { url: string };

      const r = await fetch(`${BASE}/api/activator-sales/${saleId}/receipt`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({ receipt_url: url }),
      });
      if (r.ok) {
        setReceiptSubmitted(true);
        setStep("success");
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error((d as any).error || "Error al enviar comprobante");
      }
    } finally {
      setUploadingReceipt(false);
    }
  }

  const { original, discount, final } = calcPrices();

  const fmt = (n: number) => `Bs ${n.toFixed(2)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md mx-auto rounded-t-3xl sm:rounded-3xl bg-background shadow-2xl"
        style={{ maxHeight: "92vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>
            🛒 Vender cartones
          </h2>
          <button onClick={onClose} className="text-2xl text-muted-foreground leading-none">✕</button>
        </div>

        {/* Step indicator */}
        <div className="px-5 pb-3">
          <div className="flex items-center gap-1">
            {(["game", "target", "pago"] as const).map((s, i) => {
              const stepOrder = ["game", "target", "enlazo-qr", "static-upload", "success"];
              const idx = stepOrder.indexOf(step);
              const done = (i === 0 && idx >= 1) || (i === 1 && idx >= 2);
              const active = (s === "game" && step === "game") ||
                (s === "target" && step === "target") ||
                (s === "pago" && ["enlazo-qr", "static-upload", "success"].includes(step));
              return (
                <div key={s} className="flex items-center gap-1 flex-1">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0"
                    style={{
                      background: done || active ? "hsl(var(--primary))" : "hsl(var(--muted))",
                      color: done || active ? "white" : "hsl(var(--muted-foreground))",
                    }}>
                    {done ? "✓" : i + 1}
                  </div>
                  {i < 2 && <div className="h-0.5 flex-1 rounded" style={{ background: done ? "hsl(var(--primary))" : "hsl(var(--border))" }} />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 pb-6 space-y-4">

          {/* ─── Step: game ──────────────────────────────────────────────── */}
          {step === "game" && (
            <>
              <p className="text-sm font-bold text-muted-foreground">Selecciona el juego</p>
              {loadingGames ? (
                <p className="text-center text-sm text-muted-foreground py-6">Cargando juegos...</p>
              ) : games.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">No hay juegos disponibles</p>
              ) : (
                <div className="space-y-2">
                  {games.map(g => (
                    <button key={g.id}
                      className="w-full text-left rounded-2xl border p-4 transition-colors"
                      style={{
                        borderColor: selectedGame?.id === g.id ? "hsl(var(--primary))" : "hsl(var(--border))",
                        background: selectedGame?.id === g.id ? "hsl(var(--primary) / 0.06)" : "transparent",
                      }}
                      onClick={() => setSelectedGame(g)}>
                      <p className="font-bold text-sm">{g.title}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {g.scheduled_at ? new Date(g.scheduled_at).toLocaleDateString("es-BO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </span>
                        <span className="text-xs font-black" style={{ color: "hsl(var(--primary))" }}>
                          Bs {g.card_price.toFixed(2)} / cartón
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{ background: g.status === "active" ? "hsl(142 70% 92%)" : "hsl(210 80% 92%)", color: g.status === "active" ? "hsl(142 70% 30%)" : "hsl(210 80% 35%)" }}>
                          {g.status === "active" ? "En vivo" : "Próximo"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button
                disabled={!selectedGame}
                onClick={() => setStep("target")}
                className="w-full py-3.5 rounded-2xl font-black text-white text-sm disabled:opacity-40"
                style={{ background: "hsl(var(--primary))" }}>
                Continuar →
              </button>
            </>
          )}

          {/* ─── Step: target ─────────────────────────────────────────────── */}
          {step === "target" && selectedGame && (
            <>
              <div className="rounded-2xl px-4 py-3 text-sm font-bold"
                style={{ background: "hsl(var(--muted))" }}>
                🎱 {selectedGame.title} · Bs {selectedGame.card_price.toFixed(2)}/cartón
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">CI del usuario</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ej: 7654321"
                    value={ciInput}
                    onChange={e => { setCiInput(e.target.value); setTargetUser(null); }}
                    onKeyDown={e => { if (e.key === "Enter") lookupUser(); }}
                    className="flex-1 rounded-xl border px-3 py-2.5 text-sm bg-background"
                  />
                  <button
                    onClick={lookupUser}
                    disabled={lookingUp || !ciInput.trim()}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                    style={{ background: "hsl(var(--primary))" }}>
                    {lookingUp ? "..." : "Buscar"}
                  </button>
                </div>
                {targetUser && (
                  <div className="rounded-xl px-3 py-2.5 flex items-center gap-2 mt-1"
                    style={{ background: "hsl(142 70% 95%)", border: "1px solid hsl(142 70% 80%)" }}>
                    <span className="text-green-700 text-lg">✓</span>
                    <div>
                      <p className="text-sm font-bold text-green-800">{targetUser.full_name}</p>
                      <p className="text-xs text-green-700">CI: {targetUser.ci}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Cantidad de cartones</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-xl font-black text-lg"
                    style={{ background: "hsl(var(--muted))" }}>−</button>
                  <span className="flex-1 text-center font-black text-2xl">{quantity}</span>
                  <button
                    onClick={() => setQuantity(q => Math.min(20, q + 1))}
                    className="w-10 h-10 rounded-xl font-black text-lg"
                    style={{ background: "hsl(var(--muted))" }}>+</button>
                </div>
              </div>

              {settings && targetUser && (
                <div className="rounded-2xl px-4 py-3 space-y-1.5"
                  style={{ background: "hsl(var(--muted))" }}>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Precio normal</span>
                    <span className="font-bold">{fmt(original)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Tu descuento ({settings.card_sale_discount_type === "percentage"
                        ? `${settings.card_sale_discount_value}%`
                        : `Bs ${settings.card_sale_discount_value}/cartón`})
                    </span>
                    <span className="font-bold" style={{ color: "hsl(142 70% 35%)" }}>−{fmt(discount)}</span>
                  </div>
                  <div className="flex justify-between text-base font-black border-t pt-2" style={{ borderColor: "hsl(var(--border))" }}>
                    <span>Tú pagas</span>
                    <span style={{ color: "hsl(var(--primary))" }}>{fmt(final)}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep("game")}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: "hsl(var(--muted))" }}>← Atrás</button>
                <button
                  disabled={!targetUser || quantity < 1 || purchasing}
                  onClick={purchase}
                  className="flex-1 py-3 rounded-2xl font-black text-white text-sm disabled:opacity-40"
                  style={{ background: "hsl(var(--primary))" }}>
                  {purchasing ? "Generando QR..." : "Pagar con QR →"}
                </button>
              </div>
            </>
          )}

          {/* ─── Step: Enlazo QR ─────────────────────────────────────────── */}
          {step === "enlazo-qr" && (
            <div className="space-y-4 text-center">
              <p className="font-black text-base">Escanea el QR para pagar</p>
              <p className="text-sm text-muted-foreground">
                Monto: <span className="font-black" style={{ color: "hsl(var(--primary))" }}>{fmt(final)}</span>
              </p>

              {qrError && !qrImage && (
                <div className="rounded-2xl px-4 py-3 text-sm"
                  style={{ background: "hsl(0 75% 95%)", color: "hsl(0 75% 30%)" }}>
                  ⚠️ {qrError}
                </div>
              )}

              {qrImage && (
                <div className="flex justify-center">
                  <img src={qrImage} alt="QR Enlazo Pay"
                    className="w-56 h-56 object-contain rounded-2xl border"
                    style={{ borderColor: "hsl(var(--border))" }} />
                </div>
              )}

              {pollStatus === "failed" ? (
                <div className="rounded-2xl px-4 py-3 text-sm"
                  style={{ background: "hsl(0 75% 95%)", color: "hsl(0 75% 30%)" }}>
                  ❌ El pago falló o expiró. Cierra e intenta de nuevo.
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <span className="animate-spin">⏳</span>
                  <span>Esperando confirmación de pago...</span>
                </div>
              )}

              <button onClick={onClose}
                className="w-full py-3 rounded-2xl font-bold text-sm"
                style={{ background: "hsl(var(--muted))" }}>
                Cancelar
              </button>
            </div>
          )}

          {/* ─── Step: Static QR upload ───────────────────────────────────── */}
          {step === "static-upload" && (
            <div className="space-y-4">
              <p className="font-bold text-sm">QR estático — comprobante de pago</p>
              <p className="text-xs text-muted-foreground">
                Paga <span className="font-black" style={{ color: "hsl(var(--primary))" }}>{fmt(final)}</span> al siguiente QR y sube tu comprobante. El admin revisará y aprobará la venta.
              </p>

              {staticQrUrl && (
                <div className="flex flex-col items-center gap-2">
                  <img src={staticQrUrl} alt="QR estático"
                    className="w-52 h-52 object-contain rounded-2xl border"
                    style={{ borderColor: "hsl(var(--border))" }} />
                  <p className="text-[10px] text-muted-foreground">Escanea este código QR para pagar</p>
                </div>
              )}

              {!staticQrUrl && (
                <div className="rounded-2xl px-4 py-3 text-sm text-center"
                  style={{ background: "hsl(var(--muted))" }}>
                  El admin configurará el QR estático. Sube tu comprobante cuando hayas pagado.
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground">Sube tu comprobante de pago</label>
                <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 cursor-pointer"
                  style={{ borderColor: receiptPreview ? "hsl(var(--primary))" : "hsl(var(--border))" }}>
                  {receiptPreview ? (
                    <img src={receiptPreview} alt="Comprobante" className="max-h-40 rounded-xl object-contain" />
                  ) : (
                    <>
                      <span className="text-3xl">📄</span>
                      <span className="text-xs text-muted-foreground text-center">Toca para seleccionar imagen (máx. 5 MB)</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setReceiptFile(f);
                        const reader = new FileReader();
                        reader.onload = ev => setReceiptPreview(ev.target?.result as string);
                        reader.readAsDataURL(f);
                      }
                    }} />
                </label>
                {receiptPreview && (
                  <button onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                    className="text-xs text-muted-foreground underline">
                    Quitar imagen
                  </button>
                )}
              </div>

              <button
                disabled={!receiptFile || uploadingReceipt}
                onClick={submitReceipt}
                className="w-full py-3.5 rounded-2xl font-black text-white text-sm disabled:opacity-40"
                style={{ background: "hsl(var(--primary))" }}>
                {uploadingReceipt ? "Enviando..." : "Enviar comprobante →"}
              </button>

              <button onClick={onClose}
                className="w-full py-2 rounded-2xl font-bold text-sm"
                style={{ background: "hsl(var(--muted))" }}>
                Cancelar
              </button>
            </div>
          )}

          {/* ─── Step: Success ────────────────────────────────────────────── */}
          {step === "success" && (
            <div className="space-y-4 text-center py-4">
              <div className="text-6xl">
                {receiptSubmitted ? "📋" : "🎉"}
              </div>
              <p className="font-black text-xl">
                {receiptSubmitted ? "¡Comprobante enviado!" : "¡Pago confirmado!"}
              </p>
              {receiptSubmitted ? (
                <p className="text-sm text-muted-foreground">
                  El admin revisará tu comprobante y activará los cartones de <span className="font-bold">{targetUser?.full_name}</span> pronto.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Los cartones de <span className="font-bold">{targetUser?.full_name}</span> están activados y listos para jugar.
                </p>
              )}
              <div className="rounded-2xl px-4 py-3 space-y-1 text-left"
                style={{ background: "hsl(var(--muted))" }}>
                <p className="text-xs text-muted-foreground">Resumen</p>
                <p className="font-bold text-sm">{quantity} cartón{quantity !== 1 ? "es" : ""} · {selectedGame?.title}</p>
                <p className="text-xs text-muted-foreground">Para: {targetUser?.full_name} (CI: {targetUser?.ci})</p>
                <p className="font-black" style={{ color: "hsl(var(--primary))" }}>{fmt(final)} pagado</p>
                {discount > 0 && (
                  <p className="text-xs" style={{ color: "hsl(142 70% 35%)" }}>
                    Ahorraste {fmt(discount)} con tu descuento de activador
                  </p>
                )}
              </div>
              <button onClick={onClose}
                className="w-full py-3.5 rounded-2xl font-black text-white text-sm"
                style={{ background: "hsl(var(--primary))" }}>
                Cerrar
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

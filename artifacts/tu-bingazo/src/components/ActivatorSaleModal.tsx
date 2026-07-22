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

interface SiteSettings {
  site_name: string;
  site_tagline: string;
  site_emoji: string;
  qr_background_url: string | null;
}

export default function ActivatorSaleModal({ token, staticQrUrl, onClose }: Props) {
  const [step, setStep] = useState<Step>("game");
  const [games, setGames] = useState<Game[]>([]);
  const [settings, setSettings] = useState<{
    card_sale_enabled: boolean;
    card_sale_discount_type: "percentage" | "fixed";
    card_sale_discount_value: number;
  } | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [loadingGames, setLoadingGames] = useState(true);

  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [gameListOpen, setGameListOpen] = useState(true);
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

  const [activatorBalance, setActivatorBalance] = useState<number>(0);

  const authH = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  useEffect(() => {
    // Games + activator settings unlock the UI — site-settings loads silently in background
    Promise.all([
      fetch(`${BASE}/api/activator-sales/games`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${BASE}/api/activator-sales/settings`, { headers: { Authorization: `Bearer ${token}` } }),
    ]).then(async ([gr, sr]) => {
      if (gr.ok) setGames(await gr.json());
      if (sr.ok) setSettings(await sr.json());
    }).finally(() => setLoadingGames(false));

    // Wallet balance — needed to enable/disable "Pagar con saldo" button
    fetch(`${BASE}/api/wallet`, { headers: { Authorization: `Bearer ${token}` } }).then(async r => {
      if (!r.ok) return;
      const data = await r.json();
      const bal = (data.balance ?? 0) + (data.bonus_balance ?? 0) - (data.pending_withdrawals ?? 0);
      setActivatorBalance(Math.max(0, bal));
    });

    // Site settings only needed for QR download — don't block the games list
    fetch(`${BASE}/api/site-settings`).then(async r => {
      if (!r.ok) return;
      const s = await r.json();
      setSiteSettings({
        site_name: s.site_name ?? "El Bingote",
        site_tagline: s.site_tagline ?? "¡Juega y gana!",
        site_emoji: s.site_emoji ?? "🎱",
        qr_background_url: s.qr_background_url ?? null,
      });
    }).catch(() => {});
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

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
    const words = text.split(" ");
    let line = "";
    let curY = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, curY);
        line = word;
        curY += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, curY);
  }

  function downloadQR() {
    if (!qrImage || !selectedGame) return;

    const W = 480, H = 720, QR = 240, SCALE = 3;
    const siteName = siteSettings?.site_name ?? "El Bingote";
    const siteTagline = siteSettings?.site_tagline ?? "¡Juega y gana!";
    const siteEmoji = siteSettings?.site_emoji ?? "🎱";
    const qrBgUrl = siteSettings?.qr_background_url ?? null;
    const gameTitle = selectedGame.title;
    const drawDate = selectedGame.scheduled_at ?? new Date().toISOString();
    const { final: totalPrice } = calcPrices();

    const qrImg = new Image();
    qrImg.crossOrigin = "anonymous";
    qrImg.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * SCALE;
      canvas.height = H * SCALE;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(SCALE, SCALE);

      function drawContent() {
        if (!qrBgUrl) {
          ctx.save();
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(W - 40, 60, 110, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(50, H - 60, 90, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }

        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "bold 15px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${siteEmoji}  ${siteName.toUpperCase()}`, W / 2, 44);

        ctx.fillStyle = "rgba(255,255,255,0.32)";
        ctx.font = "12px sans-serif";
        ctx.fillText(siteTagline, W / 2, 62);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px sans-serif";
        wrapText(ctx, gameTitle, W / 2, 96, W - 60, 30);

        const amountY = 160;
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "14px sans-serif";
        ctx.fillText(`${quantity} cartón${quantity > 1 ? "es" : ""}`, W / 2, amountY);
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 52px sans-serif";
        ctx.fillText(`Bs ${totalPrice.toFixed(0)}`, W / 2, amountY + 52);

        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, amountY + 70);
        ctx.lineTo(W - 40, amountY + 70);
        ctx.stroke();

        const qrCardX = (W - QR - 40) / 2;
        const qrCardY = amountY + 85;
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, qrCardX, qrCardY, QR + 40, QR + 40, 20);
        ctx.fill();
        ctx.drawImage(qrImg, qrCardX + 20, qrCardY + 20, QR, QR);

        const scanY = qrCardY + QR + 56;
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.font = "13px sans-serif";
        ctx.fillText("Escanea con tu app bancaria o billetera digital", W / 2, scanY);

        const dateStr = new Date(drawDate).toLocaleDateString("es-BO", {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
        });
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = "12px sans-serif";
        ctx.fillText(`Sorteo: ${dateStr}`, W / 2, scanY + 24);

        const pillW = 180, pillH = 32, pillX = (W - pillW) / 2, pillY = H - 52;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        roundRect(ctx, pillX, pillY, pillW, pillH, 16);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "11px sans-serif";
        ctx.fillText(`${siteEmoji}  ${siteName}`, W / 2, pillY + 20);

        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `qr-bingo-${saleId ?? "pago"}.png`;
        a.click();
      }

      if (qrBgUrl) {
        const bgImg = new Image();
        bgImg.crossOrigin = "anonymous";
        bgImg.onload = () => {
          const imgAspect = bgImg.width / bgImg.height;
          const canvasAspect = W / H;
          let sx = 0, sy = 0, sw = bgImg.width, sh = bgImg.height;
          if (imgAspect > canvasAspect) { sw = bgImg.height * canvasAspect; sx = (bgImg.width - sw) / 2; }
          else { sh = bgImg.width / canvasAspect; sy = (bgImg.height - sh) / 2; }
          ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, W, H);
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(0, 0, W, H);
          drawContent();
        };
        bgImg.onerror = () => {
          const bg = ctx.createLinearGradient(0, 0, 0, H);
          bg.addColorStop(0, "#2d0072"); bg.addColorStop(1, "#0d001a");
          ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
          drawContent();
        };
        bgImg.src = qrBgUrl;
      } else {
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, "#2d0072"); bg.addColorStop(1, "#0d001a");
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        drawContent();
      }
    };
    qrImg.src = qrImage;
  }

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

  async function purchaseWithWallet() {
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
          payment_method: "wallet",
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || "Error al pagar con saldo"); return; }
      setSaleId(d.sale_id);
      setStep("success");
    } finally {
      setPurchasing(false);
    }
  }

  function compressToBlob(file: File, maxPx = 1200, quality = 0.78): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = ev => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
          canvas.toBlob(b => b ? resolve(b) : reject(new Error("compress failed")), "image/webp", quality);
        };
        img.src = ev.target!.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function submitReceipt() {
    if (!receiptFile || !saleId) return;
    setUploadingReceipt(true);
    try {
      const blob = await compressToBlob(receiptFile);
      const form = new FormData();
      form.append("receipt", blob, "comprobante.webp");
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
        className="relative w-full max-w-md mx-auto rounded-t-3xl sm:rounded-3xl bg-background shadow-2xl flex flex-col"
        style={{ maxHeight: "92vh", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Sticky top ─────────────────────────────────────────────────── */}
        <div className="shrink-0">
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

          {/* Step label (solo en paso juego) */}
          {step === "game" && (
            <div className="px-5 pb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-muted-foreground">Selecciona el juego</p>
              {selectedGame && !gameListOpen && (
                <button
                  onClick={() => setGameListOpen(true)}
                  className="text-xs font-bold px-3 py-1 rounded-full border"
                  style={{ color: "hsl(var(--primary))", borderColor: "hsl(var(--primary))" }}>
                  Cambiar ↓
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Scrollable content ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">

          {/* ─── Step: game ────────────────────────────────────────────────── */}
          {step === "game" && (
            <>
              {loadingGames ? (
                <p className="text-center text-sm text-muted-foreground py-6">Cargando juegos...</p>
              ) : games.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">No hay juegos disponibles</p>
              ) : selectedGame && !gameListOpen ? (
                /* Juego seleccionado — vista colapsada */
                <div className="rounded-2xl border p-4"
                  style={{ borderColor: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.06)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm">✅ {selectedGame.title}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {selectedGame.scheduled_at ? new Date(selectedGame.scheduled_at).toLocaleString("es-BO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }) : "—"}
                        </span>
                        <span className="text-xs font-black" style={{ color: "hsl(var(--primary))" }}>
                          Bs {selectedGame.card_price.toFixed(2)} / cartón
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0"
                      style={{ background: selectedGame.status === "active" ? "hsl(142 70% 92%)" : "hsl(210 80% 92%)", color: selectedGame.status === "active" ? "hsl(142 70% 30%)" : "hsl(210 80% 35%)" }}>
                      {selectedGame.status === "active" ? "En vivo" : "Próximo"}
                    </span>
                  </div>
                </div>
              ) : (
                /* Lista completa */
                <div className="space-y-2">
                  {games.map(g => (
                    <button key={g.id}
                      className="w-full text-left rounded-2xl border p-4 transition-colors"
                      style={{
                        borderColor: selectedGame?.id === g.id ? "hsl(var(--primary))" : "hsl(var(--border))",
                        background: selectedGame?.id === g.id ? "hsl(var(--primary) / 0.06)" : "transparent",
                      }}
                      onClick={() => { setSelectedGame(g); setGameListOpen(false); }}>
                      <p className="font-bold text-sm">{g.title}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {g.scheduled_at ? new Date(g.scheduled_at).toLocaleString("es-BO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }) : "—"}
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
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={15}
                    placeholder="Ej: 7654321"
                    value={ciInput}
                    onChange={e => { setCiInput(e.target.value.replace(/\D/g, "")); setTargetUser(null); }}
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
              <button
                disabled={!targetUser || quantity < 1 || purchasing || activatorBalance < final}
                onClick={purchaseWithWallet}
                className="w-full py-2.5 rounded-2xl font-bold text-sm disabled:opacity-40"
                style={{ background: "hsl(var(--muted))", border: "1.5px solid hsl(var(--border))" }}>
                {purchasing ? "Procesando..." : "Pagar con saldo"}
              </button>
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
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-2xl p-3 bg-white shadow-md">
                    <img src={qrImage} alt="QR Enlazo Pay"
                      className="w-52 h-52 object-contain rounded-xl" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Escanea con tu app bancaria o billetera digital
                  </p>
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

              {qrImage && (
                <button
                  onClick={downloadQR}
                  className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
                  style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary) / 0.3)" }}>
                  ⬇️ Descargar código QR
                </button>
              )}

              <button onClick={onClose}
                className="w-full py-3 rounded-2xl font-bold text-sm text-muted-foreground"
                style={{ background: "hsl(var(--muted))" }}>
                Cerrar
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

        {/* ── Footer sticky — botón Continuar (solo paso juego) ───────────── */}
        {step === "game" && (
          <div className="shrink-0 px-5 pb-5 pt-3 border-t"
            style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--background))" }}>
            <button
              disabled={!selectedGame}
              onClick={() => { setGameListOpen(true); setStep("target"); }}
              className="w-full py-3.5 rounded-2xl font-black text-white text-sm disabled:opacity-40"
              style={{ background: "hsl(var(--primary))" }}>
              Continuar →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

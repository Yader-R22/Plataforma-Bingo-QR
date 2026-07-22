import { useState, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetGame } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { toast } from "sonner";
import { useSetLayoutConfig } from "@/components/AppLayout";


const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function drawDateDiffDays(drawDate: string): number {
  const now = new Date();
  const draw = new Date(drawDate);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const drawStart = new Date(draw.getFullYear(), draw.getMonth(), draw.getDate());
  return Math.round((drawStart.getTime() - todayStart.getTime()) / 86400000);
}

function drawDateLabel(drawDate: string): string {
  const d = drawDateDiffDays(drawDate);
  if (d < 0) return "EN ESPERA";
  if (d === 0) return "HOY";
  if (d === 1) return "MAÑANA";
  if (d <= 6) return "ESTA SEMANA";
  if (d <= 13) return "LA OTRA SEMANA";
  return "PRÓXIMO";
}

function drawDateBadgeStyle(drawDate: string): React.CSSProperties {
  if (drawDateDiffDays(drawDate) < 0)
    return { background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)" };
  return { background: "hsl(42 98% 52%)", color: "#1a0050" };
}

function gameModeLabel(mode: string) {
  const map: Record<string, string> = {
    full_card: "Cartón completo",
    horizontal: "Línea horizontal",
    vertical: "Línea vertical",
    diagonal: "Diagonal",
    quina: "Quina (5 en línea)",
  };
  return map[mode] ?? mode;
}

function typeConfig(type: string) {
  if (type === "daily") return { gradient: "var(--grad-daily)", emoji: "🌅" };
  if (type === "weekly") return { gradient: "var(--grad-weekly)", emoji: "🏆" };
  return { gradient: "var(--grad-monthly)", emoji: "👑" };
}

interface Winner {
  id: number;
  user_id: number;
  round: number;
  place: number;
  prize_amount: string;
  user_name: string | null;
  user_department: string | null;
}

// QR Payment modal that shows inline
function QRPaymentModal({
  checkoutId,
  qrImage,
  qrError,
  qty,
  totalPrice,
  gameTitle,
  drawDate,
  onClose,
  onSuccess,
}: {
  checkoutId: string;
  qrImage: string;
  qrError?: string;
  qty: number;
  totalPrice: number;
  gameTitle: string;
  drawDate: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const token = useAuthStore(s => s.token);
  const [payStatus, setPayStatus] = useState<"pending" | "completed" | "failed">("pending");
  const site = useSiteSettings();
  const siteName = site.site_name;
  const siteTagline = site.site_tagline;
  const siteEmoji = site.site_emoji;
  const qrBgUrl = site.qr_background_url ?? null;

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/payments/${checkoutId}/status`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "completed") { setPayStatus("completed"); return true; }
        if (data.status === "failed") { setPayStatus("failed"); return true; }
      }
    } catch {}
    return false;
  }, [checkoutId, token]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let attempts = 0;
      while (!cancelled && attempts < 60) {
        const done = await poll();
        if (done) break;
        await new Promise(r => setTimeout(r, 3000));
        attempts++;
      }
    };
    run();
    return () => { cancelled = true; };
  }, [poll]);

  useEffect(() => {
    if (payStatus === "completed") {
      setTimeout(() => { onSuccess(); }, 2000);
    }
  }, [payStatus]);

  function downloadQR() {
    if (!qrImage) return;

    const W = 480, H = 720;
    const QR = 240;
    const SCALE = 3; // 3× for crisp high-res output

    const qrImg = new Image();
    qrImg.crossOrigin = "anonymous";

    qrImg.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * SCALE;
      canvas.height = H * SCALE;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(SCALE, SCALE);

      function drawContent() {
        // ── Decorative circles (only shown over gradient, not over custom bg) ──
        if (!qrBgUrl) {
          ctx.save();
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(W - 40, 60, 110, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(50, H - 60, 90, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }

        // ── Platform name ──
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "bold 15px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${siteEmoji}  ${siteName.toUpperCase()}`, W / 2, 44);

        // ── Tagline ──
        ctx.fillStyle = "rgba(255,255,255,0.32)";
        ctx.font = "12px sans-serif";
        ctx.fillText(siteTagline, W / 2, 62);

        // ── Game title ──
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px sans-serif";
        wrapText(ctx, gameTitle, W / 2, 96, W - 60, 30);

        // ── Amount ──
        const amountY = 160;
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "14px sans-serif";
        ctx.fillText(`${qty} cartón${qty > 1 ? "es" : ""}`, W / 2, amountY);
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 52px sans-serif";
        ctx.fillText(`Bs ${totalPrice.toFixed(0)}`, W / 2, amountY + 52);

        // ── Divider ──
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, amountY + 70);
        ctx.lineTo(W - 40, amountY + 70);
        ctx.stroke();

        // ── QR white card ──
        const qrCardX = (W - QR - 40) / 2;
        const qrCardY = amountY + 85;
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, qrCardX, qrCardY, QR + 40, QR + 40, 20);
        ctx.fill();

        // QR image centered inside white card
        ctx.drawImage(qrImg, qrCardX + 20, qrCardY + 20, QR, QR);

        // ── Scan instruction ──
        const scanY = qrCardY + QR + 56;
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.font = "13px sans-serif";
        ctx.fillText("Escanea con tu app bancaria o billetera digital", W / 2, scanY);

        // ── Date ──
        const dateStr = new Date(drawDate).toLocaleDateString("es-BO", {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
        });
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = "12px sans-serif";
        ctx.fillText(`Sorteo: ${dateStr}`, W / 2, scanY + 24);

        // ── Footer pill ──
        const pillW = 180, pillH = 32, pillX = (W - pillW) / 2, pillY = H - 52;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        roundRect(ctx, pillX, pillY, pillW, pillH, 16);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "11px sans-serif";
        ctx.fillText(`${siteEmoji}  ${siteName}`, W / 2, pillY + 20);

        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `qr-bingazo-${checkoutId}.png`;
        a.click();
      }

      if (qrBgUrl) {
        // ── Custom background image ──
        const bgImg = new Image();
        bgImg.crossOrigin = "anonymous";
        bgImg.onload = () => {
          // Cover-fit: draw image filling the full canvas
          const imgAspect = bgImg.width / bgImg.height;
          const canvasAspect = W / H;
          let sx = 0, sy = 0, sw = bgImg.width, sh = bgImg.height;
          if (imgAspect > canvasAspect) {
            sw = bgImg.height * canvasAspect;
            sx = (bgImg.width - sw) / 2;
          } else {
            sh = bgImg.width / canvasAspect;
            sy = (bgImg.height - sh) / 2;
          }
          ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, W, H);
          // Dark overlay for readability
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(0, 0, W, H);
          drawContent();
        };
        bgImg.onerror = () => {
          // Fall back to gradient on load error
          const bg = ctx.createLinearGradient(0, 0, 0, H);
          bg.addColorStop(0, "#2d0072");
          bg.addColorStop(1, "#0d001a");
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, W, H);
          drawContent();
        };
        bgImg.src = qrBgUrl;
      } else {
        // ── Default gradient background ──
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, "#2d0072");
        bg.addColorStop(1, "#0d001a");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        drawContent();
      }
    };

    qrImg.src = qrImage;
  }

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
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineH;
      } else { line = test; }
    }
    if (line) ctx.fillText(line, x, y);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div
        className="w-full max-w-md rounded-t-[28px] p-6 pb-8"
        style={{ background: "white", maxHeight: "90vh", overflowY: "auto" }}
      >
        {payStatus === "pending" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>
                Pago con QR
              </h3>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="text-center mb-5">
              <p className="text-sm text-muted-foreground mb-4">
                Escanea este código QR con tu app bancaria o billetera digital para pagar
              </p>
              <div className="inline-block p-4 rounded-2xl border-2" style={{ borderColor: "hsl(var(--primary) / 0.2)" }}>
                {qrImage ? (
                  <img src={qrImage} alt="QR de pago" width={200} height={200} style={{ display: "block" }} />
                ) : qrError ? (
                  <div className="w-[200px] h-[200px] flex flex-col items-center justify-center bg-red-50 rounded-xl p-3 gap-2">
                    <span className="text-2xl">⚠️</span>
                    <p className="text-red-600 text-xs text-center leading-tight">{qrError}</p>
                  </div>
                ) : (
                  <div className="w-[200px] h-[200px] flex items-center justify-center bg-muted rounded-xl text-muted-foreground text-sm">
                    Generando QR...
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-muted-foreground">Esperando confirmación de pago...</span>
              </div>
            </div>

            <div
              className="rounded-xl p-3 mb-4 text-sm flex items-center justify-between"
              style={{ background: "hsl(var(--muted))" }}
            >
              <span className="text-muted-foreground">{qty} cartón{qty > 1 ? "es" : ""}</span>
              <span className="font-black text-lg" style={{ color: "hsl(var(--primary))", fontFamily: "'Poppins', sans-serif" }}>
                Bs {totalPrice.toFixed(0)}
              </span>
            </div>

            <button
              onClick={downloadQR}
              className="w-full py-3 rounded-xl border-2 font-bold text-sm mb-3 flex items-center justify-center gap-2"
              style={{ borderColor: "hsl(var(--primary))", color: "hsl(var(--primary))" }}
            >
              ⬇️ Descargar QR
            </button>

            <p className="text-center text-xs text-muted-foreground">
              Los cartones se activarán automáticamente cuando el pago sea confirmado.
            </p>
          </>
        )}

        {payStatus === "completed" && (
          <div className="text-center py-6">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="font-black text-xl text-green-600 mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
              ¡Pago confirmado!
            </h3>
            <p className="text-muted-foreground text-sm">Tus cartones están activos. ¡Buena suerte!</p>
          </div>
        )}

        {payStatus === "failed" && (
          <div className="text-center py-6">
            <div className="text-6xl mb-4">❌</div>
            <h3 className="font-black text-xl mb-2" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(0 75% 45%)" }}>
              Pago no confirmado
            </h3>
            <p className="text-muted-foreground text-sm mb-4">No se recibió la confirmación. Verifica con tu banco.</p>
            <button onClick={onClose} className="btn-primary">Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Fallback QR Payment Modal ─────────────────────────────────────────────
function FallbackPaymentModal({
  gameId,
  qty,
  totalPrice,
  cardIds,
  token,
  fallbackQrImageUrl,
  supportWhatsapp,
  onClose,
}: {
  gameId: number;
  qty: number;
  totalPrice: number;
  cardIds: number[];
  token: string;
  fallbackQrImageUrl: string | null;
  supportWhatsapp: string | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"scan" | "uploading" | "done" | "error">("scan");
  const [manualRequestId, setManualRequestId] = useState<number | null>(null);
  const [requestStatus, setRequestStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);

  // Poll for approval/rejection after receipt is submitted
  useEffect(() => {
    if (step !== "done" || !manualRequestId) return;
    let cancelled = false;
    async function checkStatus() {
      try {
        const r = await fetch(`${BASE}/api/manual-payments/my`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok || cancelled) return;
        const data: Array<{ id: number; status: string; admin_notes?: string }> = await r.json();
        const found = data.find(d => d.id === manualRequestId);
        if (!found || cancelled) return;
        if (found.status === "approved") {
          setRequestStatus("approved");
        } else if (found.status === "rejected") {
          setRequestStatus("rejected");
          setRejectedReason(found.admin_notes ?? "Sin motivo indicado");
        }
      } catch {}
    }
    checkStatus();
    const interval = setInterval(checkStatus, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [step, manualRequestId, token]);

  const [uploadProgress, setUploadProgress] = useState(0);

  /** Comprime la imagen en canvas y devuelve un Blob listo para subir */
  function compressToBlob(file: File, maxPx = 1200, quality = 0.78): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = ev => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
          canvas.toBlob(b => b ? resolve(b) : reject(new Error("compress failed")), "image/webp", quality);
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStep("uploading");
    setUploadProgress(10);
    try {
      // 1. Comprimir imagen client-side antes de enviar
      const blob = await compressToBlob(file);
      setUploadProgress(35);

      // 2. Subir directamente al servidor (sin presigned URLs, funciona en VPS)
      const form = new FormData();
      form.append("receipt", blob, "comprobante.webp");
      const uploadRes = await fetch(`${BASE}/api/manual-payments/upload-receipt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        toast.error(err.error || "Error al subir el comprobante");
        setStep("scan"); return;
      }
      const { url: receiptUrl } = await uploadRes.json();
      setUploadProgress(65);

      // 3. Crear solicitud de pago manual (con los IDs de cartones)
      let requestId = manualRequestId;
      if (!requestId) {
        const r = await fetch(`${BASE}/api/manual-payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ game_id: gameId, card_ids: cardIds }),
        });
        const data = await r.json();
        if (!r.ok) { toast.error(data.error || "Error al crear solicitud"); setStep("scan"); return; }
        requestId = data.id;
        setManualRequestId(requestId);
      }
      setUploadProgress(85);

      // 4. Adjuntar URL del comprobante a la solicitud
      const rr = await fetch(`${BASE}/api/manual-payments/${requestId}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ receipt_url: receiptUrl }),
      });
      if (!rr.ok) { toast.error("Error al registrar comprobante"); setStep("scan"); return; }

      setUploadProgress(100);
      setStep("done");
      toast.success("✅ Comprobante enviado. El administrador lo revisará pronto.");
    } catch {
      toast.error("Error inesperado al procesar el comprobante");
      setStep("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-t-[28px] p-6 pb-8 bg-white" style={{ maxHeight: "92vh", overflowY: "auto" }}>

        {step !== "done" && (
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>
                💳 Pago Manual con QR
              </h3>
              <p className="text-xs text-muted-foreground">Método alternativo de pago</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}

        {(step === "scan" || step === "uploading" || step === "error") && (
          <>
            {/* Amount summary */}
            <div className="rounded-xl p-3 mb-4 flex items-center justify-between" style={{ background: "hsl(var(--muted))" }}>
              <span className="text-muted-foreground text-sm">{qty} cartón{qty > 1 ? "es" : ""}</span>
              <span className="font-black text-lg" style={{ color: "hsl(var(--primary))", fontFamily: "'Poppins', sans-serif" }}>
                Bs {totalPrice.toFixed(0)}
              </span>
            </div>

            {/* Static QR image */}
            <div className="text-center mb-5">
              {fallbackQrImageUrl ? (
                <>
                  <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                    Escanea este código QR y transfiere exactamente{" "}
                    <span className="font-black px-2 py-0.5 rounded-lg inline-block whitespace-nowrap"
                      style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" }}>
                      Bs {totalPrice.toFixed(0)}
                    </span>
                  </p>
                  <div className="inline-block p-3 rounded-2xl border-2 mb-3" style={{ borderColor: "hsl(var(--primary) / 0.2)" }}>
                    <img src={fallbackQrImageUrl} alt="QR de pago alternativo" style={{ width: 200, height: 200, display: "block", objectFit: "contain" }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Incluye en el detalle: <strong>{qty} cartón{qty > 1 ? "es" : ""} bingo</strong>
                  </p>
                </>
              ) : (
                <div className="rounded-xl p-5 mb-3" style={{ background: "hsl(var(--muted))" }}>
                  <div className="text-3xl mb-2">📞</div>
                  <p className="text-sm font-semibold mb-1">Pago por mensaje</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    No hay QR configurado aún. Contacta al administrador para coordinar el pago.
                  </p>
                  {supportWhatsapp && (
                    <a
                      href={`https://wa.me/${supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, quiero comprar ${qty} cartón${qty > 1 ? "es" : ""} — Bs ${totalPrice.toFixed(0)}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-bold"
                      style={{ background: "#25D366" }}
                    >
                      💬 Contactar por WhatsApp
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Receipt upload */}
            <div className="rounded-xl border-2 border-dashed p-4 mb-4 text-center" style={{ borderColor: "hsl(var(--primary) / 0.3)" }}>
              <div className="text-2xl mb-2">📎</div>
              <p className="text-sm font-semibold mb-1">Subir comprobante de pago</p>
              <p className="text-xs text-muted-foreground mb-3">
                Sube una foto o captura de pantalla que confirme tu pago
              </p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={step === "uploading"}
                  onChange={handleReceiptUpload}
                />
                <span
                  className="inline-block px-5 py-2.5 rounded-xl text-white text-sm font-bold"
                  style={{ background: step === "uploading" ? "hsl(var(--muted))" : "hsl(var(--primary))", cursor: step === "uploading" ? "not-allowed" : "pointer" }}
                >
                  {step === "uploading" ? `Subiendo... ${uploadProgress}%` : "📷 Seleccionar imagen"}
                </span>
              </label>
            </div>

            {step === "error" && (
              <p className="text-red-500 text-xs text-center mb-3">Error al procesar. Intenta nuevamente.</p>
            )}

            <p className="text-center text-xs text-muted-foreground">
              Una vez verificado el pago, el administrador activará tus cartones.
            </p>
          </>
        )}

        {step === "done" && (
          <div className="text-center py-6">
            {requestStatus === "approved" ? (
              <>
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="font-black text-xl mb-2" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(142 70% 35%)" }}>
                  ¡Pago aprobado!
                </h3>
                <p className="text-muted-foreground text-sm mb-6">
                  El administrador verificó tu pago. Tus cartones ya están activos.
                </p>
              </>
            ) : requestStatus === "rejected" ? (
              <>
                <div className="text-6xl mb-4">❌</div>
                <h3 className="font-black text-xl mb-2" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(0 75% 40%)" }}>
                  Pago rechazado
                </h3>
                {rejectedReason && (
                  <div className="rounded-xl p-3 mb-4 text-left" style={{ background: "hsl(0 75% 97%)" }}>
                    <p className="text-red-600 text-sm font-semibold">Motivo:</p>
                    <p className="text-red-500 text-xs mt-1">{rejectedReason}</p>
                  </div>
                )}
                <p className="text-muted-foreground text-sm mb-6">
                  Contacta al administrador para más información.
                </p>
              </>
            ) : (
              <>
                <div className="text-6xl mb-4">✅</div>
                <h3 className="font-black text-xl mb-2" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(142 70% 35%)" }}>
                  ¡Comprobante enviado!
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  El administrador revisará tu pago y activará tus cartones pronto.
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-6">
                  <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: "hsl(42 98% 50%)" }} />
                  Verificando estado...
                </div>
              </>
            )}
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-bold text-white"
              style={{ background: "hsl(var(--primary))" }}
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GameDetailPage() {
  const [, params] = useRoute("/juego/:id");
  const [, navigate] = useLocation();
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  const setUser = useAuthStore(s => s.setUser);
  const site = useSiteSettings();
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [payWith, setPayWith] = useState<"qr" | "wallet">("qr");
  const [qrData, setQrData] = useState<{ checkoutId: string; qrImage: string; qrError?: string } | null>(null);
  const [fallbackData, setFallbackData] = useState<{ cardIds: number[]; gameId: number; qty: number; amount: number } | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);

  const [, paramsWithSlug] = useRoute("/juego/:id/:slug");
  const resolvedParams = paramsWithSlug ?? params;
  const gameId = parseInt(resolvedParams?.id ?? "0");

  const { data: game, isLoading, refetch: refetchGame } = useGetGame(gameId);
  useSetLayoutConfig({ hideTopBar: true }, []);

  // Poll game data every 8s so any admin change (reset, start, finish) is reflected immediately
  useEffect(() => {
    const iv = setInterval(() => { void refetchGame(); }, 8000);
    return () => clearInterval(iv);
  }, []);

  // Refresh user balance from server so wallet display is always current
  useEffect(() => {
    if (!token) return;
    fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUser(data); })
      .catch(() => {});
  }, [token]);

  // Load winners when finished (poll every 8s); clear immediately when status changes away
  useEffect(() => {
    if (game?.status !== "finished") {
      setWinners([]);
      return;
    }
    const load = () => {
      fetch(`${BASE}/api/games/${gameId}/winners`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setWinners(Array.isArray(data) ? data : []))
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [game?.status, gameId]);

  async function handleBuy() {
    if (!user) { navigate("/login"); return; }
    if (user.status !== "active") {
      toast.error("Tu cuenta debe estar verificada para comprar cartones");
      return;
    }
    if (payWith === "wallet" && spendableBalance < (game!.card_price as number) * qty) {
      toast.error(`Saldo insuficiente. Disponible: Bs ${spendableBalance.toFixed(0)}`);
      return;
    }
    setBuying(true);
    try {
      const res = await fetch(`${BASE}/api/cards/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ game_id: gameId, quantity: qty, pay_with_balance: payWith === "wallet" }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al comprar cartones"); return; }

      if (payWith === "wallet") {
        toast.success(`🎉 ${qty} cartón${qty > 1 ? "es" : ""} comprado${qty > 1 ? "s" : ""}. ¡A jugar!`);
        // Refresh balance from server after wallet purchase
        fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d) setUser(d); })
          .catch(() => {});
        // If game is active, go directly to play; otherwise to my-cards
        navigate(isActive ? `/juego/${gameId}/jugar` : "/mis-cartones");
      } else {
        const useFallback = site.fallback_qr_force_enabled || !!data.qr_error;
        if (useFallback) {
          // Show fallback QR (static QR + receipt upload)
          const cardIds: number[] = Array.isArray(data.cards)
            ? data.cards.map((c: { id: number }) => c.id)
            : [];
          setFallbackData({ cardIds, gameId, qty, amount: totalPrice });
        } else {
          // Show Enlazo dynamic QR inline
          setQrData({ checkoutId: data.checkout_id, qrImage: data.qr_image ?? "", qrError: data.qr_error });
        }
      }
    } catch {
      toast.error("Error al procesar la compra");
    } finally {
      setBuying(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-48 rounded-3xl bg-muted animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="text-center py-24 text-muted-foreground">
        <p className="text-5xl">😕</p>
        <p className="mt-3 font-bold">Juego no encontrado</p>
      </div>
    );
  }

  const isActive = game.status === "active";
  const isFinished = game.status === "finished";
  const cfg = typeConfig(game.type);
  const totalPrice = (game.card_price as number) * qty;
  const bonusExpired = user?.bonus_expires_at != null && new Date(user.bonus_expires_at) < new Date();
  const effectiveBonus = bonusExpired ? 0 : (user?.bonus_balance ?? 0);
  const spendableBalance = user ? user.balance + effectiveBonus : 0;
  const canPayWithWallet = user && spendableBalance >= (game.card_price as number);

  const placeLabels: Record<number, string> = { 1: "🥇 1er Lugar", 2: "🥈 2do Lugar", 3: "🥉 3er Lugar" };

  return (
    <>
        <div className="max-w-xl mx-auto">
          {/* Hero banner */}
          {(() => {
            const coverImg = (game as any).cover_image_url as string | null | undefined;
            const heroStyle = coverImg
              ? { backgroundImage: `url(${coverImg})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: cfg.gradient };
            return (
          <div className="relative overflow-hidden stars-bg" style={heroStyle}>
            {coverImg && <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} />}
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full opacity-15" style={{ background: "rgba(255,255,255,0.5)" }} />
            <div className="relative z-10 px-5 py-6">
              <div className="flex items-start justify-between">
                <div>
                  {isActive && <div className="live-badge mb-2"><div className="live-dot" />EN VIVO</div>}
                  {!isActive && !isFinished && (
                    <div className="mb-2 inline-block text-xs font-bold px-3 py-1 rounded-full"
                      style={drawDateBadgeStyle(game.draw_date)}>
                      {drawDateLabel(game.draw_date)}
                    </div>
                  )}
                  {isFinished && (
                    <div className="mb-2 inline-block bg-white/20 text-white/60 text-xs font-bold px-3 py-1 rounded-full">FINALIZADO</div>
                  )}
                  <p className="text-white font-black text-xl leading-tight mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    {game.title}
                  </p>
                  <p className="text-white/80 text-sm">
                    📅 {new Date(game.draw_date).toLocaleString("es-BO", {
                      weekday: "long", day: "numeric", month: "long",
                      hour: "2-digit", minute: "2-digit",
                      timeZone: "America/La_Paz",
                    })}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  {(() => {
                    const isMultiRound = ((game as any).total_rounds ?? 1) > 1;
                    const effectivePrize = isMultiRound
                      ? ((game as any).rounds ?? []).reduce((s: number, r: any) => s + (Number(r.prize_amount) || 0), 0)
                      : Number(game.prize_amount);
                    const prizeType = (game as any).prize_type;
                    if (prizeType === "physical") return (
                      <div className="flex flex-col items-end gap-1">
                        {(game as any).prize_image_url && (
                          <img
                            src={`${BASE}${(game as any).prize_image_url}`}
                            alt={(game as any).prize_physical_name ?? "Premio"}
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                            className="w-16 h-16 rounded-xl object-cover shadow-lg"
                            style={{ border: "2px solid rgba(255,255,255,0.25)" }}
                          />
                        )}
                        <p className="text-white/60 text-xs font-bold">📦 Premio físico</p>
                        {(game as any).prize_physical_name && (
                          <p className="text-white text-xs font-black leading-tight text-right max-w-[120px]" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
                            {(game as any).prize_physical_name}
                          </p>
                        )}
                      </div>
                    );
                    if (prizeType === "mixed") return (
                      <div className="flex flex-col items-end gap-0.5">
                        <p className="font-black text-4xl leading-none prize-text" style={{ fontFamily: "'Poppins', sans-serif" }}>
                          Bs {effectivePrize.toLocaleString("es-BO")}
                        </p>
                        <p className="text-white/60 text-xs mt-0.5">+ Premio físico</p>
                        {(game as any).prize_physical_name && (
                          <p className="text-white/80 text-[10px] font-bold max-w-[120px] text-right leading-tight">📦 {(game as any).prize_physical_name}</p>
                        )}
                      </div>
                    );
                    return (
                      <>
                        <p className="font-black text-4xl leading-none prize-text" style={{ fontFamily: "'Poppins', sans-serif" }}>
                          Bs {effectivePrize.toLocaleString("es-BO")}
                        </p>
                        <p className="text-white/60 text-sm mt-0.5">Premio</p>
                      </>
                    );
                  })()}
                  <p className="text-white/80 text-xs font-semibold mt-1">
                    🎱 {(game as any).total_rounds ?? 1} {((game as any).total_rounds ?? 1) === 1 ? "ronda" : "rondas"}
                  </p>
                </div>
              </div>
            </div>
            {/* Stats strip — integrado al pie del hero */}
            <div className="relative z-10 px-5 pb-5">
              <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)" }}>
                <div className="grid grid-cols-4 divide-x divide-white/10">
                  {(() => {
                    const jugadores = (game as any).unique_participants ?? game.participant_count;
                    const ganadores = (game.max_winners as number) * ((game as any).total_rounds ?? 1);
                    const rondas = (game as any).total_rounds ?? 1;
                    return ([
                      { icon: "💳", label: "Cartón", value: `Bs ${game.card_price as number}` },
                      { icon: "👥", label: jugadores === 1 ? "jugador" : "jugadores", value: `${jugadores}` },
                      { icon: "🏆", label: ganadores === 1 ? "ganador" : "ganadores", value: `${ganadores}` },
                      { icon: "🎱", label: rondas === 1 ? "ronda" : "rondas", value: `${rondas}` },
                    ] as { icon: string; label: string; value: string }[]);
                  })().map(item => (
                    <div key={item.label} className="py-3 px-2 text-center">
                      <p className="text-base leading-none mb-1">{item.icon}</p>
                      <p className="font-black text-sm text-white leading-none">{item.value}</p>
                      <p className="text-[9px] text-white/40 mt-0.5 leading-none">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          );
          })()}

          <div className="px-4 py-4 space-y-4">

            {/* Stream links */}
            {(game.stream_url_youtube || game.stream_url_tiktok || game.stream_url_facebook) && (
              <div>
                <p className="text-xs font-bold mb-2 uppercase tracking-widest text-muted-foreground">📺 Ver en vivo</p>
                <div className="flex gap-2 flex-wrap">
                  {game.stream_url_youtube && (
                    <a href={String(game.stream_url_youtube)} target="_blank" rel="noopener noreferrer">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold" style={{ background: "#FF0000" }}>
                        <span className="inline-flex items-center justify-center shrink-0" style={{ width: 16, height: 16 }}>
                          <svg width="16" height="11" viewBox="0 0 24 17" fill="none" preserveAspectRatio="xMidYMid meet">
                            <path d="M23.495 2.656a3.01 3.01 0 0 0-2.117-2.13C19.483 0 12 0 12 0S4.517 0 2.622.526A3.01 3.01 0 0 0 .505 2.656C0 4.558 0 8.5 0 8.5s0 3.942.505 5.844a3.01 3.01 0 0 0 2.117 2.13C4.517 17 12 17 12 17s7.483 0 9.378-.526a3.01 3.01 0 0 0 2.117-2.13C24 12.442 24 8.5 24 8.5s0-3.942-.505-5.844z" fill="#FF0000"/>
                            <path d="M9.546 12.143V4.857L15.818 8.5l-6.272 3.643z" fill="white"/>
                          </svg>
                        </span>
                        <span className="text-white text-[11px]">YouTube</span>
                      </div>
                    </a>
                  )}
                  {game.stream_url_tiktok && (
                    <a href={game.stream_url_tiktok as string} target="_blank" rel="noopener noreferrer">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold" style={{ background: "#010101" }}>
                        <span className="inline-flex items-center justify-center shrink-0" style={{ width: 16, height: 16 }}>
                          <svg width="14" height="16" viewBox="0 0 24 27" fill="none" preserveAspectRatio="xMidYMid meet">
                            <path d="M17.526 0c.347 3.674 2.65 5.853 6.474 6.107v4.151c-2.213.217-4.15-.51-6.386-1.838v8.14c0 10.34-11.276 13.575-15.8 6.16C-.248 17.78.86 10.82 8.48 10.514v4.374c-.576.094-1.19.237-1.75.429-1.677.57-2.623 1.66-2.356 3.532.516 3.6 7.207 4.67 6.646-2.93V.001h6.506z" fill="white"/>
                          </svg>
                        </span>
                        <span className="text-white text-[11px]">TikTok</span>
                      </div>
                    </a>
                  )}
                  {game.stream_url_facebook && (
                    <a href={game.stream_url_facebook as string} target="_blank" rel="noopener noreferrer">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold" style={{ background: "#1877F2" }}>
                        <span className="inline-flex items-center justify-center shrink-0" style={{ width: 16, height: 16 }}>
                          <svg width="9" height="16" viewBox="0 0 10 19" fill="none" preserveAspectRatio="xMidYMid meet">
                            <path d="M9.293.004L6.974 0C4.368 0 2.686 1.73 2.686 4.41V6.43H.354A.356.356 0 0 0 0 6.787v2.929c0 .197.159.356.354.356H2.686v7.394c0 .197.158.356.353.356H5.98c.195 0 .354-.16.354-.356v-7.394h2.693c.195 0 .354-.16.354-.356l.001-2.929a.357.357 0 0 0-.354-.357H6.334V4.714c0-.823.196-1.24 1.268-1.24H9.293C9.487 3.474 9.647 3.314 9.647 3.118V.36A.356.356 0 0 0 9.293.004z" fill="white"/>
                          </svg>
                        </span>
                        <span className="text-white text-[11px]">Facebook</span>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Play button (active game) — encima de la sección de compra para mayor visibilidad */}
            {isActive && (
              <button className="btn-gold" onClick={() => navigate(`/juego/${gameId}/jugar`)}>
                🎯 Ir a jugar ahora
              </button>
            )}

            {/* Buy section */}
            {!isFinished && (
              <div className="rounded-2xl p-5 space-y-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border) / 0.5)" }}>
                <p className="font-black text-xs uppercase tracking-widest" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(var(--muted-foreground))" }}>
                  🃏 {isActive ? "Comprar Cartones (EN VIVO)" : "Comprar Cartones"}
                </p>

                {/* Cantidad + precio combinados */}
                <div className="rounded-2xl p-4" style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border) / 0.4)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Cantidad</p>
                      <div className="flex items-center gap-0 rounded-xl overflow-hidden border-2" style={{ borderColor: "hsl(var(--primary))" }}>
                        <button className="w-11 h-11 text-xl font-black flex items-center justify-center hover:bg-muted" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                        <span className="w-10 text-center font-black text-lg">{qty}</span>
                        <button className="w-11 h-11 text-xl font-black flex items-center justify-center hover:bg-muted" onClick={() => setQty(q => Math.min(10, q + 1))}>+</button>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground mb-1">Total</p>
                      <p className="font-black text-3xl leading-none" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(var(--primary))" }}>
                        Bs {totalPrice.toFixed(0)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{qty} cartón{qty > 1 ? "es" : ""}</p>
                    </div>
                  </div>
                </div>

                {/* Método de pago */}
                <div>
                  <p className="text-sm font-bold mb-2">Método de pago</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPayWith("qr")}
                      className="py-3 px-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5"
                      style={{
                        border: `1px solid ${payWith === "qr" ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                        background: payWith === "qr" ? "hsl(var(--primary) / 0.12)" : "transparent",
                        color: payWith === "qr" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                      }}
                    >
                      📱 Pagar por QR
                    </button>
                    <button
                      onClick={() => setPayWith("wallet")}
                      disabled={!canPayWithWallet}
                      className="py-3 px-3 rounded-xl text-sm font-bold transition-all flex flex-col items-center justify-center gap-0.5 disabled:opacity-40"
                      style={{
                        border: `1px solid ${payWith === "wallet" ? "hsl(42 98% 52%)" : "hsl(var(--border))"}`,
                        background: payWith === "wallet" ? "hsl(42 98% 52% / 0.12)" : "transparent",
                        color: payWith === "wallet" ? "hsl(42 98% 35%)" : "hsl(var(--muted-foreground))",
                      }}
                    >
                      <span>💰 Mi Saldo</span>
                      {user && <span className="text-xs opacity-70">Bs {spendableBalance.toFixed(0)}</span>}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleBuy}
                  disabled={buying || !user}
                  className="w-full py-4 rounded-2xl font-black text-base disabled:opacity-50 transition-all"
                  style={{
                    fontFamily: "'Poppins', sans-serif",
                    background: buying || !user ? "hsl(var(--muted))" : "linear-gradient(135deg, hsl(42 98% 52%), hsl(38 95% 45%))",
                    color: buying || !user ? "hsl(var(--muted-foreground))" : "#1a0050",
                    boxShadow: buying || !user ? "none" : "0 8px 24px hsl(42 98% 52% / 0.3)",
                  }}
                >
                  {buying ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Procesando...
                    </span>
                  ) : payWith === "wallet" ? "💰 Comprar con Saldo" : "📱 Generar QR de Pago"}
                </button>

                {!user && (
                  <p className="text-xs text-center text-muted-foreground">
                    Debes{" "}
                    <span className="font-bold cursor-pointer" style={{ color: "hsl(var(--primary))" }} onClick={() => navigate("/login")}>
                      iniciar sesión
                    </span>{" "}
                    para comprar cartones
                  </p>
                )}

                <div className="rounded-xl p-3 flex items-start gap-2 text-xs" style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.3)" }}>
                  <span>🔒</span>
                  <span>Los cartones se activan automáticamente al confirmar el pago. Sin pago confirmado, no hay cartón activo.</span>
                </div>
              </div>
            )}


            {/* Finished: winners section */}
            {isFinished && (
              <div className="space-y-4">
                <div className="text-center py-6 text-muted-foreground border rounded-2xl bg-card">
                  <p className="text-5xl mb-3">🏁</p>
                  <p className="font-bold">Este sorteo finalizó</p>
                </div>

                {winners.length > 0 && (() => {
                  // Group by round
                  const rounds = Array.from(new Set(winners.map(w => w.round))).sort((a, b) => a - b);
                  const totalRounds = rounds.length;
                  return (
                    <div className="bg-card border rounded-2xl p-5 space-y-5">
                      <h3 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>
                        🏆 Ganadores del Sorteo
                      </h3>
                      {rounds.map(round => {
                        const roundWinners = winners.filter(w => w.round === round);
                        return (
                          <div key={round}>
                            {totalRounds > 1 && (
                              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
                                ── Ronda {round} ──
                              </p>
                            )}
                            <div className="space-y-3">
                              {roundWinners.map(w => (
                                <div
                                  key={w.id}
                                  className="flex items-center justify-between p-4 rounded-2xl"
                                  style={{
                                    background: w.place === 1
                                      ? "linear-gradient(135deg, hsl(42 98% 52% / 0.15), hsl(38 98% 48% / 0.08))"
                                      : "hsl(var(--muted))",
                                    border: w.place === 1 ? "1px solid hsl(42 98% 52% / 0.4)" : "1px solid hsl(var(--border))",
                                  }}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-2xl">{w.place === 1 ? "🥇" : w.place === 2 ? "🥈" : "🥉"}</span>
                                    <div>
                                      <p className="text-xs text-muted-foreground">
                                        {totalRounds > 1
                                          ? `${placeLabels[w.place] ?? `Lugar ${w.place}`} · Ronda ${round}`
                                          : (placeLabels[w.place] ?? `Lugar ${w.place}`)}
                                      </p>
                                      <p className="font-bold">{w.user_name ?? `Jugador #${w.user_id}`}</p>
                                      {w.user_department && (
                                        <p className="text-xs text-muted-foreground mt-0.5">📍 {w.user_department}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(42 98% 35%)" }}>
                                      Bs {parseFloat(w.prize_amount).toLocaleString("es-BO")}
                                    </p>
                                    <p className="text-xs text-muted-foreground">Premio</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {winners.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    Los ganadores aún no han sido publicados
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      {/* QR Payment modal */}
      {qrData && (
        <QRPaymentModal
          checkoutId={qrData.checkoutId}
          qrImage={qrData.qrImage}
          qrError={qrData.qrError}
          qty={qty}
          totalPrice={totalPrice}
          gameTitle={game?.title ?? "Bingo"}
          drawDate={game?.draw_date ?? new Date().toISOString()}
          onClose={() => setQrData(null)}
          onSuccess={() => { setQrData(null); navigate("/mis-cartones"); }}
        />
      )}
      {/* Fallback QR Payment modal — shown when Enlazo fails or admin forces it */}
      {fallbackData && (
        <FallbackPaymentModal
          gameId={fallbackData.gameId}
          qty={fallbackData.qty}
          totalPrice={fallbackData.amount}
          cardIds={fallbackData.cardIds}
          token={token ?? ""}
          fallbackQrImageUrl={site.fallback_qr_image_url}
          supportWhatsapp={site.support_whatsapp}
          onClose={() => setFallbackData(null)}
        />
      )}
    </>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetGame } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { QRCodeSVG } from "qrcode.react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function drawDateLabel(drawDate: string): string {
  const now = new Date();
  const draw = new Date(drawDate);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const drawStart = new Date(draw.getFullYear(), draw.getMonth(), draw.getDate());
  const diffDays = Math.round((drawStart.getTime() - todayStart.getTime()) / 86400000);
  if (diffDays <= 0) return "HOY";
  if (diffDays === 1) return "MAÑANA";
  if (diffDays <= 6) return "ESTA SEMANA";
  if (diffDays <= 13) return "LA OTRA SEMANA";
  return "PRÓXIMO";
}

function drawDateBadgeStyle(_drawDate: string): React.CSSProperties {
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
  place: number;
  prize_amount: string;
  full_name: string;
}

// QR Payment modal that shows inline
function QRPaymentModal({
  checkoutId,
  checkoutUrl,
  qty,
  totalPrice,
  onClose,
  onSuccess,
}: {
  checkoutId: string;
  checkoutUrl: string;
  qty: number;
  totalPrice: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const token = useAuthStore(s => s.token);
  const [payStatus, setPayStatus] = useState<"pending" | "completed" | "failed">("pending");
  const svgRef = useRef<SVGSVGElement>(null);

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
    const svg = svgRef.current;
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pago-bingazo-${checkoutId}.svg`;
    a.click();
    URL.revokeObjectURL(url);
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
                <QRCodeSVG
                  ref={svgRef}
                  value={checkoutUrl || `https://pagosya.bo/checkout/${checkoutId}`}
                  size={200}
                  level="M"
                  fgColor="#1a0050"
                />
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
                Bs {totalPrice.toFixed(2)}
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

export default function GameDetailPage() {
  const [, params] = useRoute("/juegos/:id");
  const [, navigate] = useLocation();
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  const setUser = useAuthStore(s => s.setUser);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [payWith, setPayWith] = useState<"qr" | "wallet">("qr");
  const [qrData, setQrData] = useState<{ checkoutId: string; checkoutUrl: string } | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);

  const gameId = parseInt(params?.id ?? "0");
  const { data: game, isLoading } = useGetGame(gameId);

  // Refresh user balance from server so wallet display is always current
  useEffect(() => {
    if (!token) return;
    fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUser(data); })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (game?.status === "finished") {
      fetch(`${BASE}/api/games/${gameId}/winners`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setWinners(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [game?.status, gameId]);

  async function handleBuy() {
    if (!user) { navigate("/login"); return; }
    if (user.status !== "active") {
      toast.error("Tu cuenta debe estar verificada para comprar cartones");
      return;
    }
    if (payWith === "wallet" && user.balance < (game!.card_price as number) * qty) {
      toast.error(`Saldo insuficiente. Tu saldo: Bs ${user.balance.toFixed(2)}`);
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
        navigate(isActive ? `/juegos/${gameId}/jugar` : "/mis-cartones");
      } else {
        // Show QR inline
        setQrData({ checkoutId: data.checkout_id, checkoutUrl: data.checkout_url ?? "" });
      }
    } catch {
      toast.error("Error al procesar la compra");
    } finally {
      setBuying(false);
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 space-y-3">
          <div className="h-48 rounded-3xl bg-muted animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!game) {
    return (
      <AppLayout>
        <div className="text-center py-24 text-muted-foreground">
          <p className="text-5xl">😕</p>
          <p className="mt-3 font-bold">Juego no encontrado</p>
        </div>
      </AppLayout>
    );
  }

  const isActive = game.status === "active";
  const isFinished = game.status === "finished";
  const cfg = typeConfig(game.type);
  const totalPrice = (game.card_price as number) * qty;
  const canPayWithWallet = user && user.balance >= (game.card_price as number);

  const placeLabels: Record<number, string> = { 1: "🥇 1er Lugar", 2: "🥈 2do Lugar", 3: "🥉 3er Lugar" };

  return (
    <>
      <AppLayout showBack title={game.title}>
        <div className="max-w-xl mx-auto">
          {/* Hero banner */}
          <div className="relative overflow-hidden stars-bg" style={{ background: cfg.gradient }}>
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full opacity-15" style={{ background: "rgba(255,255,255,0.5)" }} />
            <div className="relative z-10 px-5 py-6">
              <div className="flex items-start justify-between">
                <div>
                  {isActive && <div className="live-badge mb-3"><div className="live-dot" />EN VIVO</div>}
                  {!isActive && !isFinished && (
                    <div className="mb-3 inline-block text-xs font-bold px-3 py-1 rounded-full"
                      style={drawDateBadgeStyle(game.draw_date)}>
                      {drawDateLabel(game.draw_date)}
                    </div>
                  )}
                  {isFinished && (
                    <div className="mb-3 inline-block bg-white/20 text-white/60 text-xs font-bold px-3 py-1 rounded-full">FINALIZADO</div>
                  )}
                  <p className="text-white/80 text-sm">
                    📅 {new Date(game.draw_date).toLocaleDateString("es-BO", {
                      weekday: "long", day: "numeric", month: "long",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="font-black text-4xl leading-none prize-text" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Bs {(game.prize_amount as number).toLocaleString("es-BO")}
                  </p>
                  <p className="text-white/60 text-sm mt-0.5">Premio</p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 space-y-4">
            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: "💳", label: "Precio cartón", value: `Bs ${game.card_price as number}` },
                { icon: "👥", label: "Participantes", value: `${game.participant_count}` },
                { icon: "🎯", label: "Modalidad", value: gameModeLabel(game.game_mode ?? "full_card") },
                { icon: "🏆", label: "Ganadores máx.", value: `${game.max_winners}` },
              ].map(item => (
                <div key={item.label} className="bg-card border rounded-2xl p-4">
                  <span className="text-lg">{item.icon}</span>
                  <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                  <p className="font-black mt-0.5" style={{ color: "hsl(var(--primary))" }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Stream links */}
            {(game.stream_url_youtube || game.stream_url_tiktok || game.stream_url_facebook) && (
              <div className="bg-card border rounded-2xl p-4">
                <p className="font-bold text-sm mb-3">📺 Ver en vivo</p>
                <div className="flex gap-2 flex-wrap">
                  {game.stream_url_youtube && (
                    <a href={String(game.stream_url_youtube)} target="_blank" rel="noopener noreferrer">
                      <div className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-3 py-2 rounded-xl">▶ YouTube</div>
                    </a>
                  )}
                  {game.stream_url_tiktok && (
                    <a href={game.stream_url_tiktok as string} target="_blank" rel="noopener noreferrer">
                      <div className="flex items-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-2 rounded-xl">TikTok</div>
                    </a>
                  )}
                  {game.stream_url_facebook && (
                    <a href={game.stream_url_facebook as string} target="_blank" rel="noopener noreferrer">
                      <div className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-xl">Facebook</div>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Buy section */}
            {!isFinished && (
              <div className="bg-card border rounded-2xl p-5 space-y-4">
                <h3 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  🃏 {isActive ? "Comprar Cartones (EN VIVO)" : "Comprar Cartones"}
                </h3>

                {/* Quantity selector */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 rounded-2xl overflow-hidden border-2" style={{ borderColor: "hsl(var(--primary))" }}>
                    <button className="w-11 h-11 text-xl font-black flex items-center justify-center hover:bg-muted" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                    <span className="w-10 text-center font-black text-lg">{qty}</span>
                    <button className="w-11 h-11 text-xl font-black flex items-center justify-center hover:bg-muted" onClick={() => setQty(q => Math.min(10, q + 1))}>+</button>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(var(--primary))" }}>
                      Bs {totalPrice.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">{qty} cartón{qty > 1 ? "es" : ""}</p>
                  </div>
                </div>

                {/* Payment method selector */}
                <div>
                  <p className="text-sm font-bold mb-2">Método de pago</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPayWith("qr")}
                      className="py-3 px-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-center gap-1.5"
                      style={{
                        borderColor: payWith === "qr" ? "hsl(var(--primary))" : "hsl(var(--border))",
                        background: payWith === "qr" ? "hsl(var(--primary) / 0.08)" : "transparent",
                        color: payWith === "qr" ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                      }}
                    >
                      📱 QR / PagosYa
                    </button>
                    <button
                      onClick={() => setPayWith("wallet")}
                      disabled={!canPayWithWallet}
                      className="py-3 px-3 rounded-xl border-2 text-sm font-bold transition-all flex flex-col items-center justify-center gap-0.5 disabled:opacity-40"
                      style={{
                        borderColor: payWith === "wallet" ? "hsl(42 98% 52%)" : "hsl(var(--border))",
                        background: payWith === "wallet" ? "hsl(42 98% 52% / 0.12)" : "transparent",
                        color: payWith === "wallet" ? "hsl(42 98% 35%)" : "hsl(var(--foreground))",
                      }}
                    >
                      <span>💰 Mi Saldo</span>
                      {user && <span className="text-xs opacity-70">Bs {user.balance.toFixed(2)}</span>}
                    </button>
                  </div>
                </div>

                <button className="btn-primary" onClick={handleBuy} disabled={buying || !user}>
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

            {/* Play button (active game) */}
            {isActive && (
              <button className="btn-gold" onClick={() => navigate(`/juegos/${gameId}/jugar`)}>
                🎯 Ir a jugar ahora
              </button>
            )}

            {/* Finished: winners section */}
            {isFinished && (
              <div className="space-y-4">
                <div className="text-center py-6 text-muted-foreground border rounded-2xl bg-card">
                  <p className="text-5xl mb-3">🏁</p>
                  <p className="font-bold">Este sorteo finalizó</p>
                </div>

                {winners.length > 0 && (
                  <div className="bg-card border rounded-2xl p-5">
                    <h3 className="font-black text-lg mb-4" style={{ fontFamily: "'Poppins', sans-serif" }}>
                      🏆 Ganadores del Sorteo
                    </h3>
                    <div className="space-y-3">
                      {winners.map(w => (
                        <div
                          key={w.id}
                          className="flex items-center justify-between p-4 rounded-2xl"
                          style={{
                            background: w.place === 1
                              ? "linear-gradient(135deg, hsl(42 98% 52% / 0.15), hsl(38 98% 48% / 0.08))"
                              : w.place === 2
                              ? "hsl(var(--muted))"
                              : "hsl(var(--muted))",
                            border: w.place === 1 ? "1px solid hsl(42 98% 52% / 0.4)" : "1px solid hsl(var(--border))",
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{w.place === 1 ? "🥇" : w.place === 2 ? "🥈" : "🥉"}</span>
                            <div>
                              <p className="text-xs text-muted-foreground">{placeLabels[w.place] ?? `Lugar ${w.place}`}</p>
                              <p className="font-bold">{w.full_name}</p>
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
                )}

                {winners.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    Los ganadores aún no han sido publicados
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </AppLayout>

      {/* QR Payment modal */}
      {qrData && (
        <QRPaymentModal
          checkoutId={qrData.checkoutId}
          checkoutUrl={qrData.checkoutUrl}
          qty={qty}
          totalPrice={totalPrice}
          onClose={() => setQrData(null)}
          onSuccess={() => { setQrData(null); navigate("/mis-cartones"); }}
        />
      )}
    </>
  );
}

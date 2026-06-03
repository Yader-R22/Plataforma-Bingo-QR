import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetGame } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/useAuth";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

export default function GameDetailPage() {
  const [, params] = useRoute("/juegos/:id");
  const [, navigate] = useLocation();
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);

  const gameId = parseInt(params?.id ?? "0");
  const { data: game, isLoading } = useGetGame(gameId);

  async function handleBuy() {
    if (!user) { navigate("/login"); return; }
    if (user.status !== "active") {
      toast.error("Tu cuenta debe estar verificada para comprar cartones");
      return;
    }
    setBuying(true);
    try {
      const res = await fetch(`${BASE}/api/cards/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ game_id: gameId, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Error al comprar cartones"); return; }
      if (data.checkout_url) window.open(data.checkout_url, "_blank");
      toast.success(`${qty} cartón${qty > 1 ? "es" : ""} creado${qty > 1 ? "s" : ""}. Completa el pago para activarlos.`);
      navigate(`/pago/${data.checkout_id}`);
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

  return (
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
                  <div className="mb-3 inline-block bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                    PRÓXIMO SORTEO
                  </div>
                )}
                {isFinished && (
                  <div className="mb-3 inline-block bg-white/20 text-white/60 text-xs font-bold px-3 py-1 rounded-full">
                    FINALIZADO
                  </div>
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
              { icon: "🎯", label: "Modalidad", value: gameModeLabel(game.game_mode) },
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
                  <a href={game.stream_url_youtube as string} target="_blank" rel="noopener noreferrer">
                    <div className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-3 py-2 rounded-xl">
                      ▶ YouTube
                    </div>
                  </a>
                )}
                {game.stream_url_tiktok && (
                  <a href={game.stream_url_tiktok as string} target="_blank" rel="noopener noreferrer">
                    <div className="flex items-center gap-1.5 bg-black text-white text-xs font-bold px-3 py-2 rounded-xl">
                      TikTok
                    </div>
                  </a>
                )}
                {game.stream_url_facebook && (
                  <a href={game.stream_url_facebook as string} target="_blank" rel="noopener noreferrer">
                    <div className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-xl">
                      Facebook
                    </div>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Buy section */}
          {!isFinished && !isActive && (
            <div className="bg-card border rounded-2xl p-5 space-y-4">
              <h3 className="font-black text-lg" style={{ fontFamily: "'Poppins', sans-serif" }}>
                🃏 Comprar Cartones
              </h3>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 rounded-2xl overflow-hidden border-2" style={{ borderColor: "hsl(var(--primary))" }}>
                  <button
                    className="w-11 h-11 text-xl font-black flex items-center justify-center transition-colors hover:bg-muted"
                    onClick={() => setQty(q => Math.max(1, q - 1))}
                  >−</button>
                  <span className="w-10 text-center font-black text-lg">{qty}</span>
                  <button
                    className="w-11 h-11 text-xl font-black flex items-center justify-center transition-colors hover:bg-muted"
                    onClick={() => setQty(q => Math.min(10, q + 1))}
                  >+</button>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black" style={{ fontFamily: "'Poppins', sans-serif", color: "hsl(var(--primary))" }}>
                    Bs {totalPrice.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">{qty} cartón{qty > 1 ? "es" : ""}</p>
                </div>
              </div>

              <button className="btn-primary" onClick={handleBuy} disabled={buying || !user}>
                {buying ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Procesando...
                  </span>
                ) : "💳 Pagar con QR / PagosYa"}
              </button>

              {!user && (
                <p className="text-xs text-center text-muted-foreground">
                  Debes{" "}
                  <span
                    className="font-bold cursor-pointer"
                    style={{ color: "hsl(var(--primary))" }}
                    onClick={() => navigate("/login")}
                  >iniciar sesión</span>{" "}
                  para comprar cartones
                </p>
              )}

              <div
                className="rounded-xl p-3 flex items-start gap-2 text-xs"
                style={{ background: "hsl(42 98% 52% / 0.1)", border: "1px solid hsl(42 98% 52% / 0.3)" }}
              >
                <span>🔒</span>
                <span>Pago seguro via PagosYa. Los cartones se activan automáticamente al confirmar el pago.</span>
              </div>
            </div>
          )}

          {/* Play button (active game) */}
          {isActive && (
            <div className="space-y-3">
              <button
                className="btn-gold"
                onClick={() => navigate(`/juegos/${gameId}/jugar`)}
              >
                🎯 Ir a jugar ahora
              </button>
            </div>
          )}

          {isFinished && (
            <div className="text-center py-10 text-muted-foreground">
              <p className="text-5xl mb-3">🏁</p>
              <p className="font-bold">Este sorteo ya finalizó</p>
              <p className="text-sm mt-1">Los resultados están disponibles en el historial</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
